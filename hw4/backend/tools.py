"""Tools the Campus Customs agent can call.

Every tool reads the catalogue and inventory through the read-only helpers in
main.py (the single source of truth) and returns typed models from models.py.
Tools never write to the database and never invent data: prices, colors, sizes,
descriptions, and stock are passed through exactly as stored. Stock is always
reported per size with an explicit sold-out flag, so the agent can answer "out of
stock in L" honestly without guessing. When the database is updated, the tools
return the new values on the next call.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from pydantic_ai import RunContext

import main  # reuse search_products / get_product / get_filter_options
import memory
import search
from models import (
    CatalogueFacts,
    CustomerProfile,
    PageContext,
    PastInterests,
    ProductCard,
    ProductDetail,
    ProductSummary,
    SearchResults,
    SeasonalPicks,
    SizeStock,
    StockResult,
    WishlistSummary,
)

MAX_RESULTS = 30  # covers the largest garment type (28), so a type search sees the whole catalogue slice
WISHLIST_TOOL_CAP = 12  # newest saved items sent to the model; `count` still reports the full total
SIZE_ORDER = ("XS", "S", "M", "L", "XL", "XXL")


def _singular(text: str) -> str:
    """Lowercase and drop a plural 's' per word: "Navy Hoodies" -> "navy hoodie".
    Leaves "ss" endings alone ("dress")."""
    words = []
    for w in text.strip().lower().split():
        if len(w) > 3 and w.endswith("s") and not w.endswith("ss"):
            w = w[:-1]
        words.append(w)
    return " ".join(words)


def _resolve_garment_type(value: str | None) -> tuple[str | None, str | None]:
    """Map a loose garment word to an exact catalogue garment_type.
    Returns (exact_type_or_None, leftover_keyword_or_None). If the word matches exactly
    one known type it is used as a filter; if it matches several (e.g. "hoodie" ->
    pullover + full-zip) or none, it is handed back as a search keyword instead so the
    agent never gets a wrong empty result from an over-specific filter."""
    if not value or not value.strip():
        return None, None
    needle = _singular(value)
    types = main.get_filter_options().garment_types
    exact = [t for t in types if t.lower() == value.strip().lower()]
    if exact:
        return exact[0], None
    partial = [t for t in types if needle in t.lower()]
    if len(partial) == 1:
        return partial[0], None
    # Catalogue text is singular ("hoodie"), and search is a substring match,
    # so hand back the singular form: "hoodies" would match nothing.
    return None, needle


@dataclass
class ShopDeps:
    """Shared state for one chat turn. `shown` collects the cards the agent surfaced."""

    shown: dict[str, ProductCard] = field(default_factory=dict)
    first_name: str | None = None
    user: "object | None" = None  # auth.User of the signed-in shopper, None for guests
    page: PageContext | None = None  # validated current page

    def remember(self, products: list["main.Product"]) -> None:
        for p in products:
            self.shown.setdefault(p.product_id, _to_card(p))


def _size_lines(product: "main.Product") -> list[SizeStock]:
    return [SizeStock(size=s.size, quantity=s.quantity, in_stock=s.quantity > 0) for s in product.inventory]


def _to_card(product: "main.Product") -> ProductCard:
    return ProductCard(
        product_id=product.product_id,
        name=product.name,
        garment_type=product.garment_type,
        price=product.price,
        colors=product.colors,
        image_url=product.image_url,
        total_stock=product.total_stock,
        inventory=_size_lines(product),
    )


def _to_summary(product: "main.Product") -> ProductSummary:
    return ProductSummary(
        product_id=product.product_id,
        name=product.name,
        garment_type=product.garment_type,
        price=product.price,
        colors=product.colors,
        total_stock=product.total_stock,
        in_stock=product.total_stock > 0,
        image_url=product.image_url,
    )


def _to_detail(product: "main.Product") -> ProductDetail:
    sizes = _size_lines(product)
    return ProductDetail(
        product_id=product.product_id,
        name=product.name,
        garment_type=product.garment_type,
        description=product.description,
        price=product.price,
        colors=product.colors,
        search_tags=product.search_tags,
        image_url=product.image_url,
        sizes=sizes,
        total_stock=product.total_stock,
        sizes_in_stock=[s.size for s in sizes if s.in_stock],
        sizes_sold_out=[s.size for s in sizes if not s.in_stock],
    )


def register_tools(agent) -> None:
    """Attach the shop tools to a PydanticAI Agent[ShopDeps, str]."""

    @agent.tool
    def search_catalogue(
        ctx: RunContext[ShopDeps],
        query: str | None = None,
        garment_type: str | None = None,
        color: str | None = None,
        size: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        in_stock_only: bool = False,
    ) -> SearchResults:
        """Search Campus Customs apparel. Use for any request about what we sell, by
        keyword (team, college, school, 'dad', 'game day'), garment type, color, size,
        or price. `garment_type` may be a loose word like "hoodie"; it is matched
        leniently. `size` keeps only products in stock in that size. Returns up to 30
        real products (no invented data). `total_matches` is the exact count — quote it,
        never count yourself. total_matches 0 means we truly have no match."""
        gtype, extra = _resolve_garment_type(garment_type)
        if extra:
            query = f"{query} {extra}".strip() if query else extra
        products = main.search_products(
            q=query,
            garment_type=gtype,
            color=color,
            size=size.upper() if size else None,
            min_price=min_price,
            max_price=max_price,
            in_stock=in_stock_only,
            sort="name",
        )
        shown = products[:MAX_RESULTS]
        ctx.deps.remember(shown)
        fixes = search.plan_search(query, color).corrections if (query or color) else {}
        return SearchResults(
            total_matches=len(products),
            products=[_to_summary(p) for p in shown],
            did_you_mean=fixes or None,
        )

    @agent.tool
    def get_product_details(ctx: RunContext[ShopDeps], product_id: str) -> ProductDetail | None:
        """Full database record for one product by product_id: description, price,
        colors, search tags, and stock for every size XS–XXL with which sizes are in
        stock and which are sold out. Use whenever the shopper asks about a specific
        item, its price, its colors, or its description. Returns null if no such product."""
        product = main.get_product(product_id)
        if product is None:
            return None
        ctx.deps.remember([product])
        return _to_detail(product)

    @agent.tool
    def check_stock(
        ctx: RunContext[ShopDeps], product_id: str, size: str | None = None
    ) -> StockResult | None:
        """Current stock for a product, straight from the database. Use for any "do you
        have…", "is it in stock", or size-availability question. Pass `size` (XS–XXL) to
        check one size, or omit it for all sizes. Reports exact quantities and says
        clearly when a size is sold out. Returns null if there is no such product."""
        product = main.get_product(product_id)
        if product is None:
            return None
        ctx.deps.remember([product])
        lines = _size_lines(product)
        if size:
            want = size.upper()
            lines = [s for s in lines if s.size == want]
            if not lines:
                return StockResult(
                    product_id=product.product_id,
                    name=product.name,
                    price=product.price,
                    sizes=[],
                    total_stock=product.total_stock,
                    any_in_stock=False,
                    summary=f"{want} is not a size we carry. Sizes are XS, S, M, L, XL, XXL.",
                )
        in_stock = [s for s in lines if s.in_stock]
        sold_out = [s for s in lines if not s.in_stock]
        if size:
            line = lines[0]
            summary = (
                f"{product.name} in {line.size}: {line.quantity} in stock."
                if line.in_stock
                else f"{product.name} is sold out in {line.size}."
            )
            if not line.in_stock and product.total_stock > 0:
                others = ", ".join(s.size for s in _size_lines(product) if s.in_stock)
                summary += f" In stock in: {others}." if others else ""
        elif not in_stock:
            summary = f"{product.name} is sold out in every size right now."
        elif not sold_out:
            summary = f"{product.name} is in stock in all sizes (XS–XXL)."
        else:
            summary = (
                f"{product.name}: in stock in {', '.join(s.size for s in in_stock)}; "
                f"sold out in {', '.join(s.size for s in sold_out)}."
            )
        return StockResult(
            product_id=product.product_id,
            name=product.name,
            price=product.price,
            sizes=lines,
            total_stock=product.total_stock,
            any_in_stock=bool(in_stock),
            summary=summary,
        )

    @agent.tool_plain
    def list_filter_options() -> CatalogueFacts:
        """The valid garment types, colors, size list, and price range in the catalogue.
        Use to answer 'what colors/types do you carry?' or before filtering, so you only
        offer options that exist."""
        o = main.get_filter_options()
        return CatalogueFacts(
            garment_types=o.garment_types,
            colors=o.colors,
            sizes=list(o.sizes),
            price_min=o.price_min,
            price_max=o.price_max,
        )

    @agent.tool
    def get_customer_profile(ctx: RunContext[ShopDeps]) -> CustomerProfile:
        """Who you are talking to: the signed-in shopper's first name and member-since
        date, or signed_in=false for a guest. Use it to greet by name. It never includes
        email, phone, address, last name, or passwords: if the shopper asks for those,
        tell them their details are on their My Profile page (/profile)."""
        u = ctx.deps.user
        if u is None:
            return CustomerProfile(signed_in=False)
        # Data minimisation: only these fields, chosen one by one, ever reach the model.
        return CustomerProfile(
            signed_in=True,
            first_name=u.first_name,
            member_since=(getattr(u, "created_at", None) or None),
        )

    @agent.tool
    def get_past_interests(ctx: RunContext[ShopDeps]) -> PastInterests:
        """Products you showed this signed-in shopper in earlier chats (newest first) and
        their last few questions. Use for "what was that hoodie I looked at?" or to suggest
        something they liked before. Empty for guests. Stock in these cards may be old:
        call check_stock before stating availability."""
        u = ctx.deps.user
        if u is None:
            return PastInterests()
        products, questions = memory.recent_interests(u.id)
        return PastInterests(products=products, recent_questions=questions)

    @agent.tool
    def get_current_page(ctx: RunContext[ShopDeps]) -> PageContext | None:
        """The page the shopper is on right now (validated by the server): page type,
        and on a product page the product_id and name. Use it to resolve "this", "it", or
        "this one" — e.g. "is this in M?" on a product page means that product."""
        return ctx.deps.page

    @agent.tool_plain
    def store_info() -> dict:
        """Campus Customs store facts: address and opening hours. Use for 'where are you?'
        or 'when are you open?'."""
        return {
            "name": "Campus Customs",
            "address": "57 Broadway, New Haven, CT 06511",
            "hours": {
                "Monday-Friday": "9:30 AM - 9:00 PM",
                "Saturday": "9:30 AM - 9:00 PM",
                "Sunday": "10:00 AM - 6:00 PM",
            },
            "online_checkout": False,
            "note": "Custom orders and accessories are available in store.",
        }

    @agent.tool
    def get_wishlist(ctx: RunContext[ShopDeps]) -> WishlistSummary:
        """The signed-in shopper's saved wishlist (newest first) with LIVE price and stock
        per size. Use for "what's on my wishlist?" or "is anything on my wishlist in stock
        in M?" — check each card's inventory for that size. Guests get signed_in=false."""
        u = ctx.deps.user
        if u is None:
            return WishlistSummary(
                signed_in=False,
                note="Guests have no wishlist. Sign in and tap the heart on any product to save it.",
            )
        import wishlist  # local import: wishlist imports main lazily too

        import main as _main

        all_cards = [e.product for e in wishlist.wishlist_entries(u.id)]
        cards = all_cards[:WISHLIST_TOOL_CAP]  # result cap keeps the model's context small
        products = [p for p in (_main.get_product(c.product_id) for c in cards) if p is not None]
        ctx.deps.remember(products)
        return WishlistSummary(
            signed_in=True,
            count=len(all_cards),
            products=cards,
            note=None if cards else "The wishlist is empty. Tap the heart on any product to save it.",
        )

    @agent.tool
    def get_seasonal_picks(ctx: RunContext[ShopDeps], season: str | None = None) -> SeasonalPicks:
        """Live, in-stock seasonal picks (up to 8, mixed garment types) for winter, spring,
        summer, or fall: the same picks the home page shows. Omit `season` for today's
        season in New Haven. Use for "what should I wear...", "what's good for winter?",
        "something warm/light", or seasonal gift ideas. Every product is real and in stock
        right now; call check_stock before promising a specific size."""
        from season import COPY, SEASONS, season_for, seasonal_picks, today_in_new_haven

        today = today_in_new_haven()
        current = season_for(today)
        wanted = (season or "").strip().lower()
        wanted = {"autumn": "fall", "holiday": "winter", "holidays": "winter"}.get(wanted, wanted)
        chosen = wanted if wanted in SEASONS else current
        products = seasonal_picks(chosen, today)
        ctx.deps.remember(products)
        return SeasonalPicks(
            season=chosen,
            label=str(COPY[chosen]["label"]),
            is_current_season=chosen == current,
            note=COPY[chosen]["note"],
            products=[_to_summary(p) for p in products],
        )
