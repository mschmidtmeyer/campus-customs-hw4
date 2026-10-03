"""Shopping bag (signed-in server cart) and the TEST-MODE checkout review.

Tables
    cart_items (user_id, product_id, size, quantity, added_at) — one row per
    product+size line. Guests keep their bag in the browser (localStorage) and
    POST it to /api/cart/merge after signing in.

Prices and stock are ALWAYS read live from the catalogue (main.get_product);
the client never sends prices. Checkout stops at a review: no order is created
and no stock is decremented — payment is not connected yet.
"""

from __future__ import annotations

import re
from contextlib import closing
from typing import Literal

from fastapi import APIRouter, Cookie, HTTPException, Query
from pydantic import BaseModel, Field

import auth
from auth import get_current_user, get_write_connection

SIZES = ("XS", "S", "M", "L", "XL", "XXL")
MAX_LINE_QTY = 10
MAX_LINES = 50
SHIP_FLAT = 8.00
FREE_SHIP_OVER = 100.00
CT_TAX_RATE = 0.0635
PAYMENT_MESSAGE = "Payment isn't connected yet — your order has not been placed and you won't be charged."
EMAIL_RE = auth.EMAIL_RE
ZIP_RE = re.compile(r"^\d{5}$")
STATE_RE = re.compile(r"^[A-Za-z]{2}$")


def init_cart_tables() -> None:
    """Idempotent migration. Uses auth.get_write_connection, so it follows auth.DB_PATH."""
    with closing(get_write_connection()) as conn:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS cart_items (
                user_id INTEGER NOT NULL,
                product_id TEXT NOT NULL,
                size TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
                added_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, product_id, size),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )"""
        )
        conn.commit()


init_cart_tables()

router = APIRouter(tags=["cart"])


# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------


class LineIn(BaseModel):
    product_id: str = Field(min_length=1, max_length=200)
    size: str = Field(max_length=8)
    quantity: int


class MergeIn(BaseModel):
    items: list[LineIn] = Field(default_factory=list, max_length=MAX_LINES)


class Contact(BaseModel):
    name: str = Field(default="", max_length=200)
    email: str = Field(default="", max_length=300)
    phone: str = Field(default="", max_length=60)


class Address(BaseModel):
    line1: str = Field(default="", max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    city: str = Field(default="", max_length=200)
    state: str = Field(default="", max_length=60)
    zip: str = Field(default="", max_length=20)


class ReviewIn(BaseModel):
    fulfillment: Literal["pickup", "ship"]
    contact: Contact
    address: Address | None = None
    items: list[LineIn] | None = Field(default=None, max_length=MAX_LINES)  # guests only


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------


def _main():
    import main  # lazy: main imports this module while it is still loading

    return main


def _require_user(cc_session: str | None):
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Please sign in to use your saved bag.")
    return user


def _stock(product, size: str) -> int:
    return next((s.quantity for s in product.inventory if s.size == size), 0)


def _validate_line(product_id: str, size: str, quantity: int, *, allow_zero: bool = False):
    """Return the live product; raise 4xx with a shopper-friendly message otherwise."""
    if size not in SIZES:
        raise HTTPException(status_code=422, detail=f"Unknown size '{size}'. Choose XS, S, M, L, XL or XXL.")
    low = 0 if allow_zero else 1
    if not low <= quantity <= MAX_LINE_QTY:
        raise HTTPException(status_code=422, detail=f"Quantity must be between 1 and {MAX_LINE_QTY}.")
    product = _main().get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="That product is no longer available.")
    if quantity == 0:
        return product
    left = _stock(product, size)
    if left <= 0:
        raise HTTPException(status_code=409, detail=f"Sorry, {product.name} is sold out in {size}.")
    if quantity > left:
        raise HTTPException(status_code=409, detail=f"Only {left} left in {size}.")
    return product


def _live_lines(raw: list[tuple[str, str, int]]) -> tuple[list[dict], float, list[str]]:
    """Price and stock-check (product_id, size, quantity) lines against the DB."""
    from tools import _to_card

    main = _main()
    lines: list[dict] = []
    problems: list[str] = []
    subtotal = 0.0
    for product_id, size, qty in raw:
        product = main.get_product(product_id)
        if product is None:
            problems.append(f"No longer available: {product_id}")
            lines.append(
                {"product_id": product_id, "size": size, "quantity": qty, "available": 0,
                 "product": None, "line_total": 0.0, "unit_price": None}
            )
            continue
        available = _stock(product, size)
        if available <= 0:
            problems.append(f"Sold out in {size}: {product.name}")
        elif qty > available:
            problems.append(f"Only {available} left in {size}: {product.name}")
        line_total = round(product.price * qty, 2)
        if available >= qty:
            subtotal += line_total
        lines.append(
            {"product_id": product_id, "size": size, "quantity": qty, "available": available,
             "product": _to_card(product).model_dump(), "line_total": line_total,
             "unit_price": product.price}
        )
    return lines, round(subtotal, 2), problems


def _user_rows(user_id: int) -> list[tuple[str, str, int]]:
    with closing(get_write_connection()) as conn:
        rows = conn.execute(
            "SELECT product_id, size, quantity FROM cart_items WHERE user_id = ? ORDER BY added_at, rowid",
            (user_id,),
        ).fetchall()
    return [(r["product_id"], r["size"], int(r["quantity"])) for r in rows]


def _cart_response(user_id: int) -> dict:
    raw = _user_rows(user_id)
    lines, _, _ = _live_lines(raw)
    subtotal = round(sum(line["line_total"] for line in lines), 2)
    return {"items": lines, "item_count": sum(q for _, _, q in raw), "subtotal": subtotal}


def _current_qty(conn, user_id: int, product_id: str, size: str) -> int:
    row = conn.execute(
        "SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?",
        (user_id, product_id, size),
    ).fetchone()
    return int(row["quantity"]) if row else 0


def _upsert(conn, user_id: int, product_id: str, size: str, qty: int) -> None:
    if qty <= 0:
        conn.execute(
            "DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND size = ?",
            (user_id, product_id, size),
        )
    else:
        conn.execute(
            """INSERT INTO cart_items (user_id, product_id, size, quantity) VALUES (?, ?, ?, ?)
               ON CONFLICT(user_id, product_id, size) DO UPDATE SET quantity = excluded.quantity""",
            (user_id, product_id, size, qty),
        )


# --------------------------------------------------------------------------
# Cart endpoints (signed-in only)
# --------------------------------------------------------------------------


@router.get("/api/cart")
def get_cart(cc_session: str | None = Cookie(default=None)) -> dict:
    user = _require_user(cc_session)
    return _cart_response(user.id)


@router.post("/api/cart/items")
def add_item(body: LineIn, cc_session: str | None = Cookie(default=None)) -> dict:
    user = _require_user(cc_session)
    _validate_line(body.product_id, body.size, body.quantity)
    with closing(get_write_connection()) as conn:
        total = _current_qty(conn, user.id, body.product_id, body.size) + body.quantity
        if total > MAX_LINE_QTY:
            raise HTTPException(status_code=409, detail=f"You can have at most {MAX_LINE_QTY} of one item in your bag.")
        _validate_line(body.product_id, body.size, total)
        _upsert(conn, user.id, body.product_id, body.size, total)
        conn.commit()
    return _cart_response(user.id)


@router.patch("/api/cart/items")
def set_item(body: LineIn, cc_session: str | None = Cookie(default=None)) -> dict:
    user = _require_user(cc_session)
    if body.quantity == 0:
        if body.size not in SIZES:
            raise HTTPException(status_code=422, detail="Unknown size.")
    else:
        _validate_line(body.product_id, body.size, body.quantity)
    with closing(get_write_connection()) as conn:
        _upsert(conn, user.id, body.product_id, body.size, body.quantity)
        conn.commit()
    return _cart_response(user.id)


@router.delete("/api/cart/items")
def delete_item(
    product_id: str = Query(max_length=200),
    size: str = Query(max_length=8),
    cc_session: str | None = Cookie(default=None),
) -> dict:
    user = _require_user(cc_session)
    with closing(get_write_connection()) as conn:
        _upsert(conn, user.id, product_id, size, 0)
        conn.commit()
    return _cart_response(user.id)


@router.delete("/api/cart")
def clear_cart(cc_session: str | None = Cookie(default=None)) -> dict:
    user = _require_user(cc_session)
    with closing(get_write_connection()) as conn:
        conn.execute("DELETE FROM cart_items WHERE user_id = ?", (user.id,))
        conn.commit()
    return _cart_response(user.id)


@router.post("/api/cart/merge")
def merge_cart(body: MergeIn, cc_session: str | None = Cookie(default=None)) -> dict:
    """Fold a guest bag into the server cart. Lines are capped at 10 and at live stock;
    unknown products, bad sizes and sold-out lines are skipped (reported in `skipped`)."""
    user = _require_user(cc_session)
    main = _main()
    skipped: list[str] = []
    with closing(get_write_connection()) as conn:
        for line in body.items:
            if line.size not in SIZES or line.quantity < 1:
                continue
            product = main.get_product(line.product_id)
            if product is None:
                continue
            left = _stock(product, line.size)
            want = _current_qty(conn, user.id, line.product_id, line.size) + line.quantity
            capped = min(want, MAX_LINE_QTY, left)
            if capped <= 0:
                skipped.append(f"Sold out in {line.size}: {product.name}")
                continue
            if capped < want:
                skipped.append(f"Only {capped} of {product.name} ({line.size}) could be kept.")
            _upsert(conn, user.id, line.product_id, line.size, capped)
        conn.commit()
    return {**_cart_response(user.id), "skipped": skipped}


# --------------------------------------------------------------------------
# Checkout review (TEST MODE: nothing is placed, charged or decremented)
# --------------------------------------------------------------------------


def _review_errors(body: ReviewIn) -> dict[str, list[str]]:
    errors: dict[str, list[str]] = {}
    c = body.contact
    if not 2 <= len(c.name.strip()) <= 100:
        errors["name"] = ["Enter your full name."]
    if not EMAIL_RE.match(c.email.strip()):
        errors["email"] = ["Enter a valid email address."]
    if not 10 <= len(re.sub(r"\D", "", c.phone)) <= 15:
        errors["phone"] = ["Enter a phone number with 10 to 15 digits."]
    if body.fulfillment == "ship":
        a = body.address or Address()
        if not 3 <= len(a.line1.strip()) <= 100:
            errors["line1"] = ["Enter a street address."]
        if a.line2 and len(a.line2) > 100:
            errors["line2"] = ["Keep the second address line under 100 characters."]
        if not 2 <= len(a.city.strip()) <= 60:
            errors["city"] = ["Enter a city."]
        if not STATE_RE.match(a.state.strip()):
            errors["state"] = ["Use the 2-letter state code, like CT."]
        if not ZIP_RE.match(a.zip.strip()):
            errors["zip"] = ["Enter a 5-digit ZIP code."]
    return errors


@router.post("/api/checkout/review")
def checkout_review(body: ReviewIn, cc_session: str | None = Cookie(default=None)) -> dict:
    errors = _review_errors(body)
    if errors:
        raise HTTPException(status_code=422, detail={"errors": errors})
    user = get_current_user(cc_session)
    if user is not None:
        raw = _user_rows(user.id)
    else:
        raw = []
        for line in body.items or []:
            if line.size not in SIZES or not 1 <= line.quantity <= MAX_LINE_QTY:
                raise HTTPException(status_code=422, detail="Your bag has an invalid line. Please refresh it.")
            raw.append((line.product_id, line.size, line.quantity))
    if not raw:
        raise HTTPException(status_code=400, detail="Your bag is empty.")

    lines, subtotal, problems = _live_lines(raw)
    if body.fulfillment == "pickup":
        shipping = 0.0
    else:
        shipping = 0.0 if subtotal > FREE_SHIP_OVER else SHIP_FLAT
    if subtotal == 0:
        shipping = 0.0
    tax = round((subtotal + shipping) * CT_TAX_RATE + 1e-9, 2)
    total = round(subtotal + shipping + tax, 2)
    return {
        "lines": lines,
        "subtotal": subtotal,
        "shipping": shipping,
        "tax": tax,
        "total": total,
        "problems": problems,
        "fulfillment": body.fulfillment,
        "payment_ready": False,
        "message": PAYMENT_MESSAGE,
    }
