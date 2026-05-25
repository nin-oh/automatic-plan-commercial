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


def _pos(p):
    l, t, w, h = p
    dpi = _current_dpi()
    return int(l * dpi), int(t * dpi), int(w * dpi), int(h * dpi)


_FONT_CANDIDATES = [
    # Linux
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    # Windows
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
    # macOS
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
]


def _font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    # Caller passes a size in "design pixels at 100 DPI"; scale up when the
    # active DPI is higher so text keeps the same relative visual weight.
    scaled = _scale(size)
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            if bold and "Bold" not in path and "bd" not in path.lower():
                continue
            try:
                return ImageFont.truetype(path, scaled)
            except OSError:
                continue
    # Fallback: any TTF, then PIL default
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, scaled)
            except OSError:
                continue
    return ImageFont.load_default()


def _paste(canvas: Image.Image, path: str, pos):
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
                head_size=14, val_size=18, col_weights=None):
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


def _render_product_inner(deck: Deck, group: Optional[Group], product: Product) -> bytes:
    canvas = Image.new("RGB", (_current_w(), _current_h()), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)

    # Background (wood)
    _paste(canvas, deck.background_path or G._asset("wood_background.png"), G.WOOD_POS)
    # Banner top-left
    _paste(canvas, deck.banner_path or G._asset("banner_canal_gros.png"), G.BANNER_POS)
    # Brand logo top-right
    logo = (group.logo_path if group and group.logo_path else G._asset("mio_logo.png"))
    _paste(canvas, logo, G.LOGO_POS)

    # Product name
    if product.nom_image_path:
        _paste(canvas, product.nom_image_path, G.NAME_POS)
    elif product.nom:
        _text_center(draw, G.NAME_POS, product.nom,
                     size=28, bold=True, fill=(232, 23, 46))

    # Prix labels
    _paste(canvas, G._asset("label_prix_unite.png"), G.LABEL_U_POS)
    _paste(canvas, G._asset("label_prix_caisse.png"), G.LABEL_C_POS)

    # Tables
    _draw_table(
        draw, G.TABLE_U_POS,
        headers=["Prix Gros", "Prix Gros Net"],
        values=[G._fmt(product.prix_gros), G._fmt(product.prix_gros_net)],
    )
    _draw_table(
        draw, G.TABLE_C_POS,
        headers=["Colisage", "Prix Gros", "Prix Gros Net"],
        values=[product.colisage or "",
                G._fmt(product.colisage_prix_gros),
                G._fmt(product.colisage_prix_gros_net)],
        col_weights=[1.6, 1.0, 1.0],
    )

    # Packshot(s): single centered, or dual side-by-side for promo
    if product.is_promo:
        _render_promo(canvas, draw, product)
    elif product.packshot_path:
        try:
            img = Image.open(product.packshot_path).convert("RGBA")
            # Use position/size overrides when set, else the default.
            dl, dt, dw, dh = G.PACKSHOT_POS
            left = product.packshot_left if product.packshot_left > 0 else dl
            top = product.packshot_top if product.packshot_top > 0 else dt
            w_in = product.packshot_width if product.packshot_width > 0 else dw
            h_in = product.packshot_height if product.packshot_height > 0 else dh
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

# Triple-product layout — used only when type is "remise+gratuite" AND the
# user has set BOTH `promo_remise_image` and `promo_gratuite_image` to two
# different files. Right column splits in half: remise product on the left,
# gratuite product on the right. Each gets a small role label above and an
# auto-applied marker (badge for remise, ribbon for gratuite).
PROMO_RG_REMISE_PACK    = (8.20, 4.10, 1.90, 3.30)
PROMO_RG_GRATUITE_PACK  = (10.30, 4.10, 1.90, 3.30)
PROMO_RG_REMISE_LABEL   = (8.20, 3.55, 1.90, 0.50)   # "REMISE -X%"
PROMO_RG_GRATUITE_LABEL = (10.30, 3.55, 1.90, 0.50)  # "X GRATUITE"
PROMO_RG_REMISE_BADGE   = (9.10, 4.00, 1.10, 1.10)   # remise sticker on remise bag
PROMO_RG_GRATUITE_BOW   = (11.20, 4.00, 1.10, 1.10)  # bow on gratuite bag


def _paste_scaled(canvas, path, pos):
    """Paste preserving aspect ratio, centered within the box."""
    try:
        img = Image.open(path).convert("RGBA")
    except (OSError, FileNotFoundError):
        return
    bx, by, bw, bh = _pos(pos)
    ratio = min(bw / img.width, bh / img.height)
    nw, nh = max(1, int(img.width * ratio)), max(1, int(img.height * ratio))
    img = img.resize((nw, nh), Image.LANCZOS)
    canvas.paste(img, (bx + (bw - nw) // 2, by + (bh - nh) // 2), img)


def _promo_texts(product):
    """Return (left_text, right_text) strings for the selected promo type."""
    if product.promo_texte:
        # User override: display the free text on the right as-is
        return (f"Pour {product.promo_achat_qte} caisses"
                if product.promo_achat_qte else "",
                product.promo_texte)
    n = product.promo_achat_qte or 0
    x = product.promo_gratuit_qte or 0
    pct = product.promo_remise_pct or 0
    left = f"Pour {n} caisses" if n else ""
    t = (product.type_promo or "").strip().lower()
    if t == "gratuite":
        right = f"{x} caisse{'s' if x > 1 else ''} Gratuite{'s' if x > 1 else ''}"
    elif t == "remise":
        right = f"-{_pct_fmt(pct)}% de remise"
    elif t in {"remise+gratuite", "gratuite+remise"}:
        right = (f"{x} caisse{'s' if x > 1 else ''} Gratuite{'s' if x > 1 else ''}"
                 f" + -{_pct_fmt(pct)}%")
    else:
        right = ""
    return left, right


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


def _render_promo(canvas, draw, product):
    """Branch on `type_promo` and the per-role product images:
      - "remise"             → single-bag layout with a "REMISE" badge
      - "remise+gratuite"    → triple-product layout when BOTH remise and
                                gratuite images are set to distinct files;
                                otherwise standard two-bag layout
      - "gratuite" / other   → two-bag layout
    """
    t = (product.type_promo or "").strip().lower()
    if t == "remise":
        _render_promo_remise(canvas, draw, product)
    elif _has_two_right_products(product):
        _render_promo_triple(canvas, draw, product)
    else:
        _render_promo_two_bags(canvas, draw, product)


def _has_two_right_products(product) -> bool:
    """True iff the slide should use the 2-products-on-right layout.
    Requires remise+gratuite type AND two distinct image overrides."""
    t = (product.type_promo or "").strip().lower()
    if t not in ("remise+gratuite", "gratuite+remise"):
        return False
    rem = (product.promo_remise_image or "").strip()
    grt = (product.promo_gratuite_image or "").strip()
    return bool(rem) and bool(grt) and rem != grt


def _resolve_right_image(product):
    """Pick the right-side image for the standard two-bag layout. If the
    user set the role-specific override that matches the type, use it;
    else fall back to the packshot."""
    t = (product.type_promo or "").strip().lower()
    if "gratuite" in t and product.promo_gratuite_image:
        return product.promo_gratuite_image
    if "remise" in t and product.promo_remise_image:
        return product.promo_remise_image
    return product.packshot_path


def _render_promo_remise(canvas, draw, product):
    """Single-image layout for pure "remise" promos: one centered bag, the
    remise sticker on top-right of the bag, and two captions to either
    side ("Pour N caisses" / "-X% de remise"). No arrow."""
    from pathlib import Path as _P

    # The discounted product: per-role override OR packshot
    bag = product.promo_remise_image or product.packshot_path
    if bag:
        _paste_scaled(canvas, bag, PROMO_REMISE_PACK)

    # Remise badge — user override OR built-in default_remise.png
    badge = product.promo_ribbon_image
    if not badge:
        default_remise = _P(G._asset("default_remise.png"))
        if default_remise.exists():
            badge = str(default_remise)
    if badge:
        _paste_scaled(canvas, badge, PROMO_REMISE_BADGE)


    # Captions on either side of the bag
    left_txt, right_txt = _promo_texts(product)
    _draw_dual_color_text(draw, PROMO_REMISE_LEFT_TEXT, left_txt,
                          accent_word_idx=1, size=28, align="left")
    _draw_dual_color_text(draw, PROMO_REMISE_RIGHT_TEXT, right_txt,
                          accent_word_idx=0, size=32, align="left")


def _render_promo_triple(canvas, draw, product):
    """Triple-product layout — left = bought product, right column splits
    into two smaller products (remise + gratuite). Each right product is
    auto-marked: remise gets the yellow REMISE badge, gratuite gets the bow.
    Captions are role-specific so the viewer knows which is which.
    """
    from pathlib import Path as _P

    # Left side: same as the standard two-bag layout — bought product
    if product.packshot_path:
        _paste_scaled(canvas, product.packshot_path, PROMO_LEFT_PACK)

    # Right column: two smaller products side by side
    _paste_scaled(canvas, product.promo_remise_image,   PROMO_RG_REMISE_PACK)
    _paste_scaled(canvas, product.promo_gratuite_image, PROMO_RG_GRATUITE_PACK)

    # Auto-applied role markers — visual cue for which is which
    remise_badge = _P(G._asset("default_remise.png"))
    if remise_badge.exists():
        _paste_scaled(canvas, str(remise_badge), PROMO_RG_REMISE_BADGE)
    bow = _P(G._asset("default_ribbon.png"))
    if bow.exists():
        _paste_scaled(canvas, str(bow), PROMO_RG_GRATUITE_BOW)

    # Big red arrow between left bag and right column
    _text_center(draw, PROMO_ARROW, "→",
                 size=200, bold=True, fill=(232, 23, 46))

    # Captions
    pct = product.promo_remise_pct or 0
    qty = product.promo_gratuit_qte or 0
    left_txt = (f"Pour {product.promo_achat_qte} caisses"
                if product.promo_achat_qte else "")
    remise_lbl = f"REMISE -{_pct_fmt(pct)}%"
    gratuite_lbl = f"{qty} GRATUITE{'S' if qty > 1 else ''}"

    _draw_dual_color_text(draw, PROMO_LEFT_TEXT, left_txt,
                          accent_word_idx=1, size=28, align="center")
    _draw_dual_color_text(draw, PROMO_RG_REMISE_LABEL, remise_lbl,
                          accent_word_idx=1, size=18, align="center",
                          base_fill=(232, 23, 46), accent_fill=(232, 23, 46))
    _draw_dual_color_text(draw, PROMO_RG_GRATUITE_LABEL, gratuite_lbl,
                          accent_word_idx=1, size=18, align="center",
                          base_fill=(30, 30, 80), accent_fill=(232, 23, 46))


def _render_promo_two_bags(canvas, draw, product):
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
        )
    if product.promo_ribbon_left and ribbon_img:
        _paste_scaled(canvas, ribbon_img, PROMO_LEFT_RIBBON)

    # ── RIGHT side: pattern is identical, but the IMAGE is the resolved
    #    right-side override (a different SKU than the bought one when
    #    `promo_gratuite_image` / `promo_remise_image` is set).
    right_image = _resolve_right_image(product)
    if product.promo_carton_right and carton_img:
        _paste_scaled(canvas, carton_img, PROMO_RIGHT_CARTON)
    if right_image:
        _paste_scaled(
            canvas, right_image,
            PROMO_RIGHT_PACK_INBOX if product.promo_carton_right else PROMO_RIGHT_PACK,
        )
    if product.promo_ribbon_right and ribbon_img:
        _paste_scaled(canvas, ribbon_img, PROMO_RIGHT_RIBBON)

    # ── Red arrow in the middle ───────────────────────────────────────
    # Rule 4: bigger arrow
    _text_center(draw, PROMO_ARROW, "→",
                 size=200, bold=True, fill=(232, 23, 46))

    # ── Captions ABOVE each bag, centered above their price table column ──
    left_txt, right_txt = _promo_texts(product)
    _draw_dual_color_text(draw, PROMO_LEFT_TEXT, left_txt,
                          accent_word_idx=1, size=28, align="center")
    _draw_dual_color_text(draw, PROMO_RIGHT_TEXT, right_txt,
                          accent_word_idx=0, size=28, align="center")


def _cover_image(deck: Deck) -> Image.Image:
    canvas = Image.new("RGB", (_current_w(), _current_h()), (255, 255, 255))
    draw = ImageDraw.Draw(canvas)
    _paste(canvas, deck.background_path or G._asset("wood_background.png"), G.WOOD_POS)
    _paste(canvas, deck.banner_path or G._asset("banner_canal_gros.png"), G.BANNER_POS)
    _text_center(draw, (1.0, 2.0, 11.3, 0.9), deck.titre,
                 size=48, bold=True, fill=(34, 34, 34))
    _text_center(draw, (1.0, 2.9, 11.3, 0.6), deck.canal,
                 size=30, bold=True, fill=(232, 23, 46))
    _text_center(draw, (1.0, 3.55, 11.3, 0.5), deck.mois,
                 size=20, bold=False, fill=(34, 34, 34))
    if deck.cover_photo_path:
        _paste(canvas, deck.cover_photo_path, (3.3, 4.3, 6.7, 2.9))
    return canvas


def _product_image(deck: Deck, group, product) -> Image.Image:
    """Same content as render_product but returns the raw PIL Image (assumes
    the caller has already entered the desired _at_dpi context)."""
    from io import BytesIO as _B
    png = _render_product_inner(deck, group, product)
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


def _render_one_pdf_page(deck: Deck, group, product, dpi: int) -> Image.Image:
    """Worker for the ThreadPoolExecutor below. Re-enters _at_dpi inside the
    pool thread because thread-locals don't propagate from the submitter."""
    with _at_dpi(dpi):
        return _product_image(deck, group, product)


def export_pdf(deck: Deck, dpi: int = PDF_DPI, workers: int = PDF_WORKERS) -> bytes:
    """Render every slide as a PNG and bundle them into a multi-page PDF.

    Default 140 DPI (≈1866×1050 px) — sharper than the preview, prints OK
    at A4, much faster than 200 DPI. The cover renders sequentially; the
    product slides render in parallel because PIL releases the GIL during
    its heavy operations.
    """
    items = [
        (g, p)
        for g in deck.groupes
        for sg in g.sous_groupes
        for p in sg.produits
    ]

    with _at_dpi(dpi):
        cover = _cover_image(deck)

    if workers > 1 and items:
        with ThreadPoolExecutor(max_workers=workers) as ex:
            product_pages = list(ex.map(
                lambda gp: _render_one_pdf_page(deck, gp[0], gp[1], dpi),
                items,
            ))
    else:
        with _at_dpi(dpi):
            product_pages = [_product_image(deck, g, p) for g, p in items]

    pages = [cover] + product_pages
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


