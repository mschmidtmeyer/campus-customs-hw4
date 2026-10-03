"""Seasons + Handsome Dan facts.

GET /api/season?season=<winter|spring|summer|fall>  -> SeasonInfo: hero copy + up to 8 live,
    in-stock seasonal picks. No param = today's season in New Haven (America/New_York);
    the param previews another season (anything else -> 422).
GET /api/dan/facts                                  -> {facts: [{id, text}]} (see dan_facts.py)

Picks are chosen in code from the real catalogue, never by the model: each season has an
ordered list of slots (garment types, or game-day keywords), and slots take turns so the
picks mix types. Inside a slot, products in stock in 3+ sizes come first, then higher
stock plus a small bonus seeded by today's date (stable all day, fresh tomorrow), and a
slot tries a new main color before repeating one. The agent tool get_seasonal_picks
(tools.py) uses the same function, so chat and the website always agree.
"""

from __future__ import annotations

import zlib
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import TYPE_CHECKING, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Query

from dan_facts import DAN_FACTS
from models import DanFacts, SeasonInfo

if TYPE_CHECKING:  # main imports this module, so main is only imported lazily at runtime
    from main import Product

router = APIRouter(tags=["season"])

SeasonName = Literal["winter", "spring", "summer", "fall"]
SEASONS: tuple[str, ...] = ("winter", "spring", "summer", "fall")
MAX_PICKS = 8

try:
    NEW_HAVEN_TZ = ZoneInfo("America/New_York")
except ZoneInfoNotFoundError:  # pragma: no cover - no tz database installed
    NEW_HAVEN_TZ = timezone(timedelta(hours=-5), "EST")


def today_in_new_haven() -> date:
    return datetime.now(NEW_HAVEN_TZ).date()


def season_for(day: date) -> str:
    """Meteorological seasons, same as seasonForDate() in seasonContext.ts."""
    if day.month in (12, 1, 2):
        return "winter"
    if day.month <= 5:
        return "spring"
    if day.month <= 8:
        return "summer"
    return "fall"


# --------------------------------------------------------------------------
# Seasonal copy (Campus Customs voice)
# --------------------------------------------------------------------------

COPY: dict[str, dict[str, str | None]] = {
    "winter": {
        "label": "Winter",
        "headline": "Warm layers for a New Haven winter",
        "tagline": "Fleece, full-zips, and cozy hoodies to keep you warm from Cross Campus to Broadway.",
        "campus_title": "Snow in the Hopper College courtyard",
        "note": "Shopping for the holidays? A Yale fleece or full-zip makes a warm gift.",
    },
    "spring": {
        "label": "Spring",
        "headline": "Lighter layers for longer days",
        "tagline": "Quarter-zips and crewnecks for breezy mornings and sunny afternoons on campus.",
        "campus_title": "Saybrook's Killingworth Court in bloom",
        "note": "Commencement is in May. A Yale crewneck makes a proud graduation gift.",
    },
    "summer": {
        "label": "Summer",
        "headline": "Bright tees for long summer days",
        "tagline": "Easy tees and light long sleeves for summer on the Green and beyond.",
        "campus_title": "Harkness Tower from Old Campus",
        "note": "Visiting New Haven this summer? Stop by our shop at 57 Broadway.",
    },
    "fall": {
        "label": "Fall",
        "headline": "Crisp air, Yale blue, game days ahead",
        "tagline": "Crewnecks, hoodies, and quarter-zips for crisp walks under the elms, and The Game.",
        "campus_title": "Autumn walk by Cross Campus",
        "note": "The Game vs. Harvard is in November — gear up.",
    },
}


# --------------------------------------------------------------------------
# Pick rules
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class _Slot:
    """One kind of seasonal pick. A product fits when every given filter matches:
    garment type, a color, and a keyword in its name/search tags. Keyword tiers rank
    earlier tiers first ("The Game" before plain "football")."""

    garment_types: tuple[str, ...] = ()
    colors: tuple[str, ...] = ()
    keyword_tiers: tuple[tuple[str, ...], ...] = ()

    def tier(self, p: Product) -> int | None:
        """None = doesn't fit this slot; otherwise its keyword tier (0 = best)."""
        if self.garment_types and p.garment_type.lower() not in self.garment_types:
            return None
        if self.colors and not any(c.lower() in self.colors for c in p.colors):
            return None
        if not self.keyword_tiers:
            return 0
        text = " | ".join([p.name, *p.search_tags]).lower()
        for rank, words in enumerate(self.keyword_tiers):
            if any(w in text for w in words):
                return rank
        return None


def _types(*names: str) -> _Slot:
    return _Slot(garment_types=names)


GAME_DAY = _Slot(keyword_tiers=(("the game", "harvard"), ("football", "gameday", "game day")))

# Slots take turns in this order, so the first picks are all different kinds.
SEASON_SLOTS: dict[str, tuple[_Slot, ...]] = {
    # warmest first
    "winter": (
        _types("fleece jacket"),
        _types("bomber jacket"),
        _types("full-zip hoodie"),
        _types("pullover hoodie"),
        _types("quarter-zip pullover"),
    ),
    "spring": (
        _types("quarter-zip pullover"),
        _types("crewneck sweatshirt"),
        _types("mockneck sweatshirt"),
        _types("long-sleeve performance shirt"),
    ),
    "summer": (
        _Slot(garment_types=("short-sleeve t-shirt",), colors=("coral",)),  # the coral tri-blend leads
        _types("short-sleeve t-shirt"),
        _types("long-sleeve performance shirt"),
    ),
    "fall": (
        _types("crewneck sweatshirt"),
        _types("pullover hoodie"),
        _types("quarter-zip pullover"),
        GAME_DAY,
    ),
}

DAILY_BONUS = 25  # up to this many "units" of stock, reshuffled each day


def _daily_bonus(day: date, product_id: str) -> int:
    # crc32, not hash(): Python's str hash changes per process, this must not.
    return zlib.crc32(f"{day.isoformat()}|{product_id}".encode()) % DAILY_BONUS


def _sizes_in_stock(p: Product) -> int:
    return sum(1 for line in p.inventory if line.quantity > 0)


def _main_color(p: Product) -> str:
    return p.colors[0].lower() if p.colors else ""


def seasonal_picks(season: str, day: date | None = None, limit: int = MAX_PICKS) -> list[Product]:
    """Up to `limit` live, in-stock products for `season`, deterministic for a given day."""
    import main  # lazy: main imports this module at startup

    day = day or today_in_new_haven()
    in_stock = [p for p in main.search_products(in_stock=True) if p.total_stock > 0]
    pools: list[list[Product]] = []
    for slot in SEASON_SLOTS[season]:
        fits = [(t, p) for p in in_stock if (t := slot.tier(p)) is not None]
        fits.sort(
            key=lambda tp: (
                tp[0],
                _sizes_in_stock(tp[1]) < 3,
                -(tp[1].total_stock + _daily_bonus(day, tp[1].product_id)),
                tp[1].product_id,
            )
        )
        pools.append([p for _, p in fits])

    picks: list[Product] = []
    taken: set[str] = set()
    colors_used: list[set[str]] = [set() for _ in pools]
    while len(picks) < limit:
        added = False
        for i, pool in enumerate(pools):
            if len(picks) >= limit:
                break
            left = [p for p in pool if p.product_id not in taken]
            if not left:
                continue
            choice = next((p for p in left if _main_color(p) not in colors_used[i]), left[0])
            picks.append(choice)
            taken.add(choice.product_id)
            colors_used[i].add(_main_color(choice))
            added = True
        if not added:
            break
    return picks


def season_info(season: str | None = None, day: date | None = None) -> SeasonInfo:
    day = day or today_in_new_haven()
    season = season or season_for(day)
    copy = COPY[season]
    return SeasonInfo(
        season=season,
        label=copy["label"],
        headline=copy["headline"],
        tagline=copy["tagline"],
        campus_title=copy["campus_title"],
        picks=[p.model_dump() for p in seasonal_picks(season, day)],
        note=copy["note"],
    )


def today_line(day: date | None = None) -> str:
    """One line for the agent's per-turn context, e.g.
    "Today in New Haven it's fall (October 3). The Game vs. Harvard is in November — gear up." """
    day = day or today_in_new_haven()
    season = season_for(day)
    line = f"Today in New Haven it's {season} ({day:%B} {day.day})."
    note = COPY[season]["note"]
    return f"{line} {note}" if note else line


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------


@router.get("/api/season", response_model=SeasonInfo)
def get_season(
    season: SeasonName | None = Query(
        default=None, description="Preview another season; omit for today's season in New Haven."
    ),
) -> SeasonInfo:
    return season_info(season)


@router.get("/api/dan/facts", response_model=DanFacts)
def get_dan_facts() -> DanFacts:
    return DanFacts(facts=list(DAN_FACTS))
