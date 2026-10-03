"""Customer memory: saved chat history for signed-in shoppers.

Storage is the existing `chat_messages` table (one row per message):
    id, user_id, role ('user' | 'assistant'), content, products_json, created_at
plus a `page_path` column added here (where the shopper was when they asked).

Rules
- Only signed-in shoppers are remembered. Guests are never written to the DB.
- Every read and write is scoped by the user_id from the session cookie — the
  client never chooses whose history it sees.
- The agent gets a short window (HISTORY_WINDOW messages, each trimmed) so
  long histories stay cheap.

Encryption at rest
- `content` and `products_json` are encrypted with Fernet (AES-128-CBC +
  HMAC-SHA256) and stored as "enc:v1:<token>". The key is CHAT_ENCRYPTION_KEY
  from backend/.env (generated on first run if missing). Rows without the
  prefix are legacy plaintext and still read fine; init_memory_tables()
  encrypts them once. `page_path` stays plaintext (a site URL, no personal text).
- A wrong/missing key never crashes a read: the message shows as
  "[message unavailable]".
"""

from __future__ import annotations

import json
import logging
import os
from contextlib import closing
from functools import lru_cache
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

from auth import get_write_connection
from models import ChatHistoryMessage, ProductCard

HISTORY_WINDOW = 8  # messages replayed to the agent each turn (4 exchanges; cheaper, enough for follow-ups)
HISTORY_PAGE = 40  # messages sent to the website chat panel
MAX_STORED_CHARS = 4000

log = logging.getLogger("campus_customs.memory")

ENV_PATH = Path(__file__).resolve().parent / ".env"
ENC_PREFIX = "enc:v1:"
UNAVAILABLE = "[message unavailable]"


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    """Load CHAT_ENCRYPTION_KEY (backend/.env first); create and save one if missing.
    The key value is never logged or printed."""
    load_dotenv(ENV_PATH, override=False)
    key = os.environ.get("CHAT_ENCRYPTION_KEY", "").strip()
    if not key:
        key = Fernet.generate_key().decode()
        existing = ENV_PATH.read_text() if ENV_PATH.exists() else ""
        sep = "" if not existing or existing.endswith("\n") else "\n"
        with ENV_PATH.open("a") as fh:
            fh.write(f"{sep}CHAT_ENCRYPTION_KEY={key}\n")
        os.chmod(ENV_PATH, 0o600)
        os.environ["CHAT_ENCRYPTION_KEY"] = key
        log.warning("Generated a new CHAT_ENCRYPTION_KEY in backend/.env")
    return Fernet(key.encode())


def _encrypt(text: str | None) -> str | None:
    if text is None or text.startswith(ENC_PREFIX):
        return text
    return ENC_PREFIX + _fernet().encrypt(text.encode()).decode()


def _decrypt(stored: str | None) -> str | None:
    """Plaintext of a stored value; legacy plaintext passes through; None if undecryptable."""
    if stored is None or not stored.startswith(ENC_PREFIX):
        return stored
    try:
        return _fernet().decrypt(stored[len(ENC_PREFIX):].encode()).decode()
    except (InvalidToken, ValueError):
        return None


def init_memory_tables() -> None:
    """Idempotent migration: page_path column + index for fast per-user reads."""
    with closing(get_write_connection()) as conn:
        cols = {r["name"] for r in conn.execute("PRAGMA table_info(chat_messages)")}
        if "page_path" not in cols:
            conn.execute("ALTER TABLE chat_messages ADD COLUMN page_path TEXT")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages (user_id, id)"
        )
        # One-time, idempotent: encrypt legacy plaintext rows in place.
        legacy = conn.execute(
            "SELECT id, content, products_json FROM chat_messages"
            " WHERE (content IS NOT NULL AND content NOT LIKE 'enc:v1:%')"
            "    OR (products_json IS NOT NULL AND products_json NOT LIKE 'enc:v1:%')"
        ).fetchall()
        conn.executemany(
            "UPDATE chat_messages SET content = ?, products_json = ? WHERE id = ?",
            [(_encrypt(r["content"]), _encrypt(r["products_json"]), r["id"]) for r in legacy],
        )
        if legacy:
            log.info("Encrypted %d legacy chat rows", len(legacy))
        conn.commit()


def _cards(raw: str | None) -> list[ProductCard]:
    """Parse products_json. Older rows hold full catalogue rows; keep the card fields."""
    if not raw:
        return []
    try:
        items = json.loads(raw)
    except json.JSONDecodeError:
        return []
    cards = []
    for item in items if isinstance(items, list) else []:
        try:
            cards.append(
                ProductCard(
                    product_id=item["product_id"],
                    name=item["name"],
                    garment_type=item.get("garment_type", ""),
                    price=float(item["price"]),
                    colors=item.get("colors") or [],
                    image_url=item.get("image_url") or f"/media/{item.get('image_file_path', '')}",
                    total_stock=int(item.get("total_stock", 0)),
                    inventory=[
                        {"size": s["size"], "quantity": s["quantity"], "in_stock": s["quantity"] > 0}
                        for s in item.get("inventory") or []
                    ],
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return cards


def save_turn(
    user_id: int, user_text: str, reply: str, cards: list[ProductCard], page_path: str | None
) -> None:
    """Store one exchange (shopper message + Dan's reply) for a signed-in user."""
    with closing(get_write_connection()) as conn:
        conn.execute(
            "INSERT INTO chat_messages (user_id, role, content, products_json, page_path)"
            " VALUES (?, 'user', ?, NULL, ?)",
            (user_id, _encrypt(user_text[:MAX_STORED_CHARS]), page_path),
        )
        conn.execute(
            "INSERT INTO chat_messages (user_id, role, content, products_json, page_path)"
            " VALUES (?, 'assistant', ?, ?, ?)",
            (
                user_id,
                _encrypt(reply[:MAX_STORED_CHARS]),
                _encrypt(json.dumps([c.model_dump() for c in cards])),
                page_path,
            ),
        )
        conn.commit()


def _rows(user_id: int, limit: int) -> list[dict]:
    with closing(get_write_connection()) as conn:
        rows = conn.execute(
            "SELECT id, role, content, products_json, created_at FROM chat_messages"
            " WHERE user_id = ? ORDER BY id DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    out = []
    for r in reversed(rows):  # oldest first
        d = dict(r)
        content = _decrypt(d["content"])
        d["content"] = UNAVAILABLE if content is None else content
        d["products_json"] = _decrypt(d["products_json"])  # None -> no cards
        out.append(d)
    return out


def load_history(user_id: int, limit: int = HISTORY_PAGE) -> list[ChatHistoryMessage]:
    return [
        ChatHistoryMessage(
            id=r["id"],
            role=r["role"],
            content=r["content"],
            products=_cards(r["products_json"]),
            created_at=r["created_at"],
        )
        for r in _rows(user_id, limit)
        if r["role"] in ("user", "assistant")
    ]


def recent_interests(user_id: int, limit: int = 5) -> tuple[list[ProductCard], list[str]]:
    """Products Dan showed this shopper most recently (newest first, distinct) and
    their last few questions. Used by the welcome-back pop-up and an agent tool."""
    products: dict[str, ProductCard] = {}
    questions: list[str] = []
    for r in reversed(_rows(user_id, 60)):  # newest first
        if r["role"] == "assistant":
            for card in _cards(r["products_json"]):
                if len(products) < limit:
                    products.setdefault(card.product_id, card)
        elif r["role"] == "user" and len(questions) < 3:
            questions.append(r["content"][:200])
    return list(products.values()), questions


def clear_history(user_id: int) -> int:
    with closing(get_write_connection()) as conn:
        cur = conn.execute("DELETE FROM chat_messages WHERE user_id = ?", (user_id,))
        conn.commit()
        return cur.rowcount
