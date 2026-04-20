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

    # Packshot (scale preserving aspect, center in box)
    if product.packshot_path:
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
