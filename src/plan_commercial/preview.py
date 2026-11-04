"""Pure-Python slide preview renderer (PIL-based).

Produces a PNG preview using the same positions as the generator,
so the user can see changes live without running PowerPoint.

Renders default to 100 DPI for fast in-browser previews. The PDF export
bumps to 140 DPI so the bundled-PNG PDF is sharper than the preview but
still renders in reasonable time. DPI is per-thread (stored in a
`threading.local`) so the parallel PDF render in `export_pdf` and any
concurrent preview request can each use their own DPI without trampling
the other.
"""
from __future__ import annotations

import os
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from . import generator as G
from .model import Deck, Group, Product

# Default ("preview") DPI used when nothing else has been set on the thread.
DEFAULT_DPI = 100

# Per-thread DPI. We can't use a module global because export_pdf renders
# its slides in parallel via ThreadPoolExecutor — globals would race.
_state = threading.local()


def _current_dpi() -> int:
    return getattr(_state, "dpi", DEFAULT_DPI)


def _current_w() -> int:
    return int(G.SLIDE_W * _current_dpi())


def _current_h() -> int:
    return int(G.SLIDE_H * _current_dpi())


@contextmanager
def _at_dpi(dpi: int):
    """Temporarily switch the current thread's render DPI. Thread-local so
    parallel slide renders inside export_pdf can each set their own DPI."""
    saved = getattr(_state, "dpi", None)
    _state.dpi = dpi
    try:
        yield
    finally:
        if saved is None:
            del _state.dpi
        else:
            _state.dpi = saved


def _scale(px: int) -> int:
    """Scale a pixel value designed for 100 DPI to the current DPI. Lets us
    keep the source code reading natural font sizes / line widths while the
    output canvas may be 2× / 3× bigger."""
    return max(1, int(px * _current_dpi() / DEFAULT_DPI))


def _pt_to_px(pt: float) -> int:
    """Convert a point size (1pt = 1/72 inch — the unit PowerPoint uses) to
    pixels at the current rendering DPI. Lets the preview accept the SAME
    numbers as `python-pptx`'s `Pt(N)` calls so the two renderers agree on
    text size."""
    return max(1, int(pt * _current_dpi() / 72))


def _pos(p):
    l, t, w, h = p
    dpi = _current_dpi()
    return int(l * dpi), int(t * dpi), int(w * dpi), int(h * dpi)


def _draw_arrow(draw: ImageDraw.ImageDraw, pos, *, fill=(232, 23, 46),
                shaft_ratio: float = 0.55, head_ratio: float = 0.70) -> None:
    """Render a thick right-pointing arrow inside `pos` (inches) as filled
    polygons. We do this instead of `_text_center(draw, pos, "→", …)` because
    font arrow glyphs render as a thin vertical mark with ~80% empty padding,
    so even at size 200 the visible arrow is tiny. A polygon arrow fills its
    box at any DPI.

    `shaft_ratio` is the shaft's vertical thickness as a fraction of `pos`'s
    height. `head_ratio` is the arrowhead's height (the wide flare) as a
    fraction of `pos`'s height. The horizontal split is fixed: shaft = 60%
    of the box width, head = the remaining 40%.
    """
    x, y, w, h = _pos(pos)
    shaft_h = int(h * shaft_ratio)
    head_h  = int(h * head_ratio)
    head_w  = int(w * 0.40)
    shaft_w = w - head_w
    cy = y + h // 2
    # Shaft rectangle
    draw.rectangle(
        (x, cy - shaft_h // 2, x + shaft_w, cy + shaft_h // 2),
        fill=fill,
    )
    # Arrowhead triangle: base on the right edge of the shaft, tip past it
    draw.polygon(
        [
            (x + shaft_w, cy - head_h // 2),   # top-left of head
            (x + w,       cy),                 # tip
            (x + shaft_w, cy + head_h // 2),   # bottom-left of head
        ],
        fill=fill,
    )


# Font candidates, ordered by visual fidelity to what PowerPoint draws.
#
# python-pptx defaults each text frame to Calibri (the OOXML "Office" theme's
# minor font). To make the PIL preview look like the downloaded PPT, we try
# Calibri itself first (Windows ships it natively at C:/Windows/Fonts/), then
# Carlito — Google's metric-compatible Calibri clone, packaged on Debian as
# `fonts-crosextra-carlito`. Same character widths, same em-square sizing, so
# line lengths and wrap points match. Other fonts (DejaVu, Arial, etc.) are
# kept as last-resort fallbacks so the preview never errors out, but they
# noticeably change text proportions vs the real PPT.
#
# Each entry is (path, is_bold). Bold/regular are picked separately so we
# don't accidentally render a "Bold" request with the regular face when the
# bold face is missing on this host.
_FONT_CANDIDATES_BOLD = [
    # Windows — real Calibri Bold
    "C:/Windows/Fonts/calibrib.ttf",
    # Debian / Docker — Carlito (Calibri-compatible) Bold
    "/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf",
    # macOS — Calibri Bold (if installed via Office) then Arial Bold
    "/Library/Fonts/Microsoft/Calibri Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    # Last-resort fallbacks (different metrics, but readable)
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]
_FONT_CANDIDATES_REGULAR = [
    "C:/Windows/Fonts/calibri.ttf",
    "/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf",
    "/Library/Fonts/Microsoft/Calibri.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "C:/Windows/Fonts/arial.ttf",
]


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    # Caller passes a POINT size — same unit `python-pptx` uses (`Pt(N)`).
    # We translate to pixels at the active DPI so 1 pt of preview matches
    # 1 pt of the downloaded PPT/PDF when laid side by side.
    scaled = _pt_to_px(size)
    candidates = _FONT_CANDIDATES_BOLD if bold else _FONT_CANDIDATES_REGULAR
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, scaled)
            except OSError:
                continue
    # If the requested weight is missing, try the other weight rather than
    # falling back to PIL's bitmap default (which looks awful at large sizes).
    other = _FONT_CANDIDATES_REGULAR if bold else _FONT_CANDIDATES_BOLD
    for path in other:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, scaled)
            except OSError:
                continue
    return ImageFont.load_default()


def _paste(canvas: Image.Image, path: str, pos):
    # `path` may be None when an image reference didn't resolve on disk
    # (moved/renamed since the deck was archived). Image.open(None) raises
    # AttributeError — not OSError — so guard explicitly instead of crashing
    # the whole PDF export.
    if not path:
        return
    try:
        img = Image.open(path).convert("RGBA")
    except (OSError, FileNotFoundError):
        return
    x, y, w, h = _pos(pos)
    img = img.resize((w, h), Image.LANCZOS)
    canvas.paste(img, (x, y), img)


def _text_center(draw: ImageDraw.ImageDraw, pos, text, *, size, bold, fill):
    x, y, w, h = _pos(pos)
    font = _font(size, bold=bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x + (w - tw) // 2
    ty = y + (h - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=fill)


def _cell_rect(draw: ImageDraw.ImageDraw, rect, text, *, fill_bg, fill_text, bold, size):
    x0, y0, x1, y1 = rect
    if fill_bg is not None:
        draw.rectangle(rect, fill=fill_bg)
    draw.rectangle(rect, outline=(0, 0, 0), width=_scale(1))
    font = _font(size, bold=bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(
        (x0 + ((x1 - x0) - tw) // 2,
         y0 + ((y1 - y0) - th) // 2 - bbox[1]),
        text, font=font, fill=fill_text,
    )


def _draw_table(draw: ImageDraw.ImageDraw, pos, headers, values, *,
                head_size=14, val_size=16, col_weights=None):
    """`col_weights` lets the Colisage column be wider than the price ones —
    pass [1.6, 1.0, 1.0] to give the first column ~44% of the table width."""
    x, y, w, h = _pos(pos)
    n = len(headers)
    weights = list(col_weights) if col_weights else [1.0] * n
    total = sum(weights) or 1.0
    edges = [x]
    acc = 0.0
    for wt in weights:
        acc += wt
        edges.append(x + (w * acc / total))
    row_h = h / 2
    for i, head in enumerate(headers):
        rect = (int(edges[i]), y, int(edges[i + 1]), int(y + row_h))
        _cell_rect(draw, rect, str(head), fill_bg=(232, 23, 46),
                   fill_text=(255, 255, 255), bold=True, size=head_size)
    for i, val in enumerate(values):
        rect = (int(edges[i]), int(y + row_h), int(edges[i + 1]), y + h)
        _cell_rect(draw, rect, str(val), fill_bg=(255, 255, 255),
                   fill_text=(34, 34, 34), bold=True, size=val_size)


def render_product(deck: Deck, group: Optional[Group], product: Product,
                   dpi: int = DEFAULT_DPI) -> bytes:
    """Render a single product slide as a PNG (bytes).

    `dpi=100` (default) is what the in-browser preview uses — fast, screen-
    quality. Bump to 200 or 300 for print-quality output (used by the PDF
    export). Output canvas + fonts + line widths scale together.
    """
    with _at_dpi(dpi):
        return _render_product_inner(deck, group, product)


def _render_product_inner(deck: Deck, group: Optional[Group], product: Product,
                          subgroup=None) -> bytes:
    canvas = Image.new("RGB", (_current_w(), _current_h()), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Background (wood)
    _paste(canvas, deck.background_path or G._asset("wood_background.png"), G.WOOD_POS)
    # Banner top-left — always the channel ribbon (Gros / Détail)
    _paste(canvas, G._default_banner(deck.canal), G.BANNER_POS)
    # Brand logo top-right. SubGroup wins, then Group — same precedence as
    # generator._add_logo. Without the subgroup the PDF path could only ever
    # show the GROUP logo, i.e. whatever the deck's first product carried, so
    # every brand in a mixed catalogue inherited it.
    logo = (
        (subgroup.logo_path if subgroup and subgroup.logo_path else None)
        or (group.logo_path if group and group.logo_path else None)
        or G._asset("mio_logo.png")
    )
    _paste(canvas, logo, G.LOGO_POS)
    # "Nouveau lancement" ribbon top-centre (mirrors generator._add_product_slide)
    if deck.nouveau_lancement or getattr(product, "nouveau", False):
        _paste(canvas, G._asset("banner_nouveau.png"), G.NOUVEAU_POS)

    # Product name
    if product.nom_image_path:
        _paste(canvas, product.nom_image_path, G.NAME_POS)
    elif product.nom:
        # Pt(32) — matches generator's _add_text(NAME_POS, ..., size=32)
        _text_center(draw, G.NAME_POS, product.nom,
                     size=32, bold=True, fill=(232, 23, 46))

    # Prix labels
    _paste(canvas, G._asset("label_prix_unite.png"), G.LABEL_U_POS)
    _paste(canvas, G._asset("label_prix_caisse.png"), G.LABEL_C_POS)

    # Channel — drives table headers + value-field choice + promo wording.
    # The preview must match what the generator emits, otherwise users see
    # one thing in the in-app preview and another in the downloaded PPT.
    is_detail = G._is_detail(deck.canal)
    h1, h2 = G._price_labels(is_detail)
    brut, net = G._price_pair(product, is_detail)

    # Tables
    _draw_table(
        draw, G.TABLE_U_POS,
        headers=[h1, h2],
        values=[G._fmt(brut), G._fmt(net)],
    )
    _draw_table(
        draw, G.TABLE_C_POS,
        headers=["Colisage", h1, h2],
        values=[product.colisage or "",
                G._fmt(product.colisage_prix_gros),
                G._fmt(product.colisage_prix_gros_net)],
        col_weights=[1.6, 1.0, 1.0],
    )

    # Packshot(s): single centered, dual overlapping (two scents), a hero +
    # smaller row (3-6 scents), or promo
    scents = G._scent_paths(product)
    if product.is_promo:
        _render_promo(canvas, draw, product, is_detail)
    elif len(scents) >= 3:
        for path, cell in zip(scents, G._scent_boxes(len(scents), G.PACKSHOT_POS)):
            _paste_scaled(canvas, path, cell, anchor="bottom", trim=True)
    elif product.packshot2_path and product.packshot_path:
        back, front = G._dual_boxes(G.PACKSHOT_POS)
        _paste_scaled(canvas, product.packshot_path, back, anchor="bottom", trim=True)
        _paste_scaled(canvas, product.packshot2_path, front, anchor="bottom", trim=True)
    elif product.packshot_path:
        try:
            img = Image.open(product.packshot_path).convert("RGBA")
            # Trim the transparent margin so every packshot fills its box
            # consistently — mirrors generator._add_pic_fit(trim=True).
            img = G._trim_transparent(img)
            # Position/size overrides when sane, else the default — shared
            # with the generator so preview and PPT agree (and so a bad
            # imported box can't paint over the price tables).
            left, top, w_in, h_in = G._packshot_box(product)
            bx, by, bw, bh = _pos((left, top, w_in, h_in))
            ratio = min(bw / img.width, bh / img.height)
            nw, nh = int(img.width * ratio), int(img.height * ratio)
            img = img.resize((nw, nh), Image.LANCZOS)
            canvas.paste(img, (bx + (bw - nw) // 2, by + (bh - nh) // 2), img)
        except (OSError, FileNotFoundError):
            pass

    buf = BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ---- Promo layout ---------------------------------------------------------
# Zones (rule 6 — never collide):
#   y=0.00–1.66: banner + MIO logo
#   y=1.50–2.05: title (NAME_POS — moved up, rule 1)
#   y=2.60–2.80: price labels
#   y=2.90–3.70: price tables
#   y=3.70–4.10: PROMO TEXT band (rule 2 — captions ABOVE the bags)
#   y=4.10–7.50: BAGS / cartons / arrow / ribbons
#
# Two-bag layout (gratuite / remise+gratuite) — rule 3: bags closer to center
# Carton (box) is now wider than the bag itself so the box visibly frames the
# bag. Carton + bag share the same x range as the bag-only box for non-carton
# slides — when carton is on, the bag shrinks slightly and shifts up so it
# peeks above the carton's open flaps.
PROMO_LEFT_CARTON   = (2.00, 4.10, 3.20, 3.30)
PROMO_RIGHT_CARTON  = (8.20, 4.10, 3.20, 3.30)
PROMO_LEFT_PACK     = (2.40, 4.10, 2.80, 3.30)
PROMO_RIGHT_PACK    = (8.10, 4.10, 2.80, 3.30)
PROMO_LEFT_PACK_INBOX  = (2.35, 4.05, 2.50, 3.30)
PROMO_RIGHT_PACK_INBOX = (8.55, 4.05, 2.50, 3.30)
# Rule 2: captions in the strip ABOVE the bags, aligned to the price tables
# above them (same x + same width) so the columns line up vertically.
PROMO_LEFT_TEXT   = (2.70, 3.55, 2.70, 0.50)
PROMO_RIGHT_TEXT  = (7.30, 3.55, 4.30, 0.50)
# Rule 4: bigger arrow, centered between the two bags
PROMO_ARROW       = (5.20, 4.80, 3.00, 1.60)
PROMO_BADGE       = (7.60, 0.20, 1.80, 1.30)  # OFFRE BOMBE (slightly shorter)
PROMO_LEFT_RIBBON  = (3.80, 4.10, 1.60, 1.40)
PROMO_RIGHT_RIBBON = (9.80, 4.10, 1.60, 1.40)

# Single-bag layout (remise) — rule 5: "Pour.." snug to the centered product
PROMO_REMISE_PACK       = (5.30, 4.10, 2.80, 3.30)
PROMO_REMISE_BADGE      = (7.10, 3.85, 1.90, 1.90)
PROMO_REMISE_LEFT_TEXT  = (3.40, 5.20, 1.80, 0.50)
PROMO_REMISE_RIGHT_TEXT = (8.20, 5.20, 1.80, 0.50)
# Two-scent remise: wider bottle pair → captions pushed out to the free zones.
PROMO_REMISE_DUAL_LEFT_TEXT  = (2.35, 5.20, 2.15, 0.50)
PROMO_REMISE_DUAL_RIGHT_TEXT = (8.85, 5.20, 2.15, 0.50)

# Triple-product layout — used only when type is "remise+gratuite" AND the
# user has set BOTH `promo_remise_image` and `promo_gratuite_image` to two
# different files. Right column splits in half: remise product on the left,
# gratuite product on the right. Each gets a small role label above and an
# auto-applied marker (badge for remise, ribbon for gratuite).
# Packs are slightly narrower than before (1.75" each instead of 1.90") to
# carve out a 0.80" gap between them where a big red "+" symbol sits — the
# visual cue that you're buying the discounted product AND getting the
# gratuite one. Total right-column footprint is unchanged (~4.30").
PROMO_RG_REMISE_PACK    = (7.95, 4.10, 1.75, 3.30)
PROMO_RG_PLUS           = (9.75, 5.20, 0.70, 1.10)   # big "+" between the two
PROMO_RG_GRATUITE_PACK  = (10.50, 4.10, 1.75, 3.30)
PROMO_RG_REMISE_LABEL   = (7.95, 3.55, 1.75, 0.50)   # "REMISE -X%"
PROMO_RG_GRATUITE_LABEL = (10.50, 3.55, 1.75, 0.50)  # "X GRATUITE"
PROMO_RG_REMISE_BADGE   = (8.27, 4.00, 1.10, 1.10)   # remise sticker on remise bag
PROMO_RG_GRATUITE_BOW   = (10.82, 4.00, 1.10, 1.10)  # bow on gratuite bag


def _paste_scaled(canvas, path, pos, *, anchor: str = "center", trim: bool = False):
    """Paste preserving aspect ratio, anchored within the box.

    `anchor` controls vertical placement when the scaled image is shorter
    than the box (i.e. the scaled width fills the box, leaving vertical
    slack):
      * ``"center"`` (default) — image is centered vertically. Original
        behaviour, used for decorations (bow, carton, badge, banner) that
        should sit at a known fixed point.
      * ``"bottom"`` — image's bottom edge aligns with the box bottom.
        Used for product packshots so two products in adjacent boxes
        "stand on the same floor" regardless of their individual heights.
        Without this, a tall thin bottle (BANO 5L) fills its box while a
        squatter bottle (MIO 1L) floats in the middle of its box — visibly
        jittery, even though both fit correctly.

    Horizontal placement is always centered — no left/right anchor needed
    so far.

    `trim=True` — crop the packshot's transparent margin before scaling so it
    fills the box consistently, mirroring generator._add_pic_fit(trim=True)
    so the preview matches the downloaded PPTX. Product images only, never
    decorations (carton / ribbon / badge / bow).
    """
    # Same None-guard as _paste: the promo layouts pass e.g.
    # `product.promo_remise_image or product.packshot_path`, and BOTH can be
    # None when the file no longer resolves. Image.open(None) raises
    # AttributeError which the except below doesn't catch — that single
    # unguarded call used to kill the entire export_pdf() run (HTTP 500 on
    # /download.pdf).
    if not path:
        return
    try:
        img = Image.open(path).convert("RGBA")
    except (OSError, FileNotFoundError):
        return
    if trim:
        img = G._trim_transparent(img)
    bx, by, bw, bh = _pos(pos)
    ratio = min(bw / img.width, bh / img.height)
    nw, nh = max(1, int(img.width * ratio)), max(1, int(img.height * ratio))
    img = img.resize((nw, nh), Image.LANCZOS)
    if anchor == "bottom":
        py = by + (bh - nh)
    else:
        py = by + (bh - nh) // 2
    canvas.paste(img, (bx + (bw - nw) // 2, py), img)


def _promo_texts(product, is_detail: bool = False):
    """Return (left_text, right_text) strings for the selected promo type.
    Mirrors `generator._promo_texts` exactly so the in-app preview matches
    the downloaded PPT. Container word priority:
      1. product.promo_unit override (sac/carton/caisse/unité)
      2. Channel default — Gros → caisse, Détail → unité
    """
    # Single source of truth — the generator builds the exact same pair for
    # the PPT, so delegating guarantees preview == download.
    return G._promo_texts(product, is_detail)


def _pct_fmt(v):
    if v is None:
        return "0"
    if float(v) == int(v):
        return str(int(v))
    return f"{float(v):.1f}".replace(".", ",")


def _draw_dual_color_text(draw, pos, text, *, accent_word_idx=1,
                          base_fill=(30, 30, 80), accent_fill=(232, 23, 46),
                          size=36, bold=True, align="center"):
    """Draw text where one 'word' is in accent color (e.g. the number).

    `align` is "center" (default) or "left" — the latter pins the text to
    the left edge of the bounding box, which we use for the promo captions
    that sit above each bag.
    """
    if not text:
        return
    x, y, w, h = _pos(pos)
    font = _font(size, bold=bold)
    words = text.split()
    sep = font.getlength(" ") if hasattr(font, "getlength") else 6
    widths = [font.getlength(w2) if hasattr(font, "getlength")
              else draw.textlength(w2, font=font) for w2 in words]
    total = sum(widths) + sep * max(0, len(words) - 1)
    bbox = draw.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    if align == "left":
        cursor_x = x
    else:
        cursor_x = x + (w - total) / 2
    ty = y + (h - th) / 2 - bbox[1]
    for i, w2 in enumerate(words):
        fill = accent_fill if i == accent_word_idx else base_fill
        draw.text((cursor_x, ty), w2, font=font, fill=fill)
        cursor_x += widths[i] + sep


def _render_promo(canvas, draw, product, is_detail: bool = False):
    """Branch on `type_promo` and the per-role product images:
      - "remise"             → single-bag layout with a "REMISE" badge
      - "remise+gratuite"    → triple-product layout when BOTH remise and
                                gratuite images are set to distinct files;
                                otherwise standard two-bag layout
      - "gratuite" / other   → two-bag layout
    """
    t = (product.type_promo or "").strip().lower()
    if t == "remise":
        _render_promo_remise(canvas, draw, product, is_detail)
    elif _has_two_right_products(product):
        _render_promo_triple(canvas, draw, product, is_detail)
    else:
        _render_promo_two_bags(canvas, draw, product, is_detail)


def _has_two_right_products(product) -> bool:
    """True iff the slide should use the 2-products-on-right layout.

    Triggered purely by `type_promo == "remise+gratuite"` (or the reversed
    spelling). The image overrides are NOT required — when the user hasn't
    set them, we fall back to the packshot for both sides in the triple
    renderer. Earlier this required BOTH overrides AND they had to be
    distinct, which silently downgraded the layout to the two-bag form
    when the user only filled one tile — confusing because the dropdown
    still said "remise+gratuite".
    """
    t = (product.type_promo or "").strip().lower()
    return t in ("remise+gratuite", "gratuite+remise")


def _resolve_right_image(product):
    """Pick the right-side image for the standard two-bag layout. If the
    user set the role-specific override that matches the type, use it;
    else fall back to the packshot.

    Note: `product.promo_gratuite_image` / `promo_remise_image` get
    populated by `resolve_image()` in `api/deps.py`. If the user set a
    filename in the session row but the file is missing on disk,
    `resolve_image()` returns None (and now logs a WARNING — visible via
    `docker compose logs app`) and we fall through to the packshot. So
    "right side shows packshot" can mean either:
      (a) user never set a gratuite/remise image — expected,
      (b) user set one but the file moved/got deleted — check logs.
    """
    t = (product.type_promo or "").strip().lower()
    if "gratuite" in t and product.promo_gratuite_image:
        return product.promo_gratuite_image
    if "remise" in t and product.promo_remise_image:
        return product.promo_remise_image
    return product.packshot_path


def _render_promo_remise(canvas, draw, product, is_detail: bool = False):
    """Single-image layout for pure "remise" promos: one centered bag, the
    remise sticker on top-right of the bag, and two captions to either
    side ("Pour N caisses" / "-X% de remise"). No arrow."""
    from pathlib import Path as _P

    # The discounted product: per-role override OR packshot
    bag = product.promo_remise_image or product.packshot_path
    if product.packshot2_path and bag:
        back, front = G._dual_boxes(PROMO_REMISE_PACK)
        _paste_scaled(canvas, bag, back, anchor="bottom", trim=True)
        _paste_scaled(canvas, product.packshot2_path, front, anchor="bottom", trim=True)
    elif bag:
        _paste_scaled(canvas, bag, PROMO_REMISE_PACK, anchor="bottom", trim=True)

    # Remise badge — user override OR built-in default_remise.png
    badge = product.promo_ribbon_image
    if not badge:
        default_remise = _P(G._asset("default_remise.png"))
        if default_remise.exists():
            badge = str(default_remise)
    if badge:
        _paste_scaled(canvas, badge, PROMO_REMISE_BADGE)


    # Captions on either side of the bag — Pt(24) matches generator.
    # Two-scent: push captions out so they don't collide with the wider pair.
    dual = bool(product.packshot2_path)
    left_pos = PROMO_REMISE_DUAL_LEFT_TEXT if dual else PROMO_REMISE_LEFT_TEXT
    right_pos = PROMO_REMISE_DUAL_RIGHT_TEXT if dual else PROMO_REMISE_RIGHT_TEXT
    left_txt, right_txt = _promo_texts(product, is_detail)
    _draw_dual_color_text(draw, left_pos, left_txt,
                          accent_word_idx=1,
                          size=G._promo_text_size(left_txt), align="left")
    _draw_dual_color_text(draw, right_pos, right_txt,
                          accent_word_idx=0,
                          size=G._promo_text_size(right_txt), align="left")


def _render_promo_triple(canvas, draw, product, is_detail: bool = False):
    """Triple-product layout — left = bought product, right column splits
    into two smaller products (remise + gratuite) with a big red "+" in
    the gap.

    Decorations (REMISE badge on the remise pack, bow on the gratuite pack)
    are opt-in via the existing `promo_ribbon_left` / `promo_ribbon_right`
    flags — same pattern as the two-bag layout. Previously they auto-drew
    on every triple slide, which surprised users who explicitly didn't
    want the bow.
    """
    from pathlib import Path as _P

    # Left side: same as the standard two-bag layout — bought product
    if product.packshot_path:
        _paste_scaled(canvas, product.packshot_path, PROMO_LEFT_PACK,
                      anchor="bottom", trim=True)

    # Right column: two smaller products side by side. Each side falls back
    # to the packshot when the user hasn't set a role-specific image — so
    # picking "remise+gratuite" from the dropdown always produces the
    # triple layout (with the same product shown twice if you don't pick
    # overrides), instead of silently downgrading to the two-bag form.
    # All three products bottom-anchored so they share a baseline regardless
    # of individual aspect ratios — see _paste_scaled's `anchor` docstring.
    remise_img   = product.promo_remise_image   or product.packshot_path
    gratuite_img = product.promo_gratuite_image or product.packshot_path
    _paste_scaled(canvas, remise_img,   PROMO_RG_REMISE_PACK,   anchor="bottom", trim=True)
    _paste_scaled(canvas, gratuite_img, PROMO_RG_GRATUITE_PACK, anchor="bottom", trim=True)

    # Optional decorations — opt-in via the same flags the two-bag layout
    # already uses, so the SlideEditor toggle the user already sees works
    # identically here. `promo_ribbon_image` overrides the default bow.
    if product.promo_ribbon_left:
        remise_badge = _P(G._asset("default_remise.png"))
        if remise_badge.exists():
            _paste_scaled(canvas, str(remise_badge), PROMO_RG_REMISE_BADGE)
    if product.promo_ribbon_right:
        bow_path = product.promo_ribbon_image
        if not bow_path:
            default_ribbon = _P(G._asset("default_ribbon.png"))
            if default_ribbon.exists():
                bow_path = str(default_ribbon)
        if bow_path:
            _paste_scaled(canvas, bow_path, PROMO_RG_GRATUITE_BOW)

    # Big red arrow between left bag and right column
    _draw_arrow(draw, PROMO_ARROW)

    # Big red "+" between the remise pack and the gratuite pack — visual cue
    # that the buyer GETS the gratuite product in addition to the discounted
    # one (rather than choosing between them).
    _text_center(draw, PROMO_RG_PLUS, "+",
                 size=72, bold=True, fill=(232, 23, 46))

    # Captions
    pct = product.promo_remise_pct or 0
    qty = product.promo_gratuit_qte or 0
    n_achat = product.promo_achat_qte
    override = product.promo_unit or ""
    left_txt = (f"Pour {n_achat} {G._unit_word(is_detail, n_achat, override)}"
                if n_achat else "")
    remise_lbl = f"REMISE -{_pct_fmt(pct)}%"
    gratuite_lbl = f"{qty} {G._gratuite_word(is_detail, qty, override).upper()}"

    # All three captions Pt(24) to match generator's _add_promo_text
    _draw_dual_color_text(draw, PROMO_LEFT_TEXT, left_txt,
                          accent_word_idx=1, size=24, align="center")
    _draw_dual_color_text(draw, PROMO_RG_REMISE_LABEL, remise_lbl,
                          accent_word_idx=1, size=20, align="center",
                          base_fill=(232, 23, 46), accent_fill=(232, 23, 46))
    _draw_dual_color_text(draw, PROMO_RG_GRATUITE_LABEL, gratuite_lbl,
                          accent_word_idx=1, size=20, align="center",
                          base_fill=(30, 30, 80), accent_fill=(232, 23, 46))


def _render_promo_two_bags(canvas, draw, product, is_detail: bool = False):
    """Two-bag layout (gratuite / remise+gratuite).

    Default = two packshots side by side. Carton + ribbon are opt-in via
    the boolean flags on `product`. When a carton is enabled on a side, the
    carton is drawn FIRST (behind), then the bag SMALLER on top — so the
    bag visibly sits inside the open box.
    """
    from pathlib import Path as _P

    # Optional OFFRE BOMBE badge (top-right corner, kept for back-compat)
    bomb_path = _P(G._asset("offre_bombe.png"))
    if bomb_path.exists():
        _paste_scaled(canvas, str(bomb_path), PROMO_BADGE)

    # Resolve carton / ribbon images once — user override OR built-in default
    carton_img = product.promo_carton_image
    if not carton_img:
        default_carton = _P(G._asset("default_carton.png"))
        if default_carton.exists():
            carton_img = str(default_carton)

    ribbon_img = product.promo_ribbon_image
    if not ribbon_img:
        default_ribbon = _P(G._asset("default_ribbon.png"))
        if default_ribbon.exists():
            ribbon_img = str(default_ribbon)

    # ── LEFT side: optional carton, then bag, then optional ribbon ──
    if product.promo_carton_left and carton_img:
        _paste_scaled(canvas, carton_img, PROMO_LEFT_CARTON)
    if product.packshot_path:
        _paste_scaled(
            canvas, product.packshot_path,
            PROMO_LEFT_PACK_INBOX if product.promo_carton_left else PROMO_LEFT_PACK,
            anchor="bottom", trim=True,
        )
    if product.promo_ribbon_left and ribbon_img:
        _paste_scaled(canvas, ribbon_img, PROMO_LEFT_RIBBON)

    # ── RIGHT side ──
    # Mirror generator: for "gratuite" promos with 2+ free SKUs, the
    # right pack zone is subdivided into one cell per item, each
    # bottom-anchored in its own cell. 1-item promos render identically
    # to before via the legacy single-image branch.
    t = (product.type_promo or "").strip().lower()
    gratuite_imgs = G._gratuite_images(product) if "gratuite" in t else []

    base_pack = (
        PROMO_RIGHT_PACK_INBOX if product.promo_carton_right else PROMO_RIGHT_PACK
    )
    if product.promo_carton_right and carton_img:
        _paste_scaled(canvas, carton_img, PROMO_RIGHT_CARTON)

    if len(gratuite_imgs) >= 2:
        # Multi-gratuite — use the dedicated layout from the generator
        # (NOT a 50/50 subdivision of base_pack). Includes red "+" zones
        # for n=2 so the in-app PNG matches the exported PPT exactly.
        cells, plus_zones = G._gratuite_layout(len(gratuite_imgs))
        for img, cell in zip(gratuite_imgs, cells):
            _paste_scaled(canvas, img, G._lift_cell(cell, product.promo_gratuite_lift),
                          anchor="bottom", trim=True)
        for plus_pos in plus_zones:
            # Match generator's _add_text(... "+", size=72, bold=True, RED)
            _text_center(draw, plus_pos, "+",
                         size=72, bold=True, fill=(232, 23, 46))
    else:
        right_image = _resolve_right_image(product)
        if right_image:
            _paste_scaled(canvas, right_image,
                          G._lift_cell(base_pack, product.promo_gratuite_lift),
                          anchor="bottom", trim=True)

    if product.promo_ribbon_right and ribbon_img:
        _paste_scaled(canvas, ribbon_img, PROMO_RIGHT_RIBBON)

    # ── Red arrow in the middle ───────────────────────────────────────
    # Rule 4: bigger arrow (polygon-based — see _draw_arrow for why)
    _draw_arrow(draw, PROMO_ARROW)

    # ── Captions ABOVE each bag, centered above their price table column ──
    # Pt(24) — matches generator's _add_promo_text
    left_txt, right_txt = _promo_texts(product, is_detail)
    _draw_dual_color_text(draw, PROMO_LEFT_TEXT, left_txt,
                          accent_word_idx=1,
                          size=G._promo_text_size(left_txt), align="center")
    _draw_dual_color_text(draw, PROMO_RIGHT_TEXT, right_txt,
                          accent_word_idx=0,
                          size=G._promo_text_size(right_txt), align="center")


def _cover_image(deck: Deck) -> Image.Image:
    canvas = Image.new("RGB", (_current_w(), _current_h()), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    _paste(canvas, deck.background_path or G._asset("wood_background.png"), G.WOOD_POS)
    _paste(canvas, G._default_banner(deck.canal), G.BANNER_POS)
    # Cover sizes match generator._add_cover: 54 / 32 / 22 (points)
    _text_center(draw, (1.0, 2.0, 11.3, 0.9), deck.titre,
                 size=54, bold=True, fill=(34, 34, 34))
    _text_center(draw, (1.0, 2.9, 11.3, 0.6), deck.canal,
                 size=32, bold=True, fill=(232, 23, 46))
    _text_center(draw, (1.0, 3.55, 11.3, 0.5), deck.mois,
                 size=22, bold=False, fill=(34, 34, 34))
    if deck.cover_photo_path:
        _paste(canvas, deck.cover_photo_path, (3.3, 4.3, 6.7, 2.9))
    return canvas


def _product_image(deck: Deck, group, product, subgroup=None) -> Image.Image:
    """Same content as render_product but returns the raw PIL Image (assumes
    the caller has already entered the desired _at_dpi context)."""
    from io import BytesIO as _B
    png = _render_product_inner(deck, group, product, subgroup)
    return Image.open(_B(png)).convert("RGB")


# PDF defaults — picked as a compromise between quality and render time:
#   100 DPI: ~65s for 70 slides, blurry zoomed in
#   140 DPI: ~120s sequential, sharp at 100%, prints OK at A4   ← default
#   200 DPI: ~240s sequential, print-perfect even when blown up
#
# Parallelism (PDF_WORKERS) cuts the wall-clock time roughly N× on a
# multi-core machine — PIL releases the GIL during resize/encode/paste.
PDF_DPI = 140
PDF_WORKERS = min(8, max(2, (os.cpu_count() or 4)))


def _render_one_pdf_page(deck: Deck, group, product, dpi: int,
                         subgroup=None) -> Image.Image:
    """Worker for the ThreadPoolExecutor below. Re-enters _at_dpi inside the
    pool thread because thread-locals don't propagate from the submitter."""
    with _at_dpi(dpi):
        return _product_image(deck, group, product, subgroup)


def export_pdf(deck: Deck, dpi: int = PDF_DPI, workers: int = PDF_WORKERS) -> bytes:
    """Render every slide as a PNG and bundle them into a multi-page PDF.

    Default 140 DPI (≈1866×1050 px) — sharper than the preview, prints OK
    at A4, much faster than 200 DPI. The cover renders sequentially; the
    product slides render in parallel because PIL releases the GIL during
    its heavy operations.
    """
    items = [
        (g, sg, p)
        for g in deck.groupes
        for sg in g.sous_groupes
        for p in sg.produits
    ]

    # "Nouveau lancement" decks are product-slides only — no title cover.
    with _at_dpi(dpi):
        cover = None if deck.nouveau_lancement else _cover_image(deck)

    if workers > 1 and items:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            product_pages = list(ex.map(
                lambda gp: _render_one_pdf_page(deck, gp[0], gp[2], dpi, gp[1]),
                items,
            ))
    else:
        with _at_dpi(dpi):
            product_pages = [_product_image(deck, g, p, sg) for g, sg, p in items]

    pages = ([cover] if cover is not None else []) + product_pages
    buf = BytesIO()
    pages[0].save(
        buf, format="PDF",
        save_all=True,
        append_images=pages[1:],
        resolution=dpi,
        title=deck.titre or "Plan Commercial",
    )
    return buf.getvalue()


def render_cover(deck: Deck, dpi: int = DEFAULT_DPI) -> bytes:
    with _at_dpi(dpi):
        canvas = _cover_image(deck)
        buf = BytesIO()
        canvas.save(buf, format="PNG", optimize=True)
        return buf.getvalue()


