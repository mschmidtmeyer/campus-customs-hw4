"""Structured types the Campus Customs agent uses.

Two audiences, kept separate on purpose:

1. Types the TOOLS return to the MODEL (ProductSummary, ProductDetail, StockResult,
   SizeStock, CatalogueFacts). These are shaped for grounded answers: every field is
   real data read from campus_customs.db, with explicit in-stock / sold-out flags so
   the agent never has to guess or do arithmetic about availability.
2. Types the CHAT ROUTE returns to the WEBSITE (ChatReply + ProductCard). ProductCard
   is the slim product the chat widget renders as a mini-card.

Nothing here invents data; tools fill these from the database only.
"""

from __future__ import annotations

from pydantic import BaseModel, Field

# --------------------------------------------------------------------------
# Tool return types (agent-facing) — all values come straight from the DB
# --------------------------------------------------------------------------


class SizeStock(BaseModel):
    """Stock for one size of one product."""

    size: str  # XS, S, M, L, XL, XXL
    quantity: int  # units on hand, exactly as stored
    in_stock: bool  # quantity > 0 — spelled out so the agent never recomputes it


class ProductSummary(BaseModel):
    """One row in a search result. Lean: enough to list and compare products."""

    product_id: str
    name: str
    garment_type: str
    price: float  # USD, exact
    colors: list[str] = Field(default_factory=list)
    total_stock: int
    in_stock: bool  # total_stock > 0
    image_url: str


class SearchResults(BaseModel):
    """What search_catalogue returns: the exact number of matches plus the products.
    total_matches is counted in code so the agent never has to count (or guess)."""

    total_matches: int
    products: list[ProductSummary] = Field(default_factory=list)
    # Typo/synonym fixes applied to the query, e.g. {"hooddies": "hoodie", "pink": "coral"}.
    did_you_mean: dict[str, str] | None = None


class ProductDetail(BaseModel):
    """Everything the database knows about one product. Used for a single lookup."""

    product_id: str
    name: str
    garment_type: str
    description: str
    price: float
    colors: list[str] = Field(default_factory=list)
    search_tags: list[str] = Field(default_factory=list)
    image_url: str
    sizes: list[SizeStock] = Field(default_factory=list)  # all six sizes, XS..XXL
    total_stock: int
    sizes_in_stock: list[str] = Field(default_factory=list)
    sizes_sold_out: list[str] = Field(default_factory=list)


class StockResult(BaseModel):
    """Answer to a stock question. Always explicit about what is sold out."""

    product_id: str
    name: str
    price: float
    sizes: list[SizeStock] = Field(default_factory=list)  # the sizes asked about
    total_stock: int
    any_in_stock: bool
    summary: str  # plain-English availability the agent can quote directly


class CatalogueFacts(BaseModel):
    """The valid filter values so the agent only offers options that exist."""

    garment_types: list[str]
    colors: list[str]
    sizes: list[str]
    price_min: float
    price_max: float


# --------------------------------------------------------------------------
# Agent output (structured) — Problem 7 chat search
# --------------------------------------------------------------------------


class ShopAnswer(BaseModel):
    """What the agent must return each turn (its structured output).

    The agent writes its reply AND names the products that answer the shopper.
    agent.py validates `matches` against the products the tools actually returned
    this turn, so the agent cannot invent or misspell a product."""

    reply: str = Field(description="The chat message for the shopper, in Handsome Dan's voice.")
    matches: list[str] = Field(
        default_factory=list,
        description=(
            "product_ids of the products that answer the shopper, best first. Only ids "
            "returned by a tool in this turn. Empty if no specific products apply."
        ),
    )
    show_on_page: bool = Field(
        default=False,
        description=(
            "True when the shopper is browsing or searching a type of item (e.g. 'what "
            "hoodies do you have'), so the website should show these matches as a results "
            "page. False for single-item questions, stock checks, store info, or no matches."
        ),
    )
    search_label: str | None = Field(
        default=None,
        description="Short label for the results page when show_on_page is true, e.g. 'Navy hoodies'.",
    )


class PageResults(BaseModel):
    """Tells the website which products to show on the Products page, in order."""

    label: str
    product_ids: list[str]


# --------------------------------------------------------------------------
# Chat route types (website-facing)
# --------------------------------------------------------------------------


class ProductCard(BaseModel):
    """A product the agent surfaced, rendered by the chat widget's mini-cards.
    Matches the frontend Product shape closely (product_id, name, price, image_url)."""

    product_id: str
    name: str
    garment_type: str
    price: float
    colors: list[str] = Field(default_factory=list)
    image_url: str
    total_stock: int
    inventory: list[SizeStock] = Field(default_factory=list)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


# --------------------------------------------------------------------------
# Customer memory (Problem 8)
# --------------------------------------------------------------------------


class CustomerProfile(BaseModel):
    """What the agent may know about the shopper — data minimisation: only what it needs
    to greet them. Deliberately WITHOUT email, phone, last name, password_hash, session
    tokens, or internal flags, so the model can never read them back in chat. The
    shopper's full details stay on the My Profile page (/profile), which is not the agent."""

    signed_in: bool
    first_name: str | None = None
    member_since: str | None = None  # users.created_at (UTC date)


class PageContextIn(BaseModel):
    """Where the shopper is, as sent by the browser. Untrusted: validated in main.py."""

    path: str = Field(default="/", max_length=200)
    product_id: str | None = Field(default=None, max_length=120)
    query: str | None = Field(default=None, max_length=300)


class PageContext(BaseModel):
    """Validated page context the agent sees (product resolved from the DB)."""

    path: str
    page: str  # human name, e.g. "product detail", "products list", "home"
    product_id: str | None = None
    product_name: str | None = None
    filters: dict[str, str] = Field(default_factory=dict)


class HistoryTurn(BaseModel):
    """A guest's recent message, sent by the browser (guests aren't stored)."""

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=500)


class ChatHistoryMessage(BaseModel):
    id: int
    role: str
    content: str
    products: list[ProductCard] = Field(default_factory=list)
    created_at: str


class ChatHistory(BaseModel):
    messages: list[ChatHistoryMessage] = Field(default_factory=list)


class PastInterests(BaseModel):
    """What a returning shopper looked at before (agent tool result)."""

    products: list[ProductCard] = Field(default_factory=list)
    recent_questions: list[str] = Field(default_factory=list)


class ChatWelcome(BaseModel):
    """Welcome-back pop-up for a signed-in shopper with past chats."""

    greeting: str | None = None
    products: list[ProductCard] = Field(default_factory=list)


class ChatReply(BaseModel):
    """What the chat route returns to the website widget."""

    content: str
    products: list[ProductCard] = Field(default_factory=list)  # chat mini-cards (first few matches)
    page_results: PageResults | None = None  # set when the website should show search results
    # Total tokens this turn used (run_chat fills it from result.usage()); feeds the daily
    # token budget in main.py. Server-side only: excluded from the API response.
    usage_tokens: int | None = Field(default=None, exclude=True)


class WishlistSummary(BaseModel):
    """What get_wishlist returns: the shopper's saved products with LIVE stock per size."""

    signed_in: bool
    count: int = 0
    products: list[ProductCard] = Field(default_factory=list)  # newest saved first
    note: str | None = None


# --------------------------------------------------------------------------
# Seasons + Handsome Dan (season.py, dan_facts.py)
# --------------------------------------------------------------------------


class CatalogueStockLine(BaseModel):
    size: str  # XS..XXL
    quantity: int


class CatalogueProduct(BaseModel):
    """Same JSON shape as main.Product / GET /api/products (frontend `Product`).
    Mirrored here because models.py can't import main (main imports models).
    extra="allow" passes through any field main.Product gains later."""

    model_config = {"extra": "allow"}

    product_id: str
    name: str
    garment_type: str
    description: str
    colors: list[str] = Field(default_factory=list)
    search_tags: list[str] = Field(default_factory=list)
    image_file_path: str
    image_url: str
    price: float
    inventory: list[CatalogueStockLine] = Field(default_factory=list)
    total_stock: int


class SeasonInfo(BaseModel):
    """GET /api/season — matches frontend/src/season/seasonContext.ts `SeasonInfo`."""

    season: str  # winter | spring | summer | fall
    label: str  # "Fall"
    headline: str  # hero headline, <= 8 words
    tagline: str  # one short line, <= 16 words
    campus_title: str  # a real Yale / New Haven place for the season
    picks: list[CatalogueProduct] = Field(default_factory=list)  # <= 8 live, in-stock products
    note: str | None = None


class SeasonalPicks(BaseModel):
    """What get_seasonal_picks returns to the agent: the same live picks as /api/season."""

    season: str
    label: str
    is_current_season: bool  # False when the shopper asked about another season
    note: str | None = None
    products: list[ProductSummary] = Field(default_factory=list)


class DanFact(BaseModel):
    id: str
    text: str


class DanFacts(BaseModel):
    """GET /api/dan/facts"""

    facts: list[DanFact] = Field(default_factory=list)
