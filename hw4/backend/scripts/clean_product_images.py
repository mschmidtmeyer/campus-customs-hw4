"""Make web copies of the product photos with a clean white background.

73 of the 102 catalogue photos come with a pure-black background (some are a white
photo with black side bars). On the site those show as black boxes and navy garments
nearly disappear. This script flood-fills the near-black area that touches the image
border, turns it white, and writes the result to data/products_web/<same name>.jpg.
The originals in data/products/ are never modified. main.py serves /media/products
from products_web when it exists.

Usage (from HW 4/backend):  .venv/bin/python scripts/clean_product_images.py
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent.parent
SRC = ROOT / "data" / "products"
DST = ROOT / "data" / "products_web"

DARK = 28  # a pixel is "background black" if all channels <= DARK
WHITE = (255, 255, 255)


def border_black_mask(im: Image.Image) -> Image.Image:
    """L-mode mask: 255 where a near-black pixel is connected to the image border."""
    w, h = im.size
    px = im.load()
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    q: deque[tuple[int, int]] = deque()

    def is_dark(x: int, y: int) -> bool:
        r, g, b = px[x, y]
        return r <= DARK and g <= DARK and b <= DARK

    for x in range(w):
        for y in (0, h - 1):
            if is_dark(x, y) and not mp[x, y]:
                mp[x, y] = 255
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_dark(x, y) and not mp[x, y]:
                mp[x, y] = 255
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not mp[nx, ny] and is_dark(nx, ny):
                mp[nx, ny] = 255
                q.append((nx, ny))
    return mask


def clean(path: Path) -> tuple[str, float]:
    im = Image.open(path).convert("RGB")
    mask = border_black_mask(im)
    share = 1 - mask.histogram()[0] / (im.size[0] * im.size[1])
    if share < 0.02:  # already a light background: copy as-is
        im.save(DST / path.name, "JPEG", quality=90, optimize=True)
        return "kept", share
    # Grow the mask by 1px and feather it, so the dark anti-aliased rim around the
    # garment fades into white instead of leaving a black outline.
    soft = mask.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = Image.composite(Image.new("RGB", im.size, WHITE), im, soft)
    out.save(DST / path.name, "JPEG", quality=90, optimize=True)
    return "cleaned", share


def main() -> None:
    DST.mkdir(exist_ok=True)
    counts = {"cleaned": 0, "kept": 0}
    for p in sorted(SRC.glob("*.jpg")):
        kind, share = clean(p)
        counts[kind] += 1
        if kind == "cleaned":
            print(f"cleaned {p.name}  ({share:.0%} background)")
    print(counts, "->", DST)


if __name__ == "__main__":
    main()
