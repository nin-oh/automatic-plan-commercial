"""CLI: build a Plan Commercial Canal Gros deck from a PL_Changes_*.xlsx.

Usage:
    python generate_deck.py \
        --excel PL_Changes_260415_-_Gros.xlsx \
        --assets ./assets \
        --month "Avril 2026" \
        --out ./output/Plan_commercial_Gros_Avril_2026.pptx
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from excel_reader import Product, grouped, read_byfpc
from product_layer import FONT, INK, RED, build_product_slide
from stable_layer import StableAssets, apply_stable_layer

logger = logging.getLogger("generate_deck")

SLIDE_W = 13.333
SLIDE_H = 7.5


def _blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _textbox(slide, pos, text, *, size, bold=False, color=INK,
             align=PP_ALIGN.CENTER):
    l, t, w, h = pos
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = Emu(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color


def build_cover(prs, assets: StableAssets, month: str):
    slide = _blank(prs)
    apply_stable_layer(slide, assets, variant="cover")
    _textbox(slide, (1.0, 2.4, 11.3, 1.0), "PLAN COMMERCIAL",
             size=54, bold=True, color=INK)
    _textbox(slide, (1.0, 3.4, 11.3, 0.8), "Canal Gros",
             size=36, bold=True, color=RED)
    _textbox(slide, (1.0, 4.2, 11.3, 0.6), month, size=24, color=INK)


def build_section_intro(prs, assets: StableAssets, category: str,
                        assets_dir: Path):
    slide = _blank(prs)
    apply_stable_layer(slide, assets, variant="section")
    _textbox(slide, (1.0, 2.8, 11.3, 1.2), category,
             size=54, bold=True, color=RED)
    badge = assets_dir / "categories" / f"{category.replace(' ', '_')}.png"
    if badge.exists():
        slide.shapes.add_picture(str(badge),
                                 Inches(5.17), Inches(4.15),
                                 Inches(3.0), Inches(2.5))


def build_brand_intro(prs, assets: StableAssets, brand: str,
                      assets_dir: Path):
    slide = _blank(prs)
    apply_stable_layer(slide, assets, variant="brand")
    _textbox(slide, (1.0, 2.8, 11.3, 1.2), brand,
             size=54, bold=True, color=RED)
    logo = assets_dir / "brands" / f"{brand}.png"
    if logo.exists():
        slide.shapes.add_picture(str(logo),
                                 Inches(5.17), Inches(4.15),
                                 Inches(3.0), Inches(2.5))


def build_closing(prs, assets: StableAssets):
    slide = _blank(prs)
    apply_stable_layer(slide, assets, variant="closing")
    _textbox(slide, (1.0, 3.0, 11.3, 1.5), "Merci",
             size=72, bold=True, color=RED)


def generate(excel: Path, assets_dir: Path, month: str, out: Path,
             header_row: int = 5) -> int:
    products = read_byfpc(excel, header_row=header_row)
    if not products:
        logger.error("no products found in %s", excel)
        return 1

    stable = StableAssets.load(assets_dir / "stable")
    underline_stream = stable.stream("underline") if "underline" in stable.data else None

    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)

    build_cover(prs, stable, month)

    slide_count = 1
    for category, brands in grouped(products):
        build_section_intro(prs, stable, category, assets_dir)
        slide_count += 1
        for brand, items in brands:
            build_brand_intro(prs, stable, brand, assets_dir)
            slide_count += 1
            for product in items:
                slide = _blank(prs)
                apply_stable_layer(slide, stable, variant="product")
                # Colisage isn't in the Excel — leave blank; caller can enrich later
                build_product_slide(
                    slide, product, assets_dir,
                    underline_stream=stable.stream("underline")
                        if "underline" in stable.data else None,
                    colisage="",
                )
                slide_count += 1

    build_closing(prs, stable)
    slide_count += 1

    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out))
    logger.info("wrote %s  (%d slides, %d products)",
                out, slide_count, len(products))
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--excel", required=True, type=Path,
                    help="PL_Changes_*.xlsx input")
    ap.add_argument("--assets", default=Path("./assets"), type=Path,
                    help="assets directory (stable/, categories/, brands/, products/)")
    ap.add_argument("--month",
                    help='e.g. "Avril 2026" (required unless --tree)')
    ap.add_argument("--out", type=Path,
                    help="output .pptx path (required unless --tree)")
    ap.add_argument("--header-row", type=int, default=5,
                    help="1-indexed header row in ByFPC (default 5)")
    ap.add_argument("--tree", action="store_true",
                    help="print the Category->Brand->SKU tree and exit")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(message)s",
    )

    if args.tree:
        from excel_reader import print_tree
        print_tree(read_byfpc(args.excel, header_row=args.header_row))
        return 0

    if not args.month or not args.out:
        ap.error("--month and --out are required unless --tree is passed")

    return generate(args.excel, args.assets, args.month, args.out,
                    header_row=args.header_row)


if __name__ == "__main__":
    sys.exit(main())
