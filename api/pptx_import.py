"""Read a PowerPoint deck back INTO the app: pull each slide's packshot
(with its exact position + size), its brand logo, the product title, and
every leftover image, then match slides to existing products by name.

The app is a *structured* generator — one positionable packshot per product
plus a few fixed-zone promo slots — so an arbitrary slide layout cannot be
reproduced pixel-for-pixel. This module therefore does the honest thing:

  * the main packshot   → matched product's packshot + position/size override
  * the brand logo      → reported (optionally applied by the caller)
  * every OTHER image    → saved to the library and reported per slide, so the
    user places it manually. Nothing is silently dropped or mis-placed.

Only classification + matching live here (pure, testable). The route in
`routes/products.py` owns the session mutation and file writes.
"""
from __future__ import annotations

import hashlib
import re
import unicodedata
from dataclasses import dataclass, field
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from pptx import Presentation
from pptx.util import Emu

# Slide geometry the app renders at (mirror generator.SLIDE_W/H and the zones).
SLIDE_W_IN = 13.333
SLIDE_H_IN = 7.5

# App zones in inches (mirror generator.py). A picture is assigned a role when
# its CENTRE falls within the zone (+ a tolerance pad).
LOGO_ZONE     = (10.40, 0.10, 2.80, 1.50)   # top-right brand logo
BANNER_ZONE   = (0.00, 0.00, 4.96, 1.66)    # top-left canal ribbon
PACKSHOT_ZONE = (5.30, 3.60, 2.70, 3.80)    # centre-lower product

# Words that never form a product title — used to drop price/label text.
_LABEL_WORDS = {
    "prix", "gros", "detail", "net", "colisage", "caisse", "caisses",
    "unite", "unites", "consommateur", "pour", "gratuit", "gratuite",
    "gratuits", "gratuites", "remise", "canal", "plan", "commercial",
    "pack", "carton", "sac", "u", "cs", "l", "kg", "gr", "grs", "ml",
}

_PICTURE = 13   # MSO_SHAPE_TYPE.PICTURE


def norm(s: str) -> str:
    """lowercase, strip accents, collapse whitespace; keep '+' (A+)."""
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.lower().split())


def _slug(s: str) -> str:
    s = norm(s).replace("+", "plus")
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s or "image"


@dataclass
class SlideImage:
    role: str                 # "packshot" | "logo" | "banner" | "background" | "extra"
    blob: bytes
    ext: str
    sha: str
    left: float               # inches
    top: float
    width: float
    height: float


@dataclass
class SlideParse:
    index: int                # 1-based slide number
    title: str                # best-guess product name (raw)
    images: List[SlideImage] = field(default_factory=list)

    def by_role(self, role: str) -> List[SlideImage]:
        return [im for im in self.images if im.role == role]


def _shape_rect(shape) -> Tuple[float, float, float, float]:
    return (
        Emu(shape.left or 0).inches, Emu(shape.top or 0).inches,
        Emu(shape.width or 0).inches, Emu(shape.height or 0).inches,
    )


def _in_zone(cx: float, cy: float, zone, pad: float = 0.6) -> bool:
    zl, zt, zw, zh = zone
    return (zl - pad) <= cx <= (zl + zw + pad) and (zt - pad) <= cy <= (zt + zh + pad)


def _guess_title(slide) -> str:
    """Best-guess product name: the longest text line that isn't a price/label
    keyword and isn't a pure number. Falls back to the first text found."""
    candidates: List[str] = []
    for sh in slide.shapes:
        if not sh.has_text_frame:
            continue
        for line in sh.text_frame.text.splitlines():
            t = line.strip()
            if not t:
                continue
            toks = [w for w in norm(t).split() if w not in _LABEL_WORDS]
            # keep lines that still carry real words (a brand/product name)
            has_alpha = any(any(c.isalpha() for c in w) for w in toks)
            if toks and has_alpha and not re.fullmatch(r"[\d\s.,]+", t):
                candidates.append(t)
    if not candidates:
        return ""
    # The product name is usually the most substantial line.
    return max(candidates, key=lambda s: (len(norm(s)), len(s)))


def _classify(rect, slide_w: float, slide_h: float) -> str:
    left, top, w, h = rect
    cx, cy = left + w / 2, top + h / 2
    area_frac = (w * h) / (slide_w * slide_h + 1e-9)
    aspect = w / max(h, 0.01)

    # Full-bleed OR full-width strip (the wood floor spans the whole width but
    # only the lower half, so it isn't caught by area alone) → background.
    if area_frac >= 0.45 or w >= slide_w * 0.9:
        return "background"
    if _in_zone(cx, cy, BANNER_ZONE) and aspect > 1.6 and top < 1.8:
        return "banner"
    if _in_zone(cx, cy, LOGO_ZONE) and w < 3.4 and h < 2.0:
        return "logo"
    # A product packshot sits in the lower ~60% and is roughly upright/square,
    # never a wide decorative strip (aspect < 2.2).
    if cy >= slide_h * 0.40 and aspect < 2.2:
        return "packshot_candidate"
    return "extra"


def parse_pptx(data: bytes) -> Tuple[List[SlideParse], Dict[str, int]]:
    """Parse a PPTX into per-slide (title + classified images).

    Chrome that repeats on many slides (background, banner, default arrow) is
    detected by content hash and dropped up front, so only genuine product
    imagery survives. Of the lower-half candidates the largest is the
    packshot; the rest become 'extra'.
    """
    prs = Presentation(BytesIO(data))
    sw = Emu(prs.slide_width or Emu.from_inches(SLIDE_W_IN)).inches
    sh_ = Emu(prs.slide_height or Emu.from_inches(SLIDE_H_IN)).inches
    n_slides = len(prs.slides)

    # 1st pass: how often does each image (by sha) appear? Frequent = template.
    freq: Dict[str, int] = {}
    raw: List[Tuple[int, str, list]] = []
    for si, slide in enumerate(prs.slides, 1):
        pics = []
        for shape in slide.shapes:
            if shape.shape_type != _PICTURE:
                continue
            try:
                blob = shape.image.blob
                ext = shape.image.ext or "png"
            except Exception:
                continue
            sha = hashlib.sha1(blob).hexdigest()[:16]
            freq[sha] = freq.get(sha, 0) + 1
            pics.append((shape, blob, ext, sha))
        raw.append((si, _guess_title(slide), pics))

    chrome_cut = max(3, int(n_slides * 0.25))    # on ≥25% of slides → chrome

    slides: List[SlideParse] = []
    for si, title, pics in raw:
        sp = SlideParse(index=si, title=title)
        candidates: List[SlideImage] = []
        for shape, blob, ext, sha in pics:
            rect = _shape_rect(shape)
            role = _classify(rect, sw, sh_)
            # Template chrome (background/banner/arrow) repeats — drop it, the
            # app re-adds its own. A LOGO repeats too (every slide of a brand),
            # so we keep logos regardless of frequency.
            if role in ("background", "banner") and freq[sha] >= chrome_cut:
                continue
            if role == "background":             # unique full-bleed → still skip
                continue
            im = SlideImage(role=role, blob=blob, ext=ext, sha=sha,
                            left=rect[0], top=rect[1], width=rect[2], height=rect[3])
            if role == "packshot_candidate":
                candidates.append(im)
            else:
                sp.images.append(im)
        # Largest lower-half candidate = packshot; the rest = extra.
        candidates.sort(key=lambda im: im.width * im.height, reverse=True)
        for i, im in enumerate(candidates):
            im.role = "packshot" if i == 0 else "extra"
            sp.images.append(im)
        slides.append(sp)

    stats = {"slides": n_slides, "unique_images": len(freq)}
    return slides, stats


# Filler words that carry no discriminating power when matching a catalogue
# title ("MIO Matic 3 Kg") to a SKUn ("MIO Detergent Pdr Matic 3Kg").
_MATCH_FILLER = {
    "detergent", "pdr", "poudre", "liquide", "liq", "sachet", "doypack",
    "semi", "auto", "stand", "up", "pillow", "nv", "vf", "flacon", "bidon",
    "rond", "de", "la", "le", "x",
}


def _match_tokens(s: str) -> set:
    """Significant tokens of a name: accents stripped, number+unit glued
    ('3 kg' → '3kg'), filler + label words dropped. What's left is brand +
    variant + size, which is what actually identifies a SKU."""
    t = norm(s)
    t = re.sub(r"(\d)\s+(kg|kgs|g|gr|grs|ml|l)\b", r"\1\2", t)
    return {w for w in t.split() if w not in _MATCH_FILLER and w not in _LABEL_WORDS}


def assign_slide_roles(pics, sw: float, sh: float, is_promo: bool) -> dict:
    """Map a slide's pictures to product roles from their geometry.

    `pics` is a list of ``(shape, rect)`` where rect is ``(left, top, w, h)``
    in inches. Returns ``{packshot, packshot_rect, logo, gratuite, extras}``
    where each value is a shape (or list of shapes), or None.

    Non-promo slide → the single largest lower-half image is the packshot;
    anything else is an extra.

    Promo slide → the app renders the bought product on the LEFT and the free
    product(s) on the RIGHT, with an arrow dead-centre. So:
      * left product  → packshot (the bought item)
      * right product(s), left-to-right → gratuite images
      * the centre arrow / '+' symbols are skipped, not saved.
    """
    cx_mid = sw / 2.0
    logo = None
    products: List = []          # (shape, rect, cx) — product-like images
    others: List = []            # non-product images (badges, etc.)
    for shp, rect in pics:
        role = _classify(rect, sw, sh)
        if role in ("background", "banner"):
            continue
        if role == "logo" and logo is None:
            logo = shp
            continue
        l, t, w, h = rect
        cx, cy, asp = l + w / 2, t + h / 2, w / max(h, 0.01)
        if cy >= sh * 0.40 and asp < 2.2:
            products.append((shp, rect, cx))
        else:
            others.append(shp)

    if not is_promo:
        products.sort(key=lambda x: x[1][2] * x[1][3], reverse=True)
        pack = products[0] if products else None
        return {
            "packshot": pack[0] if pack else None,
            "packshot_rect": pack[1] if pack else None,
            "logo": logo,
            "gratuite": [],
            "extras": [x[0] for x in products[1:]] + others,
        }

    # Promo: split by horizontal position, dropping the centre band (arrow/+).
    band = 1.2
    left = [x for x in products if x[2] < cx_mid - band]
    right = [x for x in products if x[2] > cx_mid + band]
    left.sort(key=lambda x: x[1][2] * x[1][3], reverse=True)   # biggest bought
    right.sort(key=lambda x: x[2])                             # left-to-right
    pack = left[0] if left else (
        max(products, key=lambda x: x[1][2] * x[1][3]) if products else None)
    # extras: any leftover left products beyond the first; centre band is skipped
    extras = [x[0] for x in left[1:]]
    return {
        "packshot": pack[0] if pack else None,
        "packshot_rect": pack[1] if pack else None,
        "logo": logo,
        "gratuite": [x[0] for x in right],
        "extras": extras,
    }


def match_title(title: str, product_names: List[str]) -> Optional[int]:
    """Index of the product whose name best matches `title`, or None.

    Compares significant-token sets (Jaccard). An exact token-set match wins
    immediately; otherwise the single best overlap ≥ 0.5 wins. Ties or weak
    overlap → None, so a slide is left UNMATCHED rather than mis-assigned
    (its packshot is still saved to the library and reported)."""
    tt = _match_tokens(title)
    if not tt:
        return None
    best_i, best_j, ties = None, 0.0, 0
    for i, name in enumerate(product_names):
        nt = _match_tokens(name)
        if not nt:
            continue
        if nt == tt:
            return i
        inter, union = len(tt & nt), len(tt | nt)
        j = inter / union if union else 0.0
        if j > best_j:
            best_i, best_j, ties = i, j, 1
        elif j == best_j:
            ties += 1
    return best_i if (best_i is not None and best_j >= 0.5 and ties == 1) else None
