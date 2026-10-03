"""Clean the Campus Customs catalogue in data/campus_customs.db (one-time, after placing the data pack).

- garment_type: 22 inconsistent labels -> 9 canonical types. Pullover hoodies
  and full-zip hoodies stay separate types.
- colors: merge spelling variants (navy blue -> navy, ivory -> cream, ...).
- Fill the 3 "Vision blocked" stub rows (description, colors, search_tags)
  from their product photos.

Backs up the original DB to data/campus_customs.original.db on first run.
Safe to re-run: every step maps values to the same canonical result.
"""

import json
import shutil
import sqlite3
from pathlib import Path

DATA = Path(__file__).resolve().parents[2] / "data"  # hw4/data (the local data pack)
DB = DATA / "campus_customs.db"
BACKUP = DATA / "campus_customs.original.db"

GARMENT_TYPES = {
    # T-shirts
    "short-sleeve t-shirt": "short-sleeve t-shirt",
    "short-sleeve T-shirt": "short-sleeve t-shirt",
    "t-shirt": "short-sleeve t-shirt",
    "short-sleeve crew-neck t-shirt": "short-sleeve t-shirt",
    "heavyweight short-sleeve t-shirt": "short-sleeve t-shirt",
    # Long-sleeve shirts
    "long-sleeve performance shirt": "long-sleeve performance shirt",
    "men's long-sleeve performance shirt": "long-sleeve performance shirt",
    # Crewnecks
    "crewneck sweatshirt": "crewneck sweatshirt",
    "crewneck": "crewneck sweatshirt",
    "raglan crewneck sweatshirt": "crewneck sweatshirt",
    "mockneck sweatshirt": "mockneck sweatshirt",
    # Quarter-zips
    "quarter-zip pullover": "quarter-zip pullover",
    "quarter-zip pullover sweatshirt": "quarter-zip pullover",
    # Hoodies: pullover vs full-zip kept apart
    "pullover hoodie": "pullover hoodie",
    "hoodie": "pullover hoodie",
    "hooded sweatshirt": "pullover hoodie",
    "hooded pullover sweatshirt": "pullover hoodie",
    "full-zip hooded sweatshirt": "full-zip hoodie",
    "full-zip hoodie": "full-zip hoodie",
    # Jackets
    "full-zip fleece jacket": "fleece jacket",
    "fleece jacket": "fleece jacket",
    "jacket": "fleece jacket",  # only berkeley-sweater-fleece-jacket
    "bomber jacket": "bomber jacket",
}

COLORS = {
    "navy blue": "navy",
    "navy": "navy",
    "heather gray": "gray",
    "light gray": "gray",
    "gray": "gray",
    "charcoal gray": "charcoal",
    "dark heather gray": "charcoal",
    "dark heather charcoal": "charcoal",
    "heather charcoal gray": "charcoal",
    "charcoal": "charcoal",
    "ivory": "cream",
    "cream": "cream",
    "royal blue": "blue",
    "blue": "blue",
    "light blue": "light blue",
    "dusty coral": "coral",
    "coral": "coral",
}

# Written from the product photos in data/products/.
STUB_FIXES = {
    "benjamin-franklin-t-shirt": {
        "description": "Heather gray short-sleeve crew-neck T-shirt with a red, blue, and white "
        "Benjamin Franklin College shield crest centered on the chest and "
        "BENJAMIN FRANKLIN COLLEGE printed in black beneath it.",
        "colors": ["gray", "red", "blue", "white", "black"],
        "search_tags": ["Yale", "Benjamin Franklin College", "residential college", "crest",
                        "gray T-shirt", "short sleeve", "Campus Customs"],
    },
    "berkeley-sweater-fleece-jacket": {
        "description": "Heather gray full-zip sweater fleece jacket with a stand collar, charcoal "
        "zipper and pocket trim, and an embroidered red Berkeley College crest "
        "with BERKELEY text on the left chest.",
        "colors": ["gray", "charcoal", "red", "white"],
        "search_tags": ["Yale", "Berkeley College", "residential college", "fleece jacket",
                        "full zip", "sweater fleece", "gray jacket", "Campus Customs"],
    },
    "timothy-dwight-college-crewneck": {
        "description": "Heather gray crewneck sweatshirt with ribbed collar, cuffs, and waistband, "
        "and a small red and white Timothy Dwight College crest with "
        "TIMOTHY DWIGHT text on the left chest.",
        "colors": ["gray", "red", "white", "black"],
        "search_tags": ["Yale", "Timothy Dwight College", "TD", "residential college", "crest",
                        "crewneck", "sweatshirt", "gray sweatshirt", "left chest logo",
                        "Campus Customs"],
    },
}


def clean_colors(colors: list[str]) -> list[str]:
    out: list[str] = []
    for c in colors:
        c = COLORS.get(c.strip().lower(), c.strip().lower())
        if c not in out:
            out.append(c)
    return out


def main() -> None:
    if not BACKUP.exists():
        shutil.copy2(DB, BACKUP)
        print(f"Backup written: {BACKUP.name}")

    con = sqlite3.connect(DB)
    rows = con.execute("SELECT product_id, garment_type, colors FROM catalogue").fetchall()
    unknown = sorted({g for _, g, _ in rows if g not in GARMENT_TYPES})
    if unknown:
        raise SystemExit(f"Unmapped garment_type values: {unknown}")

    for product_id, garment_type, colors in rows:
        con.execute(
            "UPDATE catalogue SET garment_type = ?, colors = ? WHERE product_id = ?",
            (GARMENT_TYPES[garment_type], json.dumps(clean_colors(json.loads(colors))), product_id),
        )

    for product_id, fix in STUB_FIXES.items():
        con.execute(
            "UPDATE catalogue SET description = ?, colors = ?, search_tags = ? WHERE product_id = ?",
            (fix["description"], json.dumps(fix["colors"]), json.dumps(fix["search_tags"]), product_id),
        )

    con.commit()
    for g, n in con.execute(
        "SELECT garment_type, COUNT(*) FROM catalogue GROUP BY 1 ORDER BY 2 DESC"
    ):
        print(f"{n:3}  {g}")
    con.close()


if __name__ == "__main__":
    main()
