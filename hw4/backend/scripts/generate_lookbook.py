"""Generate the AI lookbook: people wearing real Campus Customs products on the Yale campus.

Each image is made with the OpenAI image-edit endpoint (through Portkey), using the
product's own catalogue photo as the reference, so the person wears that exact garment.
Outputs go to frontend/public/lookbook/<season>-<product_id>.jpg plus lookbook.json,
which the website's Lookbook section reads. Existing images are skipped (re-running
costs nothing unless you pass --force). The images are labeled "AI-generated" on the site.

Status (2026-10-03): the course Portkey key routes every image request to the text
deployment, so image edits/generation fail ("Unexpected deployment name…" /
"imageGenerations operation does not work with … gpt-5.6-luna"). The site therefore
uses CSS-illustrated models wearing the real product photos. Run this script with an
image-enabled key (set PORTKEY_API_KEY or point PORTKEY_BASE_URL elsewhere) to add photos.

Usage (from HW 4/backend):
    .venv/bin/python scripts/generate_lookbook.py --only fall-2025-yale-vs-harvard-t-shirt
    .venv/bin/python scripts/generate_lookbook.py            # all missing images
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent
PRODUCTS = ROOT / "data" / "products"
OUT = ROOT / "frontend" / "public" / "lookbook"

for d in (BACKEND, ROOT, ROOT.parent):
    load_dotenv(d / ".env", override=False)

MODEL = os.getenv("LOOKBOOK_IMAGE_MODEL", "gpt-image-2")
SIZE = "1024x1536"  # portrait, editorial
QUALITY = os.getenv("LOOKBOOK_QUALITY", "medium")

STYLE = (
    "Editorial lifestyle photograph for Campus Customs, a New Haven shop selling officially "
    "licensed Yale apparel. Photorealistic, natural light, 35mm lens, shallow depth of field, "
    "candid and warm. The person wears EXACTLY the garment shown in the reference image: same "
    "color, same cut, same graphics, lettering and crest in the same place. Do not change, add, "
    "or remove any text or logo on the garment. Simple neutral bottoms. No other brand logos, "
    "no text overlays, no watermarks. Full garment clearly visible, three-quarter-length framing."
)

# (season, product_id, title, caption, person + scene)
PLAN: list[tuple[str, str, str, str, str]] = [
    ("fall", "2025-yale-vs-harvard-t-shirt", "Game day at the Bowl",
     "The Game vs. Harvard, every November.",
     "A cheerful student in their early twenties with curly dark hair at a tailgate outside the "
     "Yale Bowl's stone arches on a crisp, sunny November afternoon; fans in blue softly blurred behind."),
    ("fall", "champion-reverse-weave-crewneck", "Leaves on Old Campus",
     "Classic crewneck weather.",
     "A student with short blond hair walking across Old Campus holding a coffee, orange and red "
     "leaves falling, Gothic stone buildings and tall elms behind, golden afternoon light."),
    ("fall", "saybrook-college-crewneck", "Courtyard afternoons",
     "Rep your residential college.",
     "A student with long black hair sitting on stone steps in a collegiate Gothic courtyard with "
     "ivy turning red on the walls, books beside them, soft autumn light."),
    ("winter", "brooks-brothers-bomber-jacket-yale", "Snow on Cross Campus",
     "Warm layers for New Haven winters.",
     "A student with a short beard walking through snowy Cross Campus, a grand Gothic library "
     "facade behind, light snowfall, cool blue winter light."),
    ("winter", "basic-hoodie-big-yale", "Cocoa at dusk",
     "The hoodie for every winter night.",
     "A student with braided hair holding a hot cocoa on snowy Old Campus at dusk, warm lamp "
     "light, a tall Gothic bell tower glowing in the distance."),
    ("winter", "yale-mom-hoodie", "Family weekend",
     "Proud parents, warm hoodies.",
     "A smiling mother in her fifties with gray-streaked hair visiting campus in winter, "
     "snow-covered lawn and a stone Gothic gateway behind her."),
    ("spring", "yale-maplehouse-diana-mockneck", "Magnolia season",
     "Light layers for spring.",
     "A student with a bob haircut reading under blooming pink magnolia trees beside Gothic stone "
     "buildings, fresh spring sunshine."),
    ("spring", "branford-1-4-zip", "Branford in bloom",
     "Quarter-zips for cool spring mornings.",
     "A student with glasses walking through a green collegiate Gothic courtyard with fresh spring "
     "leaves, a tall Gothic tower rising above."),
    ("spring", "school-of-management-crest-t-shirt", "Between classes",
     "School pride, every day.",
     "A laughing graduate student with a laptop bag outside a modern glass-and-wood academic "
     "building on a bright spring day, green trees around."),
    ("summer", "big-yale-tri-blend-t-shirt", "Summer on the Green",
     "Soft tees for long days.",
     "A student with sun-kissed skin and wavy hair relaxing on the New Haven Green in summer, "
     "bright sunlight, white church steeples and big trees in the background."),
    ("summer", "dry-zone-long-sleeve", "Morning run",
     "Performance layers for early miles.",
     "A runner stretching on a park trail in early summer morning light with tall red-rock cliffs "
     "and green trees behind (East Rock Park, New Haven)."),
    ("summer", "sailing-left-chest-hoodie", "Evening on the Sound",
     "For breezy summer nights by the water.",
     "A student on a wooden dock on the Long Island Sound shoreline at golden hour, small sailboats "
     "on the water behind."),
]


def client() -> OpenAI:
    key = os.environ["PORTKEY_API_KEY"]  # never printed
    return OpenAI(
        api_key=key,
        base_url=os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1"),
        timeout=300,
        default_headers={"x-portkey-api-key": key, "x-portkey-provider": "openai"},
    )


def slug(season: str, product_id: str) -> str:
    return f"{season}-{product_id}"


def generate(c: OpenAI, season: str, product_id: str, scene: str, force: bool) -> Path | None:
    out = OUT / f"{slug(season, product_id)}.jpg"
    if out.exists() and not force:
        print(f"skip  {out.name} (exists)")
        return out
    ref = PRODUCTS / f"{product_id}.jpg"
    prompt = f"{STYLE}\nScene: {scene}"
    kwargs = dict(model=MODEL, prompt=prompt, size=SIZE, quality=QUALITY, n=1)
    with open(ref, "rb") as f:
        try:
            r = c.images.edit(image=f, input_fidelity="high", **kwargs)
        except Exception as e:  # some models don't take input_fidelity
            if "input_fidelity" not in str(e):
                raise
            f.seek(0)
            r = c.images.edit(image=f, **kwargs)
    png = base64.b64decode(r.data[0].b64_json)
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp.write(png)
    OUT.mkdir(parents=True, exist_ok=True)
    # Web-sized JPEG (~1200px tall, quality 82) keeps the page fast.
    subprocess.run(
        ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82", "-Z", "1200", tmp.name, "--out", str(out)],
        check=True, capture_output=True,
    )
    os.unlink(tmp.name)
    print(f"made  {out.name} ({out.stat().st_size // 1024} KB)")
    return out


def write_manifest() -> None:
    entries = []
    for season, pid, title, caption, scene in PLAN:
        f = OUT / f"{slug(season, pid)}.jpg"
        if f.exists():
            entries.append({
                "file": f"/lookbook/{f.name}",
                "product_id": pid,
                "season": season,
                "title": title,
                "caption": caption,
                "alt": f"AI-generated photo: {scene.split(',')[0].lower()} wearing the product.",
            })
    (OUT / "lookbook.json").write_text(json.dumps(entries, indent=2))
    print(f"lookbook.json: {len(entries)} entries")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="season-product_id slug to generate")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    c = client()
    for season, pid, _title, _caption, scene in PLAN:
        if args.only and slug(season, pid) != args.only:
            continue
        try:
            generate(c, season, pid, scene, args.force)
        except Exception as e:
            print(f"FAIL  {slug(season, pid)}: {type(e).__name__}: {str(e)[:300]}", file=sys.stderr)
    write_manifest()


if __name__ == "__main__":
    main()
