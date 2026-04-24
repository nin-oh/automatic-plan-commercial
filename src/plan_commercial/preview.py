"""Pure-Python slide preview renderer (PIL-based).

Produces a PNG preview using the same positions as the generator,
so the user can see changes live without running PowerPoint.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont

from . import generator as G
from .model import Deck, Group, Product

DPI = 100  # 13.33" x 7.5" -> 1333 x 750 px
W = int(G.SLIDE_W * DPI)
H = int(G.SLIDE_H * DPI)


def _pos(p):
    l, t, w, h = p
    return int(l * DPI), int(t * DPI), int(w * DPI), int(h * DPI)


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
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            if bold and "Bold" not in path and "bd" not in path.lower():
                continue
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    # Fallback: any TTF, then PIL default
    for path in _FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
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
    draw.rectangle(rect, outline=(0, 0, 0), width=1)
    font = _font(size, bold=bold)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text(
        (x0 + ((x1 - x0) - tw) // 2,
         y0 + ((y1 - y0) - th) // 2 - bbox[1]),
        text, font=font, fill=fill_text,
    )


def _draw_table(draw: ImageDraw.ImageDraw, pos, headers, values, *, head_size=14, val_size=18):
    x, y, w, h = _pos(pos)
    n = len(headers)
    col_w = w / n
    row_h = h / 2
    for i, head in enumerate(headers):
        rect = (int(x + i * col_w), y,
                int(x + (i + 1) * col_w), int(y + row_h))
        _cell_rect(draw, rect, str(head), fill_bg=(232, 23, 46),
                   fill_text=(255, 255, 255), bold=True, size=head_size)
    for i, val in enumerate(values):
        rect = (int(x + i * col_w), int(y + row_h),
                int(x + (i + 1) * col_w), y + h)
        _cell_rect(draw, rect, str(val), fill_bg=(255, 255, 255),
                   fill_text=(34, 34, 34), bold=True, size=val_size)


def render_product(deck: Deck, group: Optional[Group], product: Product) -> bytes:
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
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
    )

    # Packshot(s): single centered, or dual side-by-side for promo
    if product.is_promo:
        _render_promo(canvas, draw, product)
    elif product.packshot_path:
        try:
            img = Image.open(product.packshot_path).convert("RGBA")
            bx, by, bw, bh = _pos(G.PACKSHOT_POS)
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
# Left packshot / text, arrow, right packshot / text.
PROMO_LEFT_PACK   = (1.20, 3.55, 2.80, 3.90)
PROMO_RIGHT_PACK  = (8.80, 3.55, 2.80, 3.90)
PROMO_LEFT_TEXT   = (0.60, 4.70, 3.40, 0.55)
PROMO_RIGHT_TEXT  = (7.60, 4.70, 3.80, 0.55)
PROMO_ARROW       = (5.40, 4.60, 2.30, 0.70)
PROMO_BADGE       = (7.60, 0.20, 1.80, 1.70)  # "OFFRE BOMBE" if available


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
                          size=36, bold=True):
    """Draw text where one 'word' is in accent color (e.g. the number)."""
    if not text:
        return
    x, y, w, h = _pos(pos)
    font = _font(size, bold=bold)
    words = text.split()
    # Measure pieces
    sep = font.getlength(" ") if hasattr(font, "getlength") else 6
    widths = [font.getlength(w2) if hasattr(font, "getlength")
              else draw.textlength(w2, font=font) for w2 in words]
    total = sum(widths) + sep * max(0, len(words) - 1)
    # Vertically center (approximate ascent/descent via bbox)
    bbox = draw.textbbox((0, 0), text, font=font)
    th = bbox[3] - bbox[1]
    cursor_x = x + (w - total) / 2
    ty = y + (h - th) / 2 - bbox[1]
    for i, w2 in enumerate(words):
        fill = accent_fill if i == accent_word_idx else base_fill
        draw.text((cursor_x, ty), w2, font=font, fill=fill)
        cursor_x += widths[i] + sep


def _render_promo(canvas, draw, product):
    """Compose the promo packshots + arrow + texts + badge."""
    # Optional OFFRE BOMBE badge (from built-in or user-provided asset)
    from pathlib import Path as _P
    bomb_path = _P(G._asset("offre_bombe.png"))
    if bomb_path.exists():
        _paste_scaled(canvas, str(bomb_path), PROMO_BADGE)

    # Left and right packshots (same image)
    if product.packshot_path:
        _paste_scaled(canvas, product.packshot_path, PROMO_LEFT_PACK)
        _paste_scaled(canvas, product.packshot_path, PROMO_RIGHT_PACK)
        # Decorative bow for "gratuite" / "remise+gratuite"
        t = (product.type_promo or "").strip().lower()
        if "gratuite" in t:
            bow_path = _P(G._asset("bow_overlay.png"))
            if bow_path.exists():
                _paste_scaled(canvas, str(bow_path),
                              (PROMO_RIGHT_PACK[0] + 1.2,
                               PROMO_RIGHT_PACK[1] - 0.1,
                               1.4, 1.2))

    # Red arrow in the middle
    _text_center(draw, PROMO_ARROW, "→",  # →
                 size=110, bold=True, fill=(232, 23, 46))

    # Texts: "Pour N caisses"  /  "X caisse Gratuite" (or variant)
    left_txt, right_txt = _promo_texts(product)
    _draw_dual_color_text(draw, PROMO_LEFT_TEXT, left_txt,
                          accent_word_idx=1, size=34)
    _draw_dual_color_text(draw, PROMO_RIGHT_TEXT, right_txt,
                          accent_word_idx=0, size=34)


def render_cover(deck: Deck) -> bytes:
    canvas = Image.new("RGB", (W, H), (255, 255, 255))
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
    buf = BytesIO()
    canvas.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
