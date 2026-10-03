"""Shopper activity for the My Profile page (Problem 9).

Endpoints (all scoped to the user from the session cookie — the client never picks whose
data it sees):
    POST   /api/me/views     record a product view (guests: 204 no-op, nothing stored)
    DELETE /api/me/views     clear the shopper's view history
    GET    /api/me/activity  profile + chat questions + recently viewed + Dan's picks

Storage: a `product_views` table (created idempotently at import). Chat data comes only
through memory.load_history / memory.recent_interests (they return decrypted content).
Product cards always carry LIVE price/stock from the catalogue.
"""

from __future__ import annotations

from contextlib import closing

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

import memory
from auth import get_current_user, get_write_connection
from models import ProductCard

router = APIRouter(prefix="/api/me", tags=["profile"])

DUPLICATE_WINDOW_MIN = 30  # same product viewed again within this window → one entry
MAX_VIEWS_PER_MIN = 60  # crude flood guard
VIEWED_LIMIT = 24
SEARCHES_LIMIT = 30
PICKS_LIMIT = 12
PURCHASES_NOTE = (
    "Online checkout isn't available yet — in-store purchases aren't linked to accounts."
)


def init_activity_tables() -> None:
    """Idempotent migration: product_views table + per-user index."""
    with closing(get_write_connection()) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS product_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                viewed_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (product_id) REFERENCES catalogue(product_id)
            )"""
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_product_views_user ON product_views (user_id, viewed_at)"
        )
        conn.commit()


init_activity_tables()


# --------------------------------------------------------------------------
# Response models
# --------------------------------------------------------------------------


class RecordViewRequest(BaseModel):
    product_id: str = Field(min_length=1, max_length=120)


class ProfileInfo(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    name: str
    email: str
    phone: str | None = None
    member_since: str | None = None


class SearchEntry(BaseModel):
    text: str
    at: str
    page_path: str | None = None


class ViewedProduct(ProductCard):
    viewed_at: str


class Activity(BaseModel):
    profile: ProfileInfo
    searches: list[SearchEntry] = Field(default_factory=list)
    viewed: list[ViewedProduct] = Field(default_factory=list)
    recommended_from_chat: list[ProductCard] = Field(default_factory=list)
    purchases: list[ProductCard] = Field(default_factory=list)
    purchases_note: str = PURCHASES_NOTE


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _require_user(cc_session: str | None):
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to see your profile.")
    return user


def _live_card(product_id: str) -> ProductCard | None:
    from main import get_product  # local import: main imports this module at startup
    from tools import _to_card

    product = get_product(product_id)
    return _to_card(product) if product else None


def _page_paths(user_id: int, message_ids: list[int]) -> dict[int, str | None]:
    """page_path is plain metadata (not chat content), so read it by id for this user."""
    if not message_ids:
        return {}
    marks = ",".join("?" * len(message_ids))
    try:
        with closing(get_write_connection()) as conn:
            rows = conn.execute(
                f"SELECT id, page_path FROM chat_messages WHERE user_id = ? AND id IN ({marks})",
                (user_id, *message_ids),
            ).fetchall()
    except Exception:  # column missing on an old DB
        return {}
    return {r["id"]: r["page_path"] for r in rows}


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


@router.post("/views", status_code=204)
def record_view(body: RecordViewRequest, cc_session: str | None = Cookie(default=None)) -> Response:
    user = get_current_user(cc_session)
    if user is None:
        return Response(status_code=204)  # guests are never tracked
    from main import get_product

    if get_product(body.product_id) is None:
        raise HTTPException(status_code=404, detail="Product not found.")
    with closing(get_write_connection()) as conn:
        recent = conn.execute(
            "SELECT COUNT(*) FROM product_views WHERE user_id = ?"
            " AND viewed_at > datetime('now', '-1 minute')",
            (user.id,),
        ).fetchone()[0]
        if recent >= MAX_VIEWS_PER_MIN:
            return Response(status_code=204)
        dup = conn.execute(
            "SELECT id FROM product_views WHERE user_id = ? AND product_id = ?"
            " AND viewed_at > datetime('now', ?) ORDER BY id DESC LIMIT 1",
            (user.id, body.product_id, f"-{DUPLICATE_WINDOW_MIN} minutes"),
        ).fetchone()
        if dup:
            conn.execute(
                "UPDATE product_views SET viewed_at = datetime('now') WHERE id = ?", (dup["id"],)
            )
        else:
            conn.execute(
                "INSERT INTO product_views (user_id, product_id) VALUES (?, ?)",
                (user.id, body.product_id),
            )
        conn.commit()
    return Response(status_code=204)


@router.delete("/views", status_code=204)
def clear_views(cc_session: str | None = Cookie(default=None)) -> Response:
    user = _require_user(cc_session)
    with closing(get_write_connection()) as conn:
        conn.execute("DELETE FROM product_views WHERE user_id = ?", (user.id,))
        conn.commit()
    return Response(status_code=204)


@router.get("/activity", response_model=Activity)
def activity(cc_session: str | None = Cookie(default=None)) -> Activity:
    user = _require_user(cc_session)

    # Chat questions (decrypted by memory), newest first.
    questions = [m for m in memory.load_history(user.id, 200) if m.role == "user"]
    questions = list(reversed(questions))[:SEARCHES_LIMIT]
    paths = _page_paths(user.id, [m.id for m in questions])
    searches = [
        SearchEntry(text=m.content, at=m.created_at, page_path=paths.get(m.id)) for m in questions
    ]

    # Recently viewed: distinct products, newest first, live price/stock.
    with closing(get_write_connection()) as conn:
        rows = conn.execute(
            "SELECT product_id, MAX(viewed_at) AS last_seen, MAX(id) AS last_id FROM product_views"
            " WHERE user_id = ? GROUP BY product_id ORDER BY last_seen DESC, last_id DESC LIMIT ?",
            (user.id, VIEWED_LIMIT),
        ).fetchall()
    viewed = []
    for r in rows:
        card = _live_card(r["product_id"])
        if card:
            viewed.append(ViewedProduct(**card.model_dump(), viewed_at=r["last_seen"]))

    # Products Dan showed in chat, refreshed with live price/stock.
    shown, _ = memory.recent_interests(user.id, limit=PICKS_LIMIT)
    picks = [c for c in (_live_card(p.product_id) for p in shown) if c]

    return Activity(
        profile=ProfileInfo(
            first_name=user.first_name,
            last_name=user.last_name,
            name=user.name,
            email=user.email,
            phone=user.phone,
            member_since=user.created_at,
        ),
        searches=searches,
        viewed=viewed,
        recommended_from_chat=picks,
    )
