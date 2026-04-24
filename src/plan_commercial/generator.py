from io import BytesIO
from pathlib import Path
from typing import Optional

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from .model import Deck, Group, Product

ASSETS = Path(__file__).resolve().parents[2] / "assets" / "builtin"

SLIDE_W = 13.333
SLIDE_H = 7.5

BANNER_POS   = (0.00, 0.00, 4.96, 1.66)
LOGO_POS     = (10.91, 0.14, 2.21, 1.06)
NAME_POS     = (3.50, 1.90, 6.30, 0.55)
LABEL_U_POS  = (3.30, 2.60, 1.42, 0.20)
LABEL_C_POS  = (8.70, 2.60, 1.64, 0.20)
TABLE_U_POS  = (2.70, 2.90, 2.70, 0.80)
TABLE_C_POS  = (7.30, 2.90, 4.30, 0.80)
PACKSHOT_POS = (5.30, 3.60, 2.70, 3.80)
WOOD_POS     = (0.00, 3.69, 13.333, 3.81)

RED   = RGBColor(0xE8, 0x17, 0x2E)
DARK  = RGBColor(0x22, 0x22, 0x22)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)


def _asset(name: str) -> str:
    return str(ASSETS / name)


def _add_pic(slide, path, pos):
    l, t, w, h = pos
    slide.shapes.add_picture(str(path), Inches(l), Inches(t), Inches(w), Inches(h))


def _blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _add_background(slide, deck: Deck):
    _add_pic(slide, deck.background_path or _asset("wood_background.png"), WOOD_POS)


def _add_banner(slide, deck: Deck):
    _add_pic(slide, deck.banner_path or _asset("banner_canal_gros.png"), BANNER_POS)


def _add_logo(slide, group: Optional[Group]):
    logo = group.logo_path if group and group.logo_path else _asset("mio_logo.png")
    _add_pic(slide, logo, LOGO_POS)


def _add_text(slide, pos, text, *, size=24, bold=False, color=DARK, align=PP_ALIGN.CENTER):
    l, t, w, h = pos
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return tb


def _style_cell(cell, text, *, bold=False, size=14, color=DARK, bg=None):
    cell.margin_left = cell.margin_right = Emu(45720)
    cell.margin_top = cell.margin_bottom = Emu(22860)
    tf = cell.text_frame
    tf.clear()
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = str(text)
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    if bg is not None:
        cell.fill.solid()
        cell.fill.fore_color.rgb = bg


def _fmt(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "" if v is None else str(v)
    if f == int(f):
        return str(int(f))
    return f"{f:.2f}".replace(".", ",")


def _unite_table(slide, product: Product):
    l, t, w, h = TABLE_U_POS
    tbl = slide.shapes.add_table(2, 2, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _style_cell(tbl.cell(0, 0), "Prix Gros",     bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 1), "Prix Gros Net", bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(1, 0), _fmt(product.prix_gros),     bold=True, size=16)
    _style_cell(tbl.cell(1, 1), _fmt(product.prix_gros_net), bold=True, size=16)


def _caisse_table(slide, product: Product):
    l, t, w, h = TABLE_C_POS
    tbl = slide.shapes.add_table(2, 3, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _style_cell(tbl.cell(0, 0), "Colisage",      bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 1), "Prix Gros",     bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 2), "Prix Gros Net", bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(1, 0), product.colisage,                      bold=True, size=14)
    _style_cell(tbl.cell(1, 1), _fmt(product.colisage_prix_gros),      bold=True, size=16)
    _style_cell(tbl.cell(1, 2), _fmt(product.colisage_prix_gros_net),  bold=True, size=16)


def _add_cover(prs, deck: Deck):
    slide = _blank(prs)
    _add_background(slide, deck)
    _add_banner(slide, deck)
    _add_text(slide, (1.0, 2.0, 11.3, 0.9), deck.titre, size=54, bold=True, color=DARK)
    _add_text(slide, (1.0, 2.9, 11.3, 0.6), deck.canal, size=32, bold=True, color=RED)
    _add_text(slide, (1.0, 3.55, 11.3, 0.5), deck.mois, size=22, color=DARK)
    if deck.cover_photo_path:
        _add_pic(slide, deck.cover_photo_path, (3.3, 4.3, 6.7, 2.9))


def _add_subgroup_divider(prs, deck: Deck, group: Group, subgroup_name: str):
    slide = _blank(prs)
    _add_background(slide, deck)
    _add_banner(slide, deck)
    _add_logo(slide, group)
    _add_text(slide, (1.0, 2.8, 11.3, 0.7), group.nom,      size=28, color=DARK)
    _add_text(slide, (1.0, 3.5, 11.3, 0.9), subgroup_name,  size=48, bold=True, color=RED)


def _add_product_slide(prs, deck: Deck, group: Group, product: Product):
    slide = _blank(prs)
    _add_background(slide, deck)
    _add_banner(slide, deck)
    _add_logo(slide, group)

    if product.nom_image_path:
        _add_pic(slide, product.nom_image_path, NAME_POS)
    else:
        _add_text(slide, NAME_POS, product.nom, size=32, bold=True, color=RED)

    _add_pic(slide, _asset("label_prix_unite.png"),  LABEL_U_POS)
    _add_pic(slide, _asset("label_prix_caisse.png"), LABEL_C_POS)

    _unite_table(slide, product)
    _caisse_table(slide, product)

    if product.is_promo:
        _add_promo(slide, product)
    elif product.packshot_path:
        dl, dt, dw, dh = PACKSHOT_POS
        pos = (
            product.packshot_left if product.packshot_left > 0 else dl,
            product.packshot_top if product.packshot_top > 0 else dt,
            product.packshot_width if product.packshot_width > 0 else dw,
            product.packshot_height if product.packshot_height > 0 else dh,
        )
        _add_pic(slide, product.packshot_path, pos)


# ---- Promo layout on the pptx slide ---------------------------------------
PROMO_LEFT_PACK  = (1.20, 3.55, 2.80, 3.90)
PROMO_RIGHT_PACK = (8.80, 3.55, 2.80, 3.90)
PROMO_LEFT_TEXT  = (0.60, 4.70, 3.40, 0.55)
PROMO_RIGHT_TEXT = (7.60, 4.70, 3.80, 0.55)
PROMO_ARROW      = (5.40, 4.60, 2.30, 0.70)
PROMO_BADGE      = (7.60, 0.20, 1.80, 1.70)


def _pct(v):
    if v is None:
        return "0"
    if float(v) == int(v):
        return str(int(v))
    return f"{float(v):.1f}".replace(".", ",")


def _promo_texts(product):
    if product.promo_texte:
        left = f"Pour {product.promo_achat_qte} caisses" if product.promo_achat_qte else ""
        return left, product.promo_texte
    n = product.promo_achat_qte or 0
    x = product.promo_gratuit_qte or 0
    p = product.promo_remise_pct or 0
    left = f"Pour {n} caisses" if n else ""
    t = (product.type_promo or "").strip().lower()
    if t == "gratuite":
        right = f"{x} caisse{'s' if x > 1 else ''} Gratuite{'s' if x > 1 else ''}"
    elif t == "remise":
        right = f"-{_pct(p)}% de remise"
    elif t in {"remise+gratuite", "gratuite+remise"}:
        right = (f"{x} caisse{'s' if x > 1 else ''} Gratuite{'s' if x > 1 else ''}"
                 f" + -{_pct(p)}%")
    else:
        right = ""
    return left, right


def _add_promo_text(slide, pos, text, accent_idx=1):
    """Text with one word (default: second) in red; rest in dark blue."""
    l, t, w, h = pos
    tb = slide.shapes.add_textbox(Inches(l), Inches(t), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    words = text.split()
    dark_blue = RGBColor(0x1E, 0x1E, 0x50)
    for i, w2 in enumerate(words):
        run = p.add_run()
        run.text = w2 + (" " if i < len(words) - 1 else "")
        run.font.size = Pt(28)
        run.font.bold = True
        run.font.color.rgb = RED if i == accent_idx else dark_blue


def _add_promo(slide, product):
    # Optional OFFRE BOMBE badge (if user placed offre_bombe.png in assets/builtin/)
    bomb = ASSETS / "offre_bombe.png"
    if bomb.exists():
        _add_pic(slide, str(bomb), PROMO_BADGE)

    # Two packshots (left + right, same image)
    if product.packshot_path:
        _add_pic(slide, product.packshot_path, PROMO_LEFT_PACK)
        _add_pic(slide, product.packshot_path, PROMO_RIGHT_PACK)
        # Decorative bow on right (gratuite / remise+gratuite)
        t = (product.type_promo or "").strip().lower()
        if "gratuite" in t:
            bow = ASSETS / "bow_overlay.png"
            if bow.exists():
                _add_pic(slide, str(bow),
                         (PROMO_RIGHT_PACK[0] + 1.2,
                          PROMO_RIGHT_PACK[1] - 0.1, 1.4, 1.2))

    # Red arrow in the middle
    _add_text(slide, PROMO_ARROW, "→",
              size=72, bold=True, color=RED)

    # Two promo texts
    left_txt, right_txt = _promo_texts(product)
    _add_promo_text(slide, PROMO_LEFT_TEXT, left_txt, accent_idx=1)
    _add_promo_text(slide, PROMO_RIGHT_TEXT, right_txt, accent_idx=0)


def build_pptx(deck: Deck, output_path: Optional[str] = None,
               with_subgroup_dividers: bool = True) -> bytes:
    prs = Presentation()
    prs.slide_width = Inches(SLIDE_W)
    prs.slide_height = Inches(SLIDE_H)

    _add_cover(prs, deck)
    for group in deck.groupes:
        for subgroup in group.sous_groupes:
            if with_subgroup_dividers:
                _add_subgroup_divider(prs, deck, group, subgroup.nom)
            for product in subgroup.produits:
                _add_product_slide(prs, deck, group, product)

    buf = BytesIO()
    prs.save(buf)
    data = buf.getvalue()
    if output_path:
        Path(output_path).write_bytes(data)
    return data
