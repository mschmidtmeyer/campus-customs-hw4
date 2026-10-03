"""Wishlist for signed-in shoppers.

Endpoints (scoped to the user from the session cookie; guests get 401):
    GET    /api/wishlist                 saved products (live price/stock), newest first
    POST   /api/wishlist {product_id}    save a product (idempotent, 404 if unknown, cap 200)
    DELETE /api/wishlist/{product_id}    remove a product (idempotent, 204)

Storage: `wishlist_items` table, created idempotently at import. Cards are always
built from the live catalogue; products removed from the catalogue are skipped.
"""

from __future__ import annotations

from contextlib import closing

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel, Field

from auth import get_current_user, get_write_connection
from models import ProductCard

router = APIRouter(tags=["wishlist"])

MAX_ITEMS = 200


def init_wishlist_table() -> None:
    with closing(get_write_connection()) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS wishlist_items (
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
                PRIMARY KEY (user_id, product_id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )"""
        )
        conn.commit()


init_wishlist_table()


class WishlistAdd(BaseModel):
    product_id: str = Field(min_length=1, max_length=120)


class WishlistEntry(BaseModel):
    product: ProductCard
    added_at: str


class WishlistOut(BaseModel):
    items: list[WishlistEntry] = Field(default_factory=list)


def _require_user(cc_session: str | None):
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to use your wishlist.")
    return user


def wishlist_entries(user_id: int) -> list[WishlistEntry]:
    """Live cards for a user's saved products, newest first. Reused by the agent tool."""
    from main import get_product  # local import: main imports this module at startup
    from tools import _to_card

    with closing(get_write_connection()) as conn:
        rows = conn.execute(
            "SELECT product_id, added_at FROM wishlist_items WHERE user_id = ? "
            "ORDER BY added_at DESC, rowid DESC",
            (user_id,),
        ).fetchall()
    out: list[WishlistEntry] = []
    for r in rows:
        product = get_product(r["product_id"])
        if product is not None:
            out.append(WishlistEntry(product=_to_card(product), added_at=r["added_at"]))
    return out


@router.get("/api/wishlist", response_model=WishlistOut)
def list_wishlist(cc_session: str | None = Cookie(default=None)) -> WishlistOut:
    user = _require_user(cc_session)
    return WishlistOut(items=wishlist_entries(user.id))


@router.post("/api/wishlist", response_model=WishlistOut, status_code=200)
def add_to_wishlist(body: WishlistAdd, cc_session: str | None = Cookie(default=None)) -> WishlistOut:
    from main import get_product

    user = _require_user(cc_session)
    pid = body.product_id.strip()
    if get_product(pid) is None:
        raise HTTPException(status_code=404, detail="No such product.")
    with closing(get_write_connection()) as conn:
        exists = conn.execute(
            "SELECT 1 FROM wishlist_items WHERE user_id = ? AND product_id = ?", (user.id, pid)
        ).fetchone()
        if not exists:
            (count,) = conn.execute(
                "SELECT COUNT(*) FROM wishlist_items WHERE user_id = ?", (user.id,)
            ).fetchone()
            if count >= MAX_ITEMS:
                raise HTTPException(
                    status_code=409, detail=f"Your wishlist is full ({MAX_ITEMS} items). Remove something first."
                )
            conn.execute(
                "INSERT OR IGNORE INTO wishlist_items (user_id, product_id) VALUES (?, ?)",
                (user.id, pid),
            )
            conn.commit()
    return WishlistOut(items=wishlist_entries(user.id))


@router.delete("/api/wishlist/{product_id}", status_code=204)
def remove_from_wishlist(product_id: str, cc_session: str | None = Cookie(default=None)) -> Response:
    user = _require_user(cc_session)
    with closing(get_write_connection()) as conn:
        conn.execute(
            "DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?", (user.id, product_id)
        )
        conn.commit()
    return Response(status_code=204)
