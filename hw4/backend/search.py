"""Typo- and synonym-tolerant query normalisation for catalogue search.

`plan_search(q, color)` turns a shopper's raw text into a SearchPlan:
  - lowercase, punctuation stripped, multi-word synonyms joined ("t shirt" -> t-shirt),
  - garment synonyms ("tee" -> t-shirt, "hoody" -> hoodie),
  - plurals singularised ("hoodies" -> hoodie),
  - unknown words spell-corrected against a vocabulary built from the catalogue
    (difflib.get_close_matches, cutoff 0.75: "hooddies" -> hoodie, "yael" -> yale),
  - shopper color words mapped to catalogue colors ("pink" -> coral) and lifted out
    of the text into a color filter.
Used by main.search_products, so the Products page and the agent's search_catalogue
tool get the same behaviour. Pure Python; the vocabulary is cached and rebuilt only
when the database file changes.
"""

from __future__ import annotations

import difflib
import json
import re
import sqlite3
import threading
from contextlib import closing
from dataclasses import dataclass, field
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "campus_customs.db"

CUTOFF = 0.75

# Catalogue colors: navy, white, gray, red, black, blue, charcoal, yellow, cream, gold,
# green, light blue, coral, multicolor. Shopper word -> catalogue color.
COLOR_SYNONYMS: dict[str, str] = {
    # coral
    "pink": "coral", "salmon": "coral", "peach": "coral", "rose": "coral",
    # gray
    "grey": "gray", "heather": "gray", "silver": "gray",
    "light gray": "gray", "light grey": "gray", "heather gray": "gray", "heather grey": "gray",
    # cream
    "beige": "cream", "ivory": "cream", "tan": "cream", "off-white": "cream",
    "off white": "cream", "offwhite": "cream",
    # red
    "maroon": "red", "burgundy": "red", "crimson": "red",
    # navy
    "dark blue": "navy", "midnight": "navy", "navy blue": "navy",
    # light blue
    "sky": "light blue", "sky blue": "light blue", "baby blue": "light blue",
    "light blue": "light blue",
    # yellow / gold
    "mustard": "yellow",
    # green
    "olive": "green", "forest": "green", "forest green": "green",
    # charcoal
    "dark gray": "charcoal", "dark grey": "charcoal", "graphite": "charcoal",
    # misc
    "multi": "multicolor", "multicolored": "multicolor", "multicolour": "multicolor",
}
CATALOGUE_COLORS = (
    "navy", "white", "gray", "red", "black", "blue", "charcoal", "yellow", "cream",
    "gold", "green", "light blue", "coral", "multicolor",
)

# Garment / spelling synonyms (applied to single words or joined phrases).
TERM_SYNONYMS: dict[str, str] = {
    "tee": "t-shirt", "tees": "t-shirt", "tshirt": "t-shirt", "tshirts": "t-shirt",
    "t shirt": "t-shirt", "t shirts": "t-shirt", "t-shirts": "t-shirt",
    "hoody": "hoodie", "hoodies": "hoodie",
    "crew neck": "crewneck", "crew-neck": "crewneck",
    "sweat shirt": "sweatshirt", "sweat-shirt": "sweatshirt",
    "mock neck": "mockneck", "mock-neck": "mockneck",
    "quarter zip": "quarter-zip", "quarterzip": "quarter-zip", "1/4 zip": "quarter-zip",
    "full zip": "full-zip", "fullzip": "full-zip",
}

# Multi-word phrases, longest first, so "heather gray" wins over "heather".
_PHRASES = sorted(
    [p for p in {**COLOR_SYNONYMS, **TERM_SYNONYMS} if " " in p or "/" in p]
    + [c for c in CATALOGUE_COLORS if " " in c],
    key=len,
    reverse=True,
)
_TOKEN_RE = re.compile(r"[a-z0-9]+(?:[-/][a-z0-9]+)*")


@dataclass
class SearchPlan:
    terms: list[str]  # corrected words; every one must match (substring)
    color: str | None  # catalogue color to filter on, or None
    corrections: dict[str, str] = field(default_factory=dict)  # typed -> used
    corrected_q: str = ""  # display string of what was actually searched
    words: list[str] = field(default_factory=list)  # corrected words incl. colors


class _Vocab:
    def __init__(self) -> None:
        self.mtime: float | None = None
        self.words: frozenset[str] = frozenset()
        self.blob = ""
        self.by_len: dict[int, list[str]] = {}
        self.lock = threading.Lock()

    def get(self) -> _Vocab:
        try:
            mtime = DB_PATH.stat().st_mtime
        except OSError:
            return self
        if mtime != self.mtime:
            with self.lock:
                if mtime != self.mtime:
                    self._build()
                    self.mtime = mtime
        return self

    def _build(self) -> None:
        uri = f"file:{DB_PATH}?mode=ro"
        with closing(sqlite3.connect(uri, uri=True)) as conn:
            rows = conn.execute(
                "SELECT name, garment_type, colors, search_tags, description FROM catalogue"
            ).fetchall()
        texts: list[str] = []
        for name, gtype, colors, tags, desc in rows:
            parts = [name, gtype, desc]
            for raw in (colors, tags):
                try:
                    parts.extend(str(x) for x in json.loads(raw))
                except (TypeError, ValueError):
                    parts.append(str(raw))
            texts.append(" ".join(p for p in parts if p).lower())
        self.blob = "\n".join(texts)
        words = set(_TOKEN_RE.findall(self.blob))
        # Also index the pieces of hyphenated words ("t-shirt" -> "shirt").
        for w in list(words):
            if "-" in w or "/" in w:
                words.update(re.split(r"[-/]", w))
        words = {w for w in words if len(w) > 2 and not w.isdigit()}
        words.update(CATALOGUE_COLORS)
        words.update(k for k in COLOR_SYNONYMS if " " not in k)
        self.words = frozenset(words)
        by_len: dict[int, list[str]] = {}
        for w in sorted(words):
            by_len.setdefault(len(w), []).append(w)
        self.by_len = by_len


_VOCAB = _Vocab()


def _singular(word: str, vocab: frozenset[str]) -> str:
    if len(word) <= 3 or not word.endswith("s") or word.endswith("ss"):
        return word
    candidates = [word[:-1]]
    if word.endswith("es"):
        candidates.append(word[:-2])
    if word.endswith("ies"):
        candidates.append(word[:-3] + "y")
    for c in candidates:
        if c in vocab:
            return c
    return word


def _closest(word: str, v: _Vocab) -> str | None:
    # Only compare against words of similar length: same result, far fewer comparisons.
    pool: list[str] = []
    for n in range(max(3, len(word) - 2), len(word) + 3):
        pool.extend(v.by_len.get(n, ()))
    match = difflib.get_close_matches(word, pool, n=1, cutoff=CUTOFF)
    return match[0] if match else None


def _canon_color(word: str) -> str | None:
    if word in CATALOGUE_COLORS:
        return word
    return COLOR_SYNONYMS.get(word)


def normalize_color(color: str | None) -> str | None:
    """Map a shopper color (synonym or typo) to a catalogue color; unknown -> as given."""
    if not color or not color.strip():
        return None
    c = re.sub(r"\s+", " ", color.strip().lower())
    found = _canon_color(c)
    if found:
        return found
    pool = list(CATALOGUE_COLORS) + list(COLOR_SYNONYMS)
    match = difflib.get_close_matches(c, pool, n=1, cutoff=CUTOFF)
    return _canon_color(match[0]) if match else color.strip()


def _tokenize(q: str) -> list[str]:
    text = q.lower().replace("’", "'").replace("'", "")
    text = re.sub(r"[^a-z0-9/\-\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Join known multi-word phrases into one token (spaces -> \x00 placeholder).
    for phrase in _PHRASES:
        text = re.sub(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", phrase.replace(" ", "\x00"), text)
    tokens = []
    for raw in text.split(" "):
        raw = raw.strip("-/")
        if raw:
            tokens.append(raw.replace("\x00", " "))
    return tokens


def plan_search(q: str | None, color: str | None = None) -> SearchPlan:
    """Normalise a query. An explicit `color` param always wins over color words in q."""
    v = _VOCAB.get()
    explicit = normalize_color(color)
    corrections: dict[str, str] = {}
    if explicit and color and explicit != color.strip().lower():
        corrections[color.strip()] = explicit
    terms: list[str] = []
    display: list[str] = []
    plan_color = explicit

    for tok in _tokenize(q or ""):
        word = tok
        # 1. Synonyms (garments) and colors.
        if word in TERM_SYNONYMS:
            word = TERM_SYNONYMS[word]
        col = _canon_color(word)
        if col is None and len(word) > 2 and word not in v.words and word not in v.blob:
            # 2. Spell-correct unknown words (incl. color typos like "nvy").
            fixed = _closest(word, v)
            if fixed:
                fixed = TERM_SYNONYMS.get(fixed, fixed)
                word = _singular(fixed, v.words)
                col = _canon_color(word)
        else:
            word = _singular(word, v.words)
            word = TERM_SYNONYMS.get(word, word)

        if col is not None:
            if tok not in CATALOGUE_COLORS:
                corrections[tok] = col
            display.append(col)
            if plan_color is None:
                plan_color = col
            elif col != plan_color and not explicit:
                terms.append(col)  # a second, different color stays a text term
            continue

        if word != tok and _singular(tok, v.words) != word:
            corrections[tok] = word  # don't report plain plural -> singular as a fix
        terms.append(word)
        display.append(word)

    return SearchPlan(
        terms=terms,
        color=plan_color,
        corrections=corrections,
        corrected_q=" ".join(display),
        words=display,
    )


def normalize_query(q: str | None) -> list[str]:
    """Corrected search words for q (color words included, mapped to catalogue colors)."""
    return plan_search(q).words if q else []
