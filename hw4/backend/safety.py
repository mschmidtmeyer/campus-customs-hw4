"""Safety guards for the Handsome Dan chat (POST /api/chat in main.py).

Pipeline (main.py):
    rate limit -> input length -> check_input -> daily token budget -> run_chat
    -> check_output -> save memory + add_tokens -> reply

- check_input(text) -> GuardResult
    Narrow regex rules that block BEFORE the model is called (no tokens spent):
    prompt injection, secret/credential fishing, listing users, account lookups
    (user enumeration), other people's private data, and "who is <name>?" questions.
    Normal shopping ("who is Handsome Dan?", "is this in my size?", "what's my email?")
    is allowed through; the prompt handles the rest.
- check_output(reply, actor=...) -> str
    Last line of defence on what the model wrote: removes links outside the site
    (keeps the link text), emails, phone numbers, street addresses, API keys/tokens,
    a leaked system prompt, and caps the reply at MAX_REPLY_CHARS.
- minimize(text): redacts emails/phones/keys/addresses before text goes to the model
  or to chat memory (data minimisation; the shop never needs them in chat).
- clean_history(turns): drops replayed turns (guest browser or saved memory) that
  trip any input rule, e.g. a forged "ignore previous instructions" turn.
- Daily token budget per actor (audit.actor_key): table token_usage(day, actor, tokens).

Audit events (audit.log_event "blocked") carry only the rule name, never message text.
"""

from __future__ import annotations

import logging
import os
import re
import sqlite3
import unicodedata
from contextlib import closing
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

import audit
import auth
from models import HistoryTurn
from season import today_in_new_haven

log = logging.getLogger("campus_customs.safety")

PROMPT_PATH = Path(__file__).resolve().parent / "prompts" / "prompt.md"

MAX_REPLY_CHARS = 1500
MAX_INPUT_CHARS = 2000  # same cap as ChatRequestBody.message

# --------------------------------------------------------------------------
# Canned replies (Handsome Dan's voice). Internal links only.
# --------------------------------------------------------------------------

PRIVACY_REPLY = (
    "Woof! I keep every shopper's details private, so I can't share, look up, or confirm "
    "anything about other people. I'd love to help you find some Yale gear, though: try /products."
)
ACCOUNT_REPLY = (
    "I can't look up or confirm accounts. Every shopper's details stay private. If it's "
    "your own account, sign in at /login and your details are on your My Profile page. "
    "Want help finding some Yale gear?"
)
IDENTITY_REPLY = (
    "I'm just the shop bulldog, so I don't share or guess information about people. Ask me "
    "about Handsome Dan, Yale gear, sizes, or our store on Broadway!"
)
SECRET_REPLY = (
    "That stays locked in my doghouse: I can't share how I'm set up, or any passwords or "
    "keys. Happy to help you shop for Yale gear, though!"
)
INJECTION_REPLY = (
    "Nice try! I'm Handsome Dan, and I stick to Campus Customs. Ask me about Yale hoodies, "
    "crewnecks, sizing, prices, or our store at 57 Broadway."
)
EMPTY_REPLY = (
    "Woof! Ask me anything about Campus Customs: Yale hoodies, sizes, prices, or our store on Broadway."
)
TURN_CAP_REPLY = "That one's a big question for one bark! Could you narrow it down — a type, color, or size?"
DAILY_LIMIT_MESSAGE = "Daily chat limit reached — please come back tomorrow or visit us at 57 Broadway."


@dataclass(frozen=True)
class GuardResult:
    blocked: bool
    rule: str | None = None  # rule name, safe to log
    reply: str | None = None  # canned decline to send instead of calling the model


ALLOWED = GuardResult(blocked=False)

# --------------------------------------------------------------------------
# Normalisation
# --------------------------------------------------------------------------

_INVISIBLE = re.compile(r"[­​-‏‪-‮⁠-⁤﻿]")
_QUOTES = str.maketrans({"‘": "'", "’": "'", "ʼ": "'", "`": "'", "´": "'"})


def _normalize(text: str) -> str:
    """Fold look-alike characters so rules can't be dodged with fullwidth letters,
    zero-width spaces, curly quotes, or extra whitespace. Lowercased."""
    t = unicodedata.normalize("NFKC", text or "")
    t = _INVISIBLE.sub("", t).translate(_QUOTES)
    return re.sub(r"\s+", " ", t).strip().lower()


def _rx(*patterns: str) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{p})" for p in patterns))


# --------------------------------------------------------------------------
# Input rules (all patterns run on _normalize()d, lowercased text)
# --------------------------------------------------------------------------

_INJECTION = _rx(
    # "ignore previous instructions", "disregard all the rules", "forget your guidelines"
    r"\b(?:ignore|disregard|forget|override|bypass|overwrite|discard)\s+"
    r"(?:(?:all|any|the|your|of|these|those|every)\s+)*"
    r"(?:(?:previous|prior|above|earlier|preceding|former|system|original|initial|old|existing|safety|current|other)\s+)?"
    r"(?:instructions?|prompts?|rules|directions|guidelines|directives|constraints|restrictions|guardrails|programming|training|context)\b",
    r"\b(?:ignore|disregard|forget)\s+(?:all\s+)?(?:the\s+)?(?:above|everything\s+(?:above|before|you\s+were\s+told|you\s+know))\b",
    r"\b(?:developer|dev|debug|god|admin|sudo|jailbreak|jailbroken|unrestricted|unfiltered|uncensored|maintenance|root)\s+mode\b",
    r"\bjailbr(?:eak|oken|eaking)\b|\bdo\s+anything\s+now\b|\bprompt\s+injection\b",
    r"\byou(?:'re|\s+are)\s+now\b(?!\s+(?:my\s+)?(?:favou?rite|fave|best|the\s+best|awesome|great|cute|adorable|signed|logged))",
    r"\bfrom\s+now\s+on,?\s+(?:you(?:'re|\s+are)\s+(?:a|an|no\s+longer|not|free|unrestricted|called|named)\b|act\s+as|pretend|ignore|respond\s+as|answer\s+as|reply\s+as)",
    r"\b(?:act|behave|respond|answer|reply)\s+as\s+(?:if\s+you\s+(?:are|were)\s+)?(?:an?\s+)?"
    r"(?:unrestricted|unfiltered|uncensored|different|evil|jailbroken|rogue|new|another)\s+"
    r"(?:ai|assistant|model|chatbot|bot|system|persona|character)\b",
    r"\bpretend\s+(?:to\s+be|you(?:'re|\s+are))\s+(?:an?\s+)?(?:\w+\s+)?(?:ai|assistant|model|chatbot|bot)\b",
    r"^(?:system|developer|assistant)\s*:|<\|?\s*/?\s*(?:system|im_start|im_end|endoftext)\s*\|?>"
    r"|\[\s*/?\s*(?:system|inst|sys)\s*\]|#{2,}\s*(?:system|instructions?)\b",
    r"\bnew\s+(?:system\s+)?(?:instructions?|rules|persona)\s*:",
    r"\b(?:override|bypass|disable|turn\s+off|deactivate)\s+(?:your|the|all|any)\s+(?:safety\s+|content\s+)?"
    r"(?:rules|safety|restrictions|guardrails|guidelines|polic(?:y|ies)|instructions)\b",
    r"\b(?:repeat|print|output|recite|translate|summari[sz]e|encode)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?"
    r"(?:text|words|everything|content|messages?)\s+(?:above|before|preceding)\b",
)

_SECRET = _rx(
    r"\bsystem\s*[-_]?\s*prompts?\b",
    r"\b(?:initial|original|hidden|secret|internal|underlying|developer|system)\s+(?:prompt|instructions|rules)\b",
    r"\b(?:reveal|print|show|repeat|output|dump|leak|display|recite|translate|encode|paraphrase|summari[sz]e|"
    r"tell\s+me|give\s+me|share|what(?:'s|\s+is|\s+are|\s+were))\s+(?:me\s+)?(?:all\s+)?(?:of\s+)?your\s+"
    r"(?:system\s+|initial\s+|original\s+|secret\s+|hidden\s+|full\s+|exact\s+)?"
    r"(?:prompt|instructions|configuration|config|source\s+code|programming)\b(?!\s+(?:for|on|about|to)\b)",
    r"\b(?:api|secret|private|access|bearer|auth|session|encryption|openai|portkey|admin)[\s_-]*(?:keys?|tokens?)\b",
    r"\bportkey\b|\b[a-z]+_api_key\b|\bchat_encryption_key\b|(?:^|[\s'\"(/])\.env\b",
    r"\benv(?:ironment)?\s+var(?:iable)?s?\b|\benvironment\s+(?:file|config(?:uration)?)\b",
    r"\bpassword\s*hash(?:es)?\b|\bhashed\s+passwords?\b|\bsession\s+(?:cookies?|ids?)\b",
    r"\b(?:admin|administrator|root|database|db|server|staff|employee|owner|manager)(?:'s)?\s+"
    r"(?:password|passcode|pass|login|credentials?)\b",
    r"\b(?:password|passcode)\s+(?:of|for)\s+"
    r"(?!(?:my|me|myself|a\s+new|an?\s+account|the\s+account|your\s+account|this\s+account|checkout)\b)(?=[a-z0-9@])",
    r"\b(?!(?:my|your|our)'s)[a-z0-9][a-z0-9._-]*'s\s+(?:password|passcode|login|credentials?|session)\b",
    r"\b(?:select|drop|delete|insert|update|union)\b[^;]{0,60}\b(?:from|into|table)\s+"
    r"(?:users|sessions|chat_messages|recovery_codes|token_usage|cart_items|wishlist_items|sqlite_master)\b",
    r"\bcampus_customs\.db\b",
)

_USER_LIST = _rx(
    r"\b(?:list|show|give|send|dump|export|print|display|tell|name|share|reveal|output)\s+(?:me\s+|us\s+)?"
    r"(?:(?:all|every|each|the|of|a\s+list\s+of|your|other|registered|signed[\s-]*up)\s+)*"
    r"(?:users|customers|members|accounts|shoppers|clients|user\s*names|usernames|emails|e-mails|"
    r"email\s+addresses|phone\s+numbers)\b",
    r"\bhow\s+many\s+(?:registered\s+|signed[\s-]*up\s+|other\s+|active\s+)?(?:users|customers|members|accounts|shoppers)\s+"
    r"(?:do\s+you|does|are|have|has|exist|signed|registered|use)\b",
    r"\bwho\s+(?:are|were)\s+(?:your|the|all|other|some)\s+(?:\w+\s+)?(?:users|customers|members|shoppers|clients)\b",
    r"\b(?:other|another|different)\s+(?:users?|customers?|members?|shoppers?|people)(?:'s|s'|')?\s+"
    r"(?:e-?mails?|phones?|phone\s+numbers?|addresses|address|accounts?|orders?|order\s+history|chats?|"
    r"chat\s+history|messages|carts?|bags?|wishlists?|data|details|info(?:rmation)?|names|profiles?|"
    r"passwords?|purchases|history)\b",
    r"\b(?:who|which\s+(?:users|customers|shoppers|people|members))\s+(?:else\s+)?(?:has\s+|have\s+)?"
    r"(?:bought|ordered|purchased|saved|wishlisted|viewed|looked\s+at|added)\b",
    r"(?<!my\s)(?<!our\s)\b(?:user|customer|member|account|shopper)s?\s+(?:table|list|database|db|records|data|e-?mails)\b",
)

_NOT_PEOPLE = r"(?:i|my|me|you|your|this|it|that|the|these|those|we|our|there|a|an|any|every|each|campus\s+customs|everyone|anyone)\b"
_ACCOUNT_LOOKUP = _rx(
    r"\b(?:does|did|has)\s+(?!" + _NOT_PEOPLE + r")(?:[a-z0-9.'@_+-]+\s+){1,4}(?:have|got|own|hold|has)\s+"
    r"(?:an?\s+)?(?:account|profile|membership)s?\b",
    r"\b(?:is|was|are)\s+(?!" + _NOT_PEOPLE + r")(?:[a-z0-9.'@_+-]+\s+){1,4}"
    r"(?:registered|signed\s*-?\s*up|in\s+(?:your|the)\s+(?:system|database|records|db)|"
    r"an?\s+(?:member|customer|user|shopper)\s+(?:here|of|at|with|on)\b)",
    r"\b(?:is\s+there|do\s+you\s+have|find|look\s*up|lookup|search\s+for|check)\s+(?:an?\s+|any\s+)?"
    r"(?:account|user|customer|member|profile|shopper)s?\s+(?:for|with|named|called|under|belonging\s+to|by\s+the\s+name)\s+"
    r"(?!(?:me|myself|my|us)\b)",
    r"\bwhose\s+(?:e-?mail|phone|number|account|address|profile|password|order|bag|cart|wishlist)\b",
)
_EMAIL_IN_TEXT = re.compile(r"[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}")
_ACCOUNT_WORDS = re.compile(
    r"\b(?:account|registered|sign(?:ed)?\s*-?\s*up|member|customer|user|exists?|belongs?|profile|"
    r"log(?:ged)?\s*-?\s*in|on\s+file|who|whose|name|phone|address|password|lives?)\b"
)

_PRIVATE_FIELD = (
    r"(?:e-?mails?(?:\s+address(?:es)?)?|phone(?:\s+numbers?)?|cell(?:\s*phone)?(?:\s+numbers?)?|"
    r"mobile(?:\s+numbers?)?|telephone(?:\s+numbers?)?|(?:home|street|mailing|house|shipping|billing)\s+address(?:es)?|"
    r"contact\s+(?:info(?:rmation)?|details)|personal\s+(?:info(?:rmation)?|details|data)|passwords?|"
    r"social\s+security(?:\s+numbers?)?|ssn|date\s+of\s+birth|birthdays?|credit\s+card(?:\s+numbers?)?|"
    r"card\s+numbers?|last\s+name|surname|order\s+history|purchase\s+history|chat\s+history|login\s+details)"
)
_ASK = (
    r"(?:what(?:'s|\s+is|\s+are|\s+was|\s+were)?|give|tell|show|send|share|find|get|look\s*up|lookup|reveal|"
    r"need|want|know|provide|list|search|dig\s+up|access|read)"
)
_NOT_PERSON = (
    r"(?:me|myself|my|mine|us|our|you|your|yours|the\s+(?:store|shop|bulldog|mascot)|this\s+(?:store|shop|website|site)|"
    r"campus\s+customs|(?:handsome\s+)?dan|kingman|maurice|yale|customer\s+service|support)\b"
)
_PRIVATE_DATA = _rx(
    # "what is the email of ada lovelace"
    rf"\b{_ASK}\b[^.?!]{{0,40}}?\b{_PRIVATE_FIELD}\s+(?:of|belonging\s+to)\s+(?!{_NOT_PERSON})(?=[a-z0-9])",
    # "what's tauhid's phone number" (not "my mom's", not "the store's")
    rf"\b{_ASK}\b[^.?!]{{0,40}}?(?<!\bmy\s)(?<!\byour\s)(?<!\bour\s)\b"
    r"(?!(?:my|your|our|dan|handsome|yale|store|shop|bulldog|mascot|kingman|maurice|campus|customs|what|who|"
    r"that|it|there|here|today|tomorrow|let)'s)"
    rf"[a-z0-9][a-z0-9._-]*'s\s+{_PRIVATE_FIELD}\b",
    r"\bwhere\s+(?:does|did)\s+(?!(?:handsome\s+)?dan\b|it\b|this\b|that\b|the\s+(?:store|shop)\b|campus\s+customs\b)"
    r"[a-z0-9][a-z0-9.' -]{1,40}?\s+live\b",
)

# "who is <name>?" — blocked only when the subject is 1-3 plain words that look like a
# person's name. Anything with these words goes to the model instead.
_WHO = re.compile(r"\bwho(?:'s|\s+is|\s+was)\s+([^?.!,;:]{1,60})")
_WHO_CUT = re.compile(
    r"\s+(?:and|or|but|because|so|then|who|what|where|when|why|how|can|could|would|please|anyway)\b"
)
_WHO_NAME_WORD = re.compile(r"[a-z][a-z'.-]*")
_WHO_OK = frozenset(
    """
    the a an this that it its it's these those you your yours u ur my mine our ours his her their he she they
    him them we us i me for in on at with of to from about by here there online open working available logged
    signed better best cheaper warmer cooler bigger smaller softer next first last new current old original
    dan handsome mascot bulldog bulldogs dog dogs puppy kingman maurice yale yalie campus customs store shop team
    teams designer maker owner manager staff boss ceo founder brand model assistant bot ai chatbot responsible
    selling seller sellers winning playing favorite favourite fave cutest good real today tomorrow gonna going
    """.split()
)


def _asks_identity_of_person(t: str) -> bool:
    for m in _WHO.finditer(t):
        subject = _WHO_CUT.split(m.group(1), maxsplit=1)[0].strip()
        words = subject.split()
        if not 1 <= len(words) <= 3:
            continue
        if any(w.strip("'\"") in _WHO_OK for w in words):
            continue
        if all(_WHO_NAME_WORD.fullmatch(w) for w in words):
            return True
    return False


def _asks_about_email_owner(t: str) -> bool:
    """An email address plus account/identity words: 'does x@y.edu have an account?'"""
    return bool(_EMAIL_IN_TEXT.search(t) and _ACCOUNT_WORDS.search(t))


# Order matters only for the rule name that gets logged.
_RULES: tuple[tuple[str, object, str], ...] = (
    ("prompt_injection", _INJECTION, INJECTION_REPLY),
    ("secret_request", _SECRET, SECRET_REPLY),
    ("user_list", _USER_LIST, PRIVACY_REPLY),
    ("account_lookup", _ACCOUNT_LOOKUP, ACCOUNT_REPLY),
    ("account_lookup", _asks_about_email_owner, ACCOUNT_REPLY),
    ("private_data", _PRIVATE_DATA, PRIVACY_REPLY),
    ("person_identity", _asks_identity_of_person, IDENTITY_REPLY),
)


def check_input(text: str) -> GuardResult:
    """Decide BEFORE the model is called whether a shopper message must be declined.
    Returns ALLOWED or a GuardResult with the rule name and a canned decline."""
    t = _normalize(text)
    if not t:
        return ALLOWED
    for name, rule, reply in _RULES:
        hit = rule.search(t) if isinstance(rule, re.Pattern) else rule(t)
        if hit:
            return GuardResult(blocked=True, rule=name, reply=reply)
    return ALLOWED


def is_injection(text: str) -> bool:
    return bool(_INJECTION.search(_normalize(text)))


# --------------------------------------------------------------------------
# Redaction (output guard + input minimisation)
# --------------------------------------------------------------------------

EMAIL_RE = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b")
# Phone-like digit runs; kept only when they hold 10-19 digits (see _redact_numbers).
NUMBER_RUN_RE = re.compile(r"(?<![\w$.,/])\+?\(?\d[\d\s().-]{6,24}\d(?![\w])")
SECRET_RES = (
    re.compile(r"\b(?:sk|pk|rk)[-_](?:live[-_]|test[-_]|proj[-_]|ant[-_])?[A-Za-z0-9_-]{6,}"),
    re.compile(r"\b(?:ghp|gho|ghs|github_pat|xox[abprs]|glpat)[-_][A-Za-z0-9_-]{10,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]*)?"),  # JWT
    re.compile(r"\b(?:gAAAAA[A-Za-z0-9_=-]{20,}|enc:v1:\S+)"),  # Fernet tokens / encrypted chat rows
    re.compile(r"\b[0-9a-fA-F]{32,}\b"),  # hashes, hex keys
)
# Long base64/url-safe runs with upper + lower + digit (product slugs are lowercase).
TOKEN_RUN_RE = re.compile(r"(?<![A-Za-z0-9+/_=-])[A-Za-z0-9+/_=-]{24,}")
STREET_RE = re.compile(
    r"\b\d{1,5}\s+(?:[A-Z][a-z]+\.?\s+){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|"
    r"Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Parkway|Pkwy|Highway|Hwy)\b\.?(?:,?\s*(?:Apt|Unit|Suite|#)\.?\s*\w+)?"
)

# Links: only these site paths may be linked (frontend router paths).
INTERNAL_PATH_RE = re.compile(
    r"^/(?:products(?:/[A-Za-z0-9-]+)?|about|visit|size-guide|profile|bag|checkout|login|create-account|forgot-password|account/password)/?"
    r"(?:[?#][\w=&%.+-]*)?$"
)
MD_LINK_RE = re.compile(r"(!?)\[([^\]\n]{0,300})\]\(\s*<?([^)\s>]*)>?(?:\s+(?:\"[^\"]*\"|'[^']*'))?\s*\)")
HTML_LINK_RE = re.compile(r"<a\b[^>]*>(.*?)</a\s*>", re.I | re.S)
_URL_END = r"[^\s<>\"'\]\)]*[^\s<>\"'\]\).,;:!?]"
URL_RE = re.compile(
    rf"\b(?:https?|ftp|file)://{_URL_END}"
    rf"|\b(?:javascript|data|vbscript|mailto|tel|sms):{_URL_END}"
    rf"|\bwww\.{_URL_END}"
    r"|(?<![\w@/.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"(?:com|net|org|io|co|ai|app|xyz|edu|gov|info|biz|me|ly|gg|dev|shop|store|us|uk|ru|cn|tk|link|site|online|"
    r"top|click|tv|to|so|sh|page|club|live|news|blog|ca|de|fr|in|au)\b"
    rf"(?:[/?#]{_URL_END})?",
    re.I,
)

EMAIL_MASK = "[email removed]"
PHONE_MASK = "[phone removed]"
NUMBER_MASK = "[number removed]"
SECRET_MASK = "[removed]"
ADDRESS_MASK = "[address removed]"
LINK_MASK = "(link removed)"


def _redact_numbers(text: str) -> tuple[str, bool]:
    changed = False

    def repl(m: re.Match[str]) -> str:
        nonlocal changed
        digits = sum(ch.isdigit() for ch in m.group(0))
        if digits < 10 or digits > 19:
            return m.group(0)
        changed = True
        return PHONE_MASK if digits <= 15 else NUMBER_MASK

    return NUMBER_RUN_RE.sub(repl, text), changed


def _redact_secrets(text: str) -> tuple[str, bool]:
    changed = False
    for rx in SECRET_RES:
        text, n = rx.subn(SECRET_MASK, text)
        changed = changed or n > 0

    def token_repl(m: re.Match[str]) -> str:
        nonlocal changed
        run = m.group(0)
        if INTERNAL_PATH_RE.match(run):
            return run
        if any(c.isupper() for c in run) and any(c.islower() for c in run) and any(c.isdigit() for c in run):
            changed = True
            return SECRET_MASK
        return run

    return TOKEN_RUN_RE.sub(token_repl, text), changed


def _redact_streets(text: str) -> tuple[str, bool]:
    text, n = STREET_RE.subn(ADDRESS_MASK, text)
    return text, n > 0


def _redact_personal(text: str) -> tuple[str, list[str]]:
    """Emails, keys/tokens, phone/card numbers, street addresses. Returns (text, rules)."""
    fired: list[str] = []
    text, n = EMAIL_RE.subn(EMAIL_MASK, text)
    if n:
        fired.append("email")
    text, hit = _redact_secrets(text)
    if hit:
        fired.append("secret")
    text, hit = _redact_numbers(text)
    if hit:
        fired.append("phone")
    text, hit = _redact_streets(text)
    if hit:
        fired.append("address")
    return text, fired


def minimize(text: str) -> str:
    """Data minimisation for what the shopper typed: the model and chat memory never need
    an email, phone number, street address, or key, so they are masked before either sees them."""
    return _redact_personal(text or "")[0]


def _strip_links(text: str) -> tuple[str, bool]:
    changed = False

    def md(m: re.Match[str]) -> str:
        nonlocal changed
        bang, label, target = m.group(1), m.group(2), m.group(3)
        if not bang and INTERNAL_PATH_RE.match(target or ""):
            return m.group(0)  # internal link: keep as-is
        changed = True
        return label.strip()

    text = MD_LINK_RE.sub(md, text)
    text, n = HTML_LINK_RE.subn(lambda m: re.sub(r"<[^>]+>", "", m.group(1)), text)
    changed = changed or n > 0
    text, n = URL_RE.subn(LINK_MASK, text)
    changed = changed or n > 0
    return text, changed


# A reply that quotes the system prompt: its em-dash section headings, its opening line,
# or two or more internal tool names.
_TOOL_NAMES = (
    "search_catalogue", "get_product_details", "check_stock", "list_filter_options", "get_customer_profile",
    "get_past_interests", "get_current_page", "store_info", "get_wishlist", "get_seasonal_picks",
)


def _prompt_markers() -> list[str]:
    try:
        lines = PROMPT_PATH.read_text(encoding="utf-8").splitlines()
    except OSError:
        return []
    markers = [_normalize(line.lstrip("#")) for line in lines if line.startswith("## ") and "—" in line]
    return [m for m in markers if len(m) >= 15] + ["you are **handsome dan**"]


_LEAK_MARKERS = _prompt_markers()


def _looks_like_prompt_leak(text: str) -> bool:
    t = _normalize(text)
    if any(marker in t for marker in _LEAK_MARKERS):
        return True
    return sum(name in t for name in _TOOL_NAMES) >= 2


def _cap(text: str, limit: int = MAX_REPLY_CHARS) -> str:
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space > limit * 0.8:
        cut = cut[:space]
    return cut.rstrip(" ,;:-") + "…"


def scrub_output(text: str) -> tuple[str, list[str]]:
    """Clean a model reply. Returns (clean_text, rules_fired); rules_fired is empty when
    nothing changed."""
    text = text or ""
    if _looks_like_prompt_leak(text):
        return SECRET_REPLY, ["prompt_leak"]
    fired: list[str] = []
    text, hit = _strip_links(text)
    if hit:
        fired.append("external_link")
    text, personal = _redact_personal(text)
    fired += personal
    if fired:
        text = re.sub(r"\(\s*\)", "", text)
        text = re.sub(r"[ \t]{2,}", " ", text).strip()
    if len(text) > MAX_REPLY_CHARS:
        text = _cap(text)
        fired.append("length")
    return text, fired


def check_output(reply: str, *, actor: str | None = None) -> str:
    """Output guard: the reply with external links, personal data, and secrets removed,
    capped at MAX_REPLY_CHARS. Logs an audit 'blocked' event when anything changed."""
    clean, fired = scrub_output(reply)
    if fired and actor:
        log_blocked(actor, "output_guard:" + ",".join(fired))
    return clean


def clean_history(turns: list[HistoryTurn] | None, *, actor: str | None = None) -> list[HistoryTurn]:
    """Replayed turns (guest browser or saved memory) minus any that trip an input rule
    (e.g. a forged 'ignore previous instructions' turn), with personal data masked."""
    kept: list[HistoryTurn] = []
    dropped = 0
    for turn in turns or []:
        text = (turn.content or "").strip()
        if not text:
            continue
        if check_input(text).blocked:
            dropped += 1
            continue
        # model_construct: members' saved turns may be up to 1,000 chars (HistoryTurn caps
        # browser input at 500); the text is already trimmed by the caller.
        kept.append(HistoryTurn.model_construct(role=turn.role, content=minimize(text)))
    if dropped and actor:
        log_blocked(actor, f"history_dropped:{dropped}")
    return kept


def log_blocked(actor: str, detail: str) -> None:
    """audit.log_event('blocked', ...) that can never break the chat route."""
    try:
        audit.log_event("blocked", actor=actor, detail=detail)
    except Exception:  # pragma: no cover - audit must never take the chat down
        log.warning("audit log_event failed for blocked/%s", detail)


# --------------------------------------------------------------------------
# Daily token budget per actor
# --------------------------------------------------------------------------

DEFAULT_DAILY_TOKENS_MEMBER = 200_000  # ~20–25 typical turns (a turn measured 7.6k–9.7k tokens)
DEFAULT_DAILY_TOKENS_GUEST = 60_000  # ~6–8 typical turns
KEEP_USAGE_DAYS = 30
# Rough cost of one turn's system prompt + tool schemas when run_chat reports no usage.
ESTIMATED_OVERHEAD_TOKENS = 3_000

_tables_ready: set[str] = set()


def daily_limit(signed_in: bool) -> int:
    """Tokens per day: 200,000 signed in, 60,000 guest. Override with CHAT_DAILY_TOKENS_MEMBER
    / CHAT_DAILY_TOKENS_GUEST in the environment."""
    name, default = (
        ("CHAT_DAILY_TOKENS_MEMBER", DEFAULT_DAILY_TOKENS_MEMBER)
        if signed_in
        else ("CHAT_DAILY_TOKENS_GUEST", DEFAULT_DAILY_TOKENS_GUEST)
    )
    try:
        return max(0, int(os.getenv(name, default)))
    except ValueError:
        return default


def _today() -> str:
    return today_in_new_haven().isoformat()  # the budget resets at midnight in New Haven


def _connect() -> sqlite3.Connection:
    conn = auth.get_write_connection()  # follows auth.DB_PATH (tests point it at a copy)
    db = str(auth.DB_PATH)
    if db not in _tables_ready:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS token_usage (
                   day TEXT NOT NULL,
                   actor TEXT NOT NULL,
                   tokens INTEGER NOT NULL DEFAULT 0,
                   PRIMARY KEY (day, actor)
               )"""
        )
        conn.commit()
        _tables_ready.add(db)
    return conn


def init_safety_tables() -> None:
    """Idempotent: create token_usage if missing."""
    with closing(_connect()):
        pass


def tokens_used_today(actor: str) -> int:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT tokens FROM token_usage WHERE day = ? AND actor = ?", (_today(), actor)
        ).fetchone()
    return int(row[0]) if row else 0


def over_daily_budget(actor: str, *, signed_in: bool) -> bool:
    """True when this actor has used up today's tokens. Fails open on a DB error (the
    per-minute limiter and per-turn cap still apply)."""
    try:
        return tokens_used_today(actor) >= daily_limit(signed_in)
    except sqlite3.Error as exc:
        log.warning("token budget check failed: %s", type(exc).__name__)
        return False


def add_tokens(actor: str, tokens: int | None) -> None:
    """Add one turn's tokens to today's total for this actor; prunes rows older than 30 days."""
    n = max(0, int(tokens or 0))
    if not n:
        return
    today = today_in_new_haven()
    try:
        with closing(_connect()) as conn:
            conn.execute(
                """INSERT INTO token_usage (day, actor, tokens) VALUES (?, ?, ?)
                   ON CONFLICT(day, actor) DO UPDATE SET tokens = tokens + excluded.tokens""",
                (today.isoformat(), actor, n),
            )
            conn.execute(
                "DELETE FROM token_usage WHERE day < ?",
                ((today - timedelta(days=KEEP_USAGE_DAYS)).isoformat(),),
            )
            conn.commit()
    except sqlite3.Error as exc:
        log.warning("token budget update failed: %s", type(exc).__name__)


def estimate_tokens(*texts: str) -> int:
    """Fallback when run_chat reports no usage: ~4 chars per token plus prompt overhead."""
    return ESTIMATED_OVERHEAD_TOKENS + sum(len(t or "") for t in texts) // 4
