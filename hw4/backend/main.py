"""Campus Customs shop backend (FastAPI).

Serves the product catalogue, stock levels, filter options, and product images
from the SQLite database in ../data, plus accounts (see auth.py). Later this app will also host the
Pydantic AI shopping agent, so data access lives in small helper functions
that both the HTTP endpoints and the agent tools can reuse.

Run (no auto-reload):
    cd "HW 4/backend" && .venv/bin/uvicorn main:app --port 8000
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
from collections import Counter, defaultdict, deque
from contextlib import closing
from pathlib import Path
from typing import Literal
from urllib.parse import parse_qsl

from fastapi import Cookie, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from activity import router as activity_router
from cart import router as cart_router
from season import router as season_router
from wishlist import router as wishlist_router
from auth import get_current_user, init_auth_tables, router as auth_router
import audit
import memory
import safety
import search
from models import (
    ChatHistory,
    ChatReply,
    ChatWelcome,
    HistoryTurn,
    PageContext,
    PageContextIn,
)

log = logging.getLogger("campus_customs.main")

# --------------------------------------------------------------------------
# Paths and constants
# --------------------------------------------------------------------------

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "campus_customs.db"
# Web copies with clean white backgrounds (scripts/clean_product_images.py); the
# original catalogue photos in data/products are kept untouched as the fallback.
PRODUCTS_IMG_DIR = (
    DATA_DIR / "products_web" if (DATA_DIR / "products_web").is_dir() else DATA_DIR / "products"
)
# Bump when the served photos change, so browsers don't reuse old cached copies.
# Must match the ?v= in frontend/src/pages/Home.tsx (imageFor).
IMAGE_VERSION = "2"

SIZES: tuple[str, ...] = ("XS", "S", "M", "L", "XL", "XXL")
Size = Literal["XS", "S", "M", "L", "XL", "XXL"]
SortOption = Literal["name", "price_asc", "price_desc"]


# --------------------------------------------------------------------------
# Response models (mirror frontend/src/types.ts)
# --------------------------------------------------------------------------


class StockLine(BaseModel):
    size: Size
    quantity: int


class Product(BaseModel):
    product_id: str
    name: str
    garment_type: str
    description: str
    colors: list[str]
    search_tags: list[str]
    image_file_path: str
    image_url: str
    price: float
    inventory: list[StockLine]
    total_stock: int


class FilterOptions(BaseModel):
    garment_types: list[str]
    colors: list[str]
    sizes: list[Size]
    price_min: float
    price_max: float


# --------------------------------------------------------------------------
# Database helpers
# --------------------------------------------------------------------------


def get_connection() -> sqlite3.Connection:
    """Open the shop database read-only."""
    conn = sqlite3.connect(f"file:{DB_PATH.as_posix()}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _parse_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [str(v) for v in value] if isinstance(value, list) else []


def _load_inventory(conn: sqlite3.Connection, product_ids: list[str]) -> dict[str, list[StockLine]]:
    """Stock per size for the given products, always in XS..XXL order."""
    if not product_ids:
        return {}
    placeholders = ",".join("?" for _ in product_ids)
    rows = conn.execute(
        f"SELECT product_id, size, quantity FROM inventory WHERE product_id IN ({placeholders})",
        product_ids,
    ).fetchall()
    counts: dict[str, dict[str, int]] = {pid: {} for pid in product_ids}
    for row in rows:
        counts[row["product_id"]][row["size"]] = int(row["quantity"])
    return {
        pid: [StockLine(size=s, quantity=by_size.get(s, 0)) for s in SIZES]
        for pid, by_size in counts.items()
    }


def _rows_to_products(conn: sqlite3.Connection, rows: list[sqlite3.Row]) -> list[Product]:
    inventory = _load_inventory(conn, [r["product_id"] for r in rows])
    products = []
    for r in rows:
        stock = inventory.get(r["product_id"], [StockLine(size=s, quantity=0) for s in SIZES])
        products.append(
            Product(
                product_id=r["product_id"],
                name=r["name"],
                garment_type=r["garment_type"],
                description=r["description"] or "",
                colors=_parse_json_list(r["colors"]),
                search_tags=_parse_json_list(r["search_tags"]),
                image_file_path=r["image_file_path"],
                image_url=f"/media/{r['image_file_path']}?v={IMAGE_VERSION}",
                price=float(r["price"]),
                inventory=stock,
                total_stock=sum(line.quantity for line in stock),
            )
        )
    return products


def _like_pattern(term: str) -> str:
    escaped = term.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def search_products(
    q: str | None = None,
    garment_type: str | None = None,
    color: str | None = None,
    size: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    in_stock: bool = False,
    sort: str = "name",
    ids: list[str] | None = None,
) -> list[Product]:
    """Filter the catalogue. Every value is passed as an SQL parameter.
    `ids` limits results to those product_ids and returns them in that order."""
    where: list[str] = []
    params: list[object] = []
    if ids is not None:
        ids = [i for i in dict.fromkeys(ids) if i][:100]  # dedupe, cap
        if not ids:
            return []
        where.append(f"c.product_id IN ({','.join('?' for _ in ids)})")
        params.extend(ids)

    # Typo/synonym tolerance: "pink hooddies" -> color=coral + term "hoodie".
    # An explicit `color` param wins over a color word inside q.
    plan = search.plan_search(q, color)
    color = plan.color
    if plan.terms:
        searchable = ("c.name", "c.description", "c.garment_type", "c.colors", "c.search_tags")
        for word in plan.terms:
            pattern = _like_pattern(word)
            where.append(
                "(" + " OR ".join(f"lower({col}) LIKE ? ESCAPE '\\'" for col in searchable) + ")"
            )
            params.extend([pattern] * len(searchable))
    if garment_type:
        where.append("lower(c.garment_type) = lower(?)")
        params.append(garment_type)
    if color:
        where.append("EXISTS (SELECT 1 FROM json_each(c.colors) WHERE lower(value) = lower(?))")
        params.append(color)
    if size:
        where.append(
            "EXISTS (SELECT 1 FROM inventory i WHERE i.product_id = c.product_id"
            " AND i.size = ? AND i.quantity > 0)"
        )
        params.append(size)
    if min_price is not None:
        where.append("c.price >= ?")
        params.append(min_price)
    if max_price is not None:
        where.append("c.price <= ?")
        params.append(max_price)
    if in_stock:
        where.append(
            "(SELECT COALESCE(SUM(i.quantity), 0) FROM inventory i"
            " WHERE i.product_id = c.product_id) > 0"
        )

    order_by = {
        "price_asc": "c.price ASC, c.name COLLATE NOCASE ASC",
        "price_desc": "c.price DESC, c.name COLLATE NOCASE ASC",
    }.get(sort, "c.name COLLATE NOCASE ASC")

    sql = "SELECT c.* FROM catalogue c"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += f" ORDER BY {order_by}"  # order_by comes from a fixed whitelist above

    with closing(get_connection()) as conn:
        rows = conn.execute(sql, params).fetchall()
        products = _rows_to_products(conn, rows)
    if ids is not None:
        rank = {pid: i for i, pid in enumerate(ids)}
        products.sort(key=lambda p: rank[p.product_id])
    return products


def get_product(product_id: str) -> Product | None:
    with closing(get_connection()) as conn:
        row = conn.execute("SELECT * FROM catalogue WHERE product_id = ?", (product_id,)).fetchone()
        if row is None:
            return None
        return _rows_to_products(conn, [row])[0]


def get_filter_options() -> FilterOptions:
    with closing(get_connection()) as conn:
        types = [
            r[0]
            for r in conn.execute(
                "SELECT DISTINCT garment_type FROM catalogue ORDER BY garment_type"
            ).fetchall()
        ]
        color_counts: Counter[str] = Counter()
        for (raw,) in conn.execute("SELECT colors FROM catalogue").fetchall():
            color_counts.update(set(_parse_json_list(raw)))
        price_min, price_max = conn.execute("SELECT MIN(price), MAX(price) FROM catalogue").fetchone()
    colors = sorted(color_counts, key=lambda c: (-color_counts[c], c))
    return FilterOptions(
        garment_types=types,
        colors=colors,
        sizes=list(SIZES),
        price_min=float(price_min or 0),
        price_max=float(price_max or 0),
    )


# --------------------------------------------------------------------------
# App and endpoints
# --------------------------------------------------------------------------

app = FastAPI(title="Campus Customs API")
init_auth_tables()
memory.init_memory_tables()
app.include_router(auth_router)
app.include_router(activity_router)
app.include_router(cart_router)
app.include_router(season_router)
app.include_router(wishlist_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Search-Corrected"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/products", response_model=list[Product])
def list_products(
    response: Response,
    q: str | None = None,
    garment_type: str | None = None,
    color: str | None = None,
    size: Size | None = None,
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    in_stock: bool = False,
    sort: SortOption = "name",
    ids: str | None = Query(default=None, max_length=4000, description="Comma-separated product_ids"),
) -> list[Product]:
    if q or color:
        plan = search.plan_search(q, color)
        if plan.corrections:
            response.headers["X-Search-Corrected"] = json.dumps(
                {"corrected_q": plan.corrected_q, "corrections": plan.corrections}
            )
    return search_products(
        ids=[i.strip() for i in ids.split(",")] if ids else None,
        q=q.strip() if q else None,
        garment_type=garment_type,
        color=color,
        size=size,
        min_price=min_price,
        max_price=max_price,
        in_stock=in_stock,
        sort=sort,
    )


@app.get("/api/search/suggest")
def search_suggest(q: str = Query(default="", max_length=200)) -> dict[str, object]:
    """What the search box text will actually be searched as (typo/synonym fixes)."""
    plan = search.plan_search(q)
    return {"corrected_q": plan.corrected_q, "corrections": plan.corrections}


@app.get("/api/products/{product_id}", response_model=Product)
def product_detail(product_id: str) -> Product:
    product = get_product(product_id)
    if product is None:
        raise HTTPException(status_code=404, detail=f"Product '{product_id}' not found")
    return product


@app.get("/api/filters", response_model=FilterOptions)
def filters() -> FilterOptions:
    return get_filter_options()


# --------------------------------------------------------------------------
# Chat (agent) + customer memory
# --------------------------------------------------------------------------

CHAT_RATE_LIMIT = 20  # messages per CHAT_RATE_WINDOW per shopper (user id or IP)
CHAT_RATE_WINDOW = 60.0
_chat_hits: dict[str, deque[float]] = defaultdict(deque)
_rate_logged: dict[str, float] = {}  # last audit entry per rate-limited shopper (one per window)

PAGE_NAMES = {
    "/": "home",
    "/products": "products list",
    "/about": "about us",
    "/visit": "visit us",
    "/size-guide": "size guide",
    "/login": "login",
    "/create-account": "create account",
    "/account/password": "change password",
}
PAGE_FILTER_KEYS = ("q", "garment_type", "color", "size", "min_price", "max_price", "in_stock", "chat")


class ChatRequestBody(BaseModel):
    message: str = Field(min_length=1, max_length=safety.MAX_INPUT_CHARS)  # per-message cap: 2,000 chars
    page: PageContextIn | None = None
    history: list[HistoryTurn] | None = Field(default=None, max_length=6)  # guests only


def _rate_limited(key: str) -> bool:
    now = time.monotonic()
    hits = _chat_hits[key]
    while hits and now - hits[0] > CHAT_RATE_WINDOW:
        hits.popleft()
    if len(hits) >= CHAT_RATE_LIMIT:
        return True
    hits.append(now)
    return False


def _note_rate_limited(key: str, actor: str) -> None:
    """Audit a rate-limit block once per window per shopper, so a flood can't flood the trail."""
    now = time.monotonic()
    if now - _rate_logged.get(key, float("-inf")) >= CHAT_RATE_WINDOW:
        _rate_logged[key] = now
        safety.log_blocked(actor, "rate_limit")


def _chat_history(user, guest_turns: list[HistoryTurn] | None, actor: str) -> list[HistoryTurn]:
    """Earlier turns to replay: saved memory for members (last HISTORY_WINDOW, each ≤1,000
    chars), the browser's last few for guests (≤6 × 500 chars, checked by HistoryTurn).
    Either way, turns that trip the input guard are dropped and personal data is masked."""
    if user:
        turns = [
            # model_construct: HistoryTurn caps *browser* turns at 500 chars; a saved reply
            # can be longer and must not turn the whole chat into a 500 error.
            HistoryTurn.model_construct(role=m.role, content=m.content[:1000])
            for m in memory.load_history(user.id, memory.HISTORY_WINDOW)
        ]
    else:
        turns = guest_turns or []
    return safety.clean_history(turns, actor=actor)


def _validate_page(raw: PageContextIn | None) -> PageContext | None:
    """Turn the browser's page claim into trusted context: known routes only, product
    looked up in the DB (unknown ids dropped), only known filter keys kept."""
    if raw is None:
        return None
    path = raw.path.split("?")[0].split("#")[0].strip() or "/"
    if not path.startswith("/"):
        return None
    product = None
    if path.startswith("/products/"):
        slug = path.removeprefix("/products/").strip("/")
        product = get_product(raw.product_id or slug) if (raw.product_id or slug) else None
        page_name = "product detail"
    else:
        page_name = PAGE_NAMES.get(path.rstrip("/") or "/", "other")
    filters: dict[str, str] = {}
    if path.rstrip("/") == "/products" and raw.query:
        for key, value in parse_qsl(raw.query)[:20]:
            if key in PAGE_FILTER_KEYS and value:
                filters[key] = value[:80]
    return PageContext(
        path=path[:200],
        page=page_name,
        product_id=product.product_id if product else None,
        product_name=product.name if product else None,
        filters=filters,
    )


@app.post("/api/chat", response_model=ChatReply)
async def chat(
    body: ChatRequestBody, request: Request, cc_session: str | None = Cookie(default=None)
) -> ChatReply:
    """One turn with Handsome Dan. Signed-in shoppers get their saved history replayed and
    the turn saved; guests may send their last few turns (never stored). The agent is
    imported lazily so the shop still boots without an API key.

    Safety pipeline (safety.py): rate limit → input length → input guard → daily token
    budget → run_chat → output guard → count tokens + save memory. A blocked message gets
    a polite in-chat decline (HTTP 200) without calling the model and is not saved; the
    per-minute and daily limits answer 429. Every block is written to the audit trail
    with its rule name only, never the message text."""
    user = get_current_user(cc_session)
    client_ip = request.client.host if request.client else None
    actor = audit.actor_key(user.id if user else None, client_ip)
    key = f"user:{user.id}" if user else f"ip:{client_ip or 'unknown'}"

    # 1. Per-minute rate limit (20 messages / minute per shopper).
    if _rate_limited(key):
        _note_rate_limited(key, actor)
        raise HTTPException(status_code=429, detail="Too many questions right now. Please try again shortly.")

    # 2. Input length: ChatRequestBody caps a message at 2,000 chars; blank isn't a question.
    message = body.message.strip()
    if not message:
        return ChatReply(content=safety.EMPTY_REPLY)

    # 3. Input guard: decline before the model is called, so a blocked message costs no tokens.
    guard = safety.check_input(message)
    if guard.blocked:
        safety.log_blocked(actor, guard.rule or "input")
        return ChatReply(content=guard.reply or safety.PRIVACY_REPLY)

    # 4. Daily token budget (200,000 signed in / 60,000 guest per day; see safety.py).
    if safety.over_daily_budget(actor, signed_in=user is not None):
        safety.log_blocked(actor, "daily_budget")
        raise HTTPException(status_code=429, detail=safety.DAILY_LIMIT_MESSAGE)

    page = _validate_page(body.page)
    history = _chat_history(user, body.history, actor)
    model_message = safety.minimize(message)  # no emails/phones/keys/addresses to the model or memory

    try:
        from pydantic_ai.exceptions import ContentFilterError, UnexpectedModelBehavior, UsageLimitExceeded

        from agent import CHAT_LIMITS, AgentConfigError, run_chat  # lazy: avoids requiring PORTKEY_API_KEY at startup
    except Exception as exc:  # pragma: no cover - import/config failure
        log.error("Agent import failed: %s", type(exc).__name__)
        raise HTTPException(status_code=503, detail="The shop assistant is unavailable right now.")
    try:
        reply = await run_chat(model_message, user=user, page=page, history=history, actor=actor)
    except AgentConfigError as exc:
        # Missing API key etc. Message is safe (no secret values).
        log.error("Agent config error: %s", exc)
        raise HTTPException(status_code=503, detail="The shop assistant isn't configured yet.")
    except Exception as exc:  # model/network failure or a per-turn limit
        # A failed turn still counts toward the daily budget: run_chat attaches the tokens
        # it used (exc.usage_tokens) and has already written an "error" audit entry.
        used = getattr(exc, "usage_tokens", None)
        if isinstance(exc, ContentFilterError) or "content_filter" in str(exc).lower():
            # Upstream safety filter blocked the prompt (e.g. a jailbreak). Decline politely;
            # not saved, so it is never replayed as history.
            log.info("Chat blocked by upstream content filter")
            safety.add_tokens(actor, used)
            return ChatReply(
                content=(
                    "I can only help with Campus Customs gear and our shop. Ask me about "
                    "Yale hoodies, crewnecks, sizing, prices, or our store on Broadway."
                )
            )
        if isinstance(exc, (UsageLimitExceeded, UnexpectedModelBehavior)):
            # Per-turn cap (CHAT_LIMITS: requests, tool calls, tokens) or validator retries
            # used up: a polite 200, not a 503.
            if used is None and isinstance(exc, UsageLimitExceeded):
                used = getattr(CHAT_LIMITS, "total_tokens_limit", None) or safety.estimate_tokens(model_message)
            safety.add_tokens(actor, used)
            log.info("Chat turn stopped by a per-turn limit: %s", type(exc).__name__)
            return ChatReply(content=safety.TURN_CAP_REPLY)
        safety.add_tokens(actor, used)
        if getattr(exc, "status_code", None) == 429:
            log.warning("Chat rate-limited upstream")
            raise HTTPException(status_code=429, detail="Too many questions right now. Please try again shortly.")
        log.error("Agent run failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(status_code=503, detail="The shop assistant hit a snag. Please try again.")

    # 5. Output guard: no outside links, personal data, or secrets; at most 1,500 chars.
    reply.content = safety.check_output(reply.content, actor=actor)
    if reply.page_results is not None:
        reply.page_results.label = safety.scrub_output(reply.page_results.label)[0][:80]

    # 6. Count the turn against today's budget, then remember it (members only).
    used = reply.usage_tokens
    if used is None:  # run_chat didn't report usage: rough estimate
        used = safety.estimate_tokens(model_message, reply.content, *(t.content for t in history))
    safety.add_tokens(actor, used)
    if user:
        memory.save_turn(user.id, model_message, reply.content, reply.products, page.path if page else None)
    return reply


def _require_user(cc_session: str | None):
    user = get_current_user(cc_session)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to see your chat history.")
    return user


@app.get("/api/chat/history", response_model=ChatHistory)
def chat_history(cc_session: str | None = Cookie(default=None)) -> ChatHistory:
    """The signed-in shopper's saved chat (oldest first, last 40 messages)."""
    user = _require_user(cc_session)
    return ChatHistory(messages=memory.load_history(user.id))


@app.delete("/api/chat/history", status_code=204)
def forget_chat_history(cc_session: str | None = Cookie(default=None)) -> Response:
    """Erase the signed-in shopper's saved chat ("Forget my chats")."""
    user = _require_user(cc_session)
    removed = memory.clear_history(user.id)
    log.info("Cleared %s chat messages for user %s", removed, user.id)
    return Response(status_code=204)


@app.get("/api/chat/welcome", response_model=ChatWelcome)
def chat_welcome(cc_session: str | None = Cookie(default=None)) -> ChatWelcome:
    """Welcome-back pop-up. Built from saved history and live stock — no model call, so it
    is instant and free. greeting is null when the shopper has never chatted."""
    user = _require_user(cc_session)
    past, questions = memory.recent_interests(user.id, limit=3)
    if not past and not questions:
        return ChatWelcome()
    name = user.first_name or user.name
    from tools import _to_card  # live card: current price and stock, not the saved copy

    cards = [_to_card(p) for p in (get_product(c.product_id) for c in past) if p is not None]
    if cards:
        first = cards[0]
        if first.total_stock > 0:
            line = f"Still thinking about the {first.name}? It's ${first.price:.0f} and in stock."
        else:
            line = f"The {first.name} you looked at is sold out right now, but I can find you something similar."
        greeting = f"Welcome back, {name}! {line} Want to take another look, or buy it this time?"
    else:
        greeting = f"Welcome back, {name}! Want to pick up where we left off?"
    return ChatWelcome(greeting=greeting, products=cards)


class RevalidatingStaticFiles(StaticFiles):
    """Static files that browsers must re-check (cheap 304 via ETag) instead of reusing
    stale copies — the photos were replaced once already (black → white backgrounds)."""

    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "no-cache"
        return response


app.mount("/media/products", RevalidatingStaticFiles(directory=PRODUCTS_IMG_DIR), name="product-images")
