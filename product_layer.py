"""Per-SKU unique content: title, price tables, packshot."""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from PIL import Image as PILImage
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from excel_reader import Product

logger = logging.getLogger(__name__)

# Colors from the spec
RED   = RGBColor(0xC8, 0x10, 0x2E)
INK   = RGBColor(0x1F, 0x1F, 0x1F)
MUTED = RGBColor(0x8A, 0x8A, 0x8A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

FONT = "Calibri"

# Slide-absolute positions (inches)
TITLE_POS     = (1.50, 1.90, 10.33, 0.70)
UNDERLINE_POS = (5.95, 2.68,  1.42, 0.20)
TABLE_L_POS   = (2.80, 2.93,  2.75, 1.50)
TABLE_R_POS   = (7.29, 2.92,  4.27, 1.50)
PACKSHOT_POS  = (4.98, 3.43,  3.10, 4.07)


def _money(v: Optional[float]) -> str:
    if v is None:
        return ""
    if float(v) == int(v):
        return f"{int(v):,}".replace(",", " ") + ",00"
    return f"{float(v):,.2f}".replace(",", " ").replace(".", ",")


def _set_run(run, text, *, size=14, bold=False, color=INK, italic=False,
             strike=False):
    run.text = text
    f = run.font
    f.name = FONT
    f.size = Pt(size)
    f.bold = bold
    f.italic = italic
    f.color.rgb = color
    if strike:
        _apply_strike(run)


def _apply_strike(run):
    """Enable <a:rPr strike='sngStrike'/> on a run (python-pptx lacks a setter)."""
    rPr = run._r.get_or_add_rPr()
    rPr.set("strike", "sngStrike")


def _style_cell(cell, *, bg=None, pad_top=0.03, pad_bottom=0.03):
    cell.margin_left = Emu(45720)
    cell.margin_right = Emu(45720)
    cell.margin_top = Inches(pad_top)
    cell.margin_bottom = Inches(pad_bottom)
    if bg is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg


def _write_cell(cell, *lines, align=PP_ALIGN.CENTER):
    """Write one or more styled lines into a cell.

    Each `line` is either a string or a dict of run kwargs with 'text'.
    """
    tf = cell.text_frame
    tf.clear()
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        if isinstance(line, str):
            _set_run(p.add_run(), line)
        else:
            _set_run(p.add_run(), **line)


def _add_header_cell(cell, text):
    _style_cell(cell, bg=RED, pad_top=0.05, pad_bottom=0.05)
    _write_cell(cell, {"text": text, "size": 13, "bold": True, "color": WHITE})


def _price_lines(new_val: Optional[float], old_val: Optional[float],
                 promo_new: str = "", promo_old: str = ""):
    """Build the list of styled lines for a price cell."""
    lines = []
    if new_val is None and old_val is None:
        return [""]
    changed = old_val is not None and new_val is not None and abs(new_val - old_val) > 1e-6
    if new_val is not None:
        lines.append({"text": _money(new_val), "size": 16, "bold": True,
                      "color": RED if changed else INK})
    if promo_new:
        lines.append({"text": promo_new, "size": 9, "italic": True, "color": INK})
    if old_val is not None and changed:
        lines.append({"text": _money(old_val), "size": 11, "color": MUTED,
                      "strike": True})
    if promo_old and changed:
        lines.append({"text": promo_old, "size": 9, "italic": True, "color": MUTED,
                      "strike": True})
    return lines or [""]


def add_title(slide, product: Product):
    l, t, w, h = TITLE_POS
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = Emu(0)
    tf.word_wrap = True
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    _set_run(p.add_run(), product.description or product.sku,
             size=28, bold=True, color=RED)


def add_underline(slide, underline_stream):
    if underline_stream is None:
        return
    l, t, w, h = UNDERLINE_POS
    slide.shapes.add_picture(underline_stream, Inches(l), Inches(t),
                             Inches(w), Inches(h))


def add_price_tables(slide, product: Product, colisage: str = ""):
    """Left table (prix à l'unité), right table (prix à la caisse).

    If `colisage` is falsy, the right table falls back to a placeholder.
    """
    # --- Left: Prix à l'unité -------------------------------------------
    l, t, w, h = TABLE_L_POS
    left = slide.shapes.add_table(3, 2, Inches(l), Inches(t), Inches(w), Inches(h)).table
    left.rows[0].height = Inches(0.35)
    # Header row spans both cols
    left.cell(0, 0).merge(left.cell(0, 1))
    _style_cell(left.cell(0, 0), bg=RED)
    _write_cell(left.cell(0, 0),
                {"text": "Prix à l'unité", "size": 14, "bold": True, "color": WHITE})
    _add_header_cell(left.cell(1, 0), "Prix Gros")
    _add_header_cell(left.cell(1, 1), "Prix Gros Net")
    _style_cell(left.cell(2, 0))
    _style_cell(left.cell(2, 1))
    _write_cell(left.cell(2, 0),
                *_price_lines(product.bp_new, product.bp_old))
    _write_cell(left.cell(2, 1),
                *_price_lines(product.net_new, product.net_old,
                              product.promo_new, product.promo_old))

    # --- Right: Prix à la caisse ----------------------------------------
    l, t, w, h = TABLE_R_POS
    right = slide.shapes.add_table(3, 3, Inches(l), Inches(t), Inches(w), Inches(h)).table
    right.rows[0].height = Inches(0.35)
    right.cell(0, 0).merge(right.cell(0, 2))  # merges 0..2 inclusive
    _style_cell(right.cell(0, 0), bg=RED)
    _write_cell(right.cell(0, 0),
                {"text": "Prix à la caisse", "size": 14, "bold": True, "color": WHITE})
    _add_header_cell(right.cell(1, 0), "Colisage")
    _add_header_cell(right.cell(1, 1), "Prix Gros")
    _add_header_cell(right.cell(1, 2), "Prix Gros Net")
    _style_cell(right.cell(2, 0))
    _style_cell(right.cell(2, 1))
    _style_cell(right.cell(2, 2))
    _write_cell(right.cell(2, 0),
                {"text": colisage or "", "size": 14, "bold": True})
    _write_cell(right.cell(2, 1),
                *_price_lines(product.bp_new, product.bp_old))
    _write_cell(right.cell(2, 2),
                *_price_lines(product.net_new, product.net_old))


def add_packshot(slide, product: Product, assets_dir: Path):
    """Insert the packshot. Prefer products/<Item Code>.png, fall back to
    brands/<Brand>.png. Missing → log warning."""
    candidates = [
        assets_dir / "products" / f"{product.item_code}.png",
        assets_dir / "products" / f"{product.item_code}.jpg",
        assets_dir / "brands"   / f"{product.brand}.png",
    ]
    src = next((c for c in candidates if c.exists()), None)
    if src is None:
        logger.warning("no packshot for %s (%s / %s)",
                       product.item_code, product.brand, product.description)
        return

    bx, by, bw, bh = PACKSHOT_POS
    try:
        with PILImage.open(src) as im:
            iw, ih = im.size
    except OSError:
        logger.warning("unreadable image: %s", src)
        return
    ratio = min(bw / (iw / 96), bh / (ih / 96))  # 96 DPI reference
    w = (iw / 96) * ratio
    h = (ih / 96) * ratio
    x = bx + (bw - w) / 2
    y = by + (bh - h) / 2
    slide.shapes.add_picture(str(src), Inches(x), Inches(y), Inches(w), Inches(h))


def build_product_slide(slide, product: Product, assets_dir: Path,
                        underline_stream=None, colisage: str = ""):
    """Assemble one SKU-detail slide. `apply_stable_layer` must be called
    before this function so the stable branding renders behind."""
    add_title(slide, product)
    add_underline(slide, underline_stream)
    add_price_tables(slide, product, colisage=colisage)
    add_packshot(slide, product, assets_dir)
