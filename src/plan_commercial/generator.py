import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image as _PILImage
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from .model import Deck, Group, Product

ASSETS = Path(__file__).resolve().parents[2] / "assets" / "builtin"
# Static intro template for MIO-Détail decks: the first two slides come from
# this file, and the generated content is appended after them.
MIO_DETAIL_TEMPLATE = (
    Path(__file__).resolve().parents[2] / "samples" / "Presentation1.pptx"
)

SLIDE_W = 13.333
SLIDE_H = 7.5

BANNER_POS   = (0.00, 0.00, 4.96, 1.66)
LOGO_POS     = (10.40, 0.10, 2.80, 1.50)   # bigger logo, still inside top-right zone
NAME_POS     = (3.50, 1.50, 6.30, 0.55)   # rule 1: title moved up (more space below)
LABEL_U_POS  = (3.30, 2.30, 1.42, 0.20)   # labels + tables shifted up by 0.30
LABEL_C_POS  = (8.70, 2.30, 1.64, 0.20)
TABLE_U_POS  = (2.70, 2.60, 2.70, 0.80)
TABLE_C_POS  = (7.30, 2.60, 4.30, 0.80)
PACKSHOT_POS = (5.30, 3.60, 2.70, 3.80)
WOOD_POS     = (0.00, 3.69, 13.333, 3.81)

RED   = RGBColor(0xE8, 0x17, 0x2E)
DARK  = RGBColor(0x22, 0x22, 0x22)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)


def _asset(name: str) -> str:
    return str(ASSETS / name)


def _add_pic(slide, path, pos):
    """Stretch image to fill the box exactly. Use for full-bleed assets
    (banner, background, labels, name image, brand logo)."""
    l, t, w, h = pos
    slide.shapes.add_picture(str(path), Inches(l), Inches(t), Inches(w), Inches(h))


def _add_pic_fit(slide, path, pos):
    """Preserve aspect ratio: scale the image to fit inside `pos` (inches) and
    center it within the box. Mirrors preview.py's `_paste_scaled` so the
    downloaded PPTX matches the in-app preview pixel-for-pixel."""
    l, t, w, h = pos
    try:
        with _PILImage.open(str(path)) as im:
            iw, ih = im.size
    except (OSError, FileNotFoundError):
        return
    if iw <= 0 or ih <= 0:
        return
    scale = min(w / iw, h / ih)  # inches per pixel — same as preview's ratio
    nw_in, nh_in = iw * scale, ih * scale
    cx = l + (w - nw_in) / 2
    cy = t + (h - nh_in) / 2
    slide.shapes.add_picture(
        str(path), Inches(cx), Inches(cy), Inches(nw_in), Inches(nh_in),
    )


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
    # Always set an explicit fill: pptx tables inherit a banded theme style
    # whose default body fill is grey, which makes the table look dirty.
    # Defaulting unset cells to white matches the preview's pure-white body.
    cell.fill.solid()
    cell.fill.fore_color.rgb = bg if bg is not None else WHITE


def _fmt(v) -> str:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return "" if v is None else str(v)
    if f == int(f):
        return str(int(f))
    return f"{f:.2f}".replace(".", ",")


def _disable_table_style(tbl) -> None:
    """Turn off the inherited banded/first-row theme so per-cell fills win."""
    tbl.first_row = False
    tbl.horz_banding = False
    tbl.vert_banding = False


def _unite_table(slide, product: Product):
    l, t, w, h = TABLE_U_POS
    tbl = slide.shapes.add_table(2, 2, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _disable_table_style(tbl)
    _style_cell(tbl.cell(0, 0), "Prix Gros",     bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 1), "Prix Gros Net", bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(1, 0), _fmt(product.prix_gros),     bold=True, size=16)
    _style_cell(tbl.cell(1, 1), _fmt(product.prix_gros_net), bold=True, size=16)


def _caisse_table(slide, product: Product):
    l, t, w, h = TABLE_C_POS
    tbl = slide.shapes.add_table(2, 3, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _disable_table_style(tbl)
    # Colisage label is long ("Carton de 12 unités") — give it more horizontal
    # room than the two price columns. Weights 1.6/1/1 ≈ 44/28/28% of width.
    weights = (1.6, 1.0, 1.0)
    total = sum(weights)
    for i, wt in enumerate(weights):
        tbl.columns[i].width = Inches(w * wt / total)
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
        _add_pic_fit(slide, product.packshot_path, pos)


# ---- Promo layout on the pptx slide ---------------------------------------
# Two-bag layout — rule 3 (bags closer to center) + rule 6 (zones don't collide).
# Bag y starts at 4.10 to leave a clean strip (3.70-4.10) for the captions.
PROMO_LEFT_CARTON   = (2.00, 4.10, 3.20, 3.30)
PROMO_RIGHT_CARTON  = (8.20, 4.10, 3.20, 3.30)
PROMO_LEFT_PACK     = (2.40, 4.10, 2.80, 3.30)
PROMO_RIGHT_PACK    = (8.10, 4.10, 2.80, 3.30)
PROMO_LEFT_PACK_INBOX  = (2.35, 4.05, 2.50, 3.30)
PROMO_RIGHT_PACK_INBOX = (8.55, 4.05, 2.50, 3.30)
# Rule 2: captions ABOVE the bags, aligned to the price tables above
# (same x + same width) so the columns line up vertically.
PROMO_LEFT_TEXT  = (2.70, 3.55, 2.70, 0.50)
PROMO_RIGHT_TEXT = (7.30, 3.55, 4.30, 0.50)
# Rule 4: bigger arrow, centered between the two bags.
PROMO_ARROW      = (5.20, 4.80, 3.00, 1.60)
PROMO_BADGE      = (7.60, 0.20, 1.80, 1.30)  # OFFRE BOMBE (smaller so it doesn't hit the new title)
PROMO_LEFT_RIBBON  = (3.80, 4.10, 1.60, 1.40)
PROMO_RIGHT_RIBBON = (9.80, 4.10, 1.60, 1.40)

# Single-bag layout (remise) — rule 5: "Pour.." close to the centered product.
PROMO_REMISE_PACK       = (5.30, 4.10, 2.80, 3.30)
PROMO_REMISE_BADGE      = (7.10, 3.85, 1.90, 1.90)
PROMO_REMISE_LEFT_TEXT  = (3.40, 5.20, 1.80, 0.50)   # snug to bag's left
PROMO_REMISE_RIGHT_TEXT = (8.20, 5.20, 1.80, 0.50)   # snug to bag's right

# Triple-product layout (remise+gratuite with 2 distinct products on right)
PROMO_RG_REMISE_PACK    = (8.20, 4.10, 1.90, 3.30)
PROMO_RG_GRATUITE_PACK  = (10.30, 4.10, 1.90, 3.30)
PROMO_RG_REMISE_LABEL   = (8.20, 3.55, 1.90, 0.50)
PROMO_RG_GRATUITE_LABEL = (10.30, 3.55, 1.90, 0.50)
PROMO_RG_REMISE_BADGE   = (9.10, 4.00, 1.10, 1.10)
PROMO_RG_GRATUITE_BOW   = (11.20, 4.00, 1.10, 1.10)


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
    """Promo caption — center-aligned, vertically centred, dual-color.
    Centered so the column lines up with the price table above it."""
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
        run.font.size = Pt(24)
        run.font.bold = True
        run.font.color.rgb = RED if i == accent_idx else dark_blue


def _has_two_right_products(product) -> bool:
    t = (product.type_promo or "").strip().lower()
    if t not in ("remise+gratuite", "gratuite+remise"):
        return False
    rem = (product.promo_remise_image or "").strip()
    grt = (product.promo_gratuite_image or "").strip()
    return bool(rem) and bool(grt) and rem != grt


def _resolve_right_image_pptx(product):
    t = (product.type_promo or "").strip().lower()
    if "gratuite" in t and product.promo_gratuite_image:
        return product.promo_gratuite_image
    if "remise" in t and product.promo_remise_image:
        return product.promo_remise_image
    return product.packshot_path


def _add_promo(slide, product):
    """Branch on `type_promo` + per-role product images:
      - "remise"            → single-bag layout
      - "remise+gratuite" with 2 distinct images → triple-product layout
      - else                → standard two-bag layout
    """
    t = (product.type_promo or "").strip().lower()
    if t == "remise":
        _add_promo_remise(slide, product)
    elif _has_two_right_products(product):
        _add_promo_triple(slide, product)
    else:
        _add_promo_two_bags(slide, product)


def _add_promo_remise(slide, product):
    """Single centered bag + REMISE badge + 2 side captions, no arrow."""
    bag = product.promo_remise_image or product.packshot_path
    if bag:
        _add_pic_fit(slide, bag, PROMO_REMISE_PACK)

    badge = product.promo_ribbon_image
    if not badge:
        default_remise = ASSETS / "default_remise.png"
        if default_remise.exists():
            badge = str(default_remise)
    if badge:
        _add_pic_fit(slide, badge, PROMO_REMISE_BADGE)

    left_txt, right_txt = _promo_texts(product)
    if left_txt:
        _add_promo_text(slide, PROMO_REMISE_LEFT_TEXT, left_txt, accent_idx=1)
    if right_txt:
        _add_promo_text(slide, PROMO_REMISE_RIGHT_TEXT, right_txt, accent_idx=0)


def _add_promo_triple(slide, product):
    """Triple-product layout for remise+gratuite with 2 distinct products
    on the right (one earning the discount, one given for free). Each
    right product is auto-marked: remise gets the yellow REMISE badge,
    gratuite gets the bow."""
    # Left: bought product
    if product.packshot_path:
        _add_pic_fit(slide, product.packshot_path, PROMO_LEFT_PACK)

    # Right column: remise product on the left, gratuite on the right
    _add_pic_fit(slide, product.promo_remise_image,   PROMO_RG_REMISE_PACK)
    _add_pic_fit(slide, product.promo_gratuite_image, PROMO_RG_GRATUITE_PACK)

    # Auto role markers
    remise_badge = ASSETS / "default_remise.png"
    if remise_badge.exists():
        _add_pic_fit(slide, str(remise_badge), PROMO_RG_REMISE_BADGE)
    bow = ASSETS / "default_ribbon.png"
    if bow.exists():
        _add_pic_fit(slide, str(bow), PROMO_RG_GRATUITE_BOW)

    # Big red arrow
    _add_text(slide, PROMO_ARROW, "→",
              size=140, bold=True, color=RED)

    # Captions
    pct = product.promo_remise_pct or 0
    qty = product.promo_gratuit_qte or 0
    left_txt = (f"Pour {product.promo_achat_qte} caisses"
                if product.promo_achat_qte else "")
    remise_lbl = f"REMISE -{_pct(pct)}%"
    gratuite_lbl = f"{qty} GRATUITE{'S' if qty > 1 else ''}"

    if left_txt:
        _add_promo_text(slide, PROMO_LEFT_TEXT, left_txt, accent_idx=1)
    _add_promo_text(slide, PROMO_RG_REMISE_LABEL, remise_lbl, accent_idx=1)
    _add_promo_text(slide, PROMO_RG_GRATUITE_LABEL, gratuite_lbl, accent_idx=1)


def _add_promo_two_bags(slide, product):
    """Two-bag layout. Default = 2 packshots only. Carton/ribbon are opt-in
    via `promo_carton_left/right` and `promo_ribbon_left/right` flags."""
    bomb = ASSETS / "offre_bombe.png"
    if bomb.exists():
        _add_pic_fit(slide, str(bomb), PROMO_BADGE)

    # Resolve carton + ribbon images (user override OR built-in default)
    carton_img = product.promo_carton_image
    if not carton_img:
        default_carton = ASSETS / "default_carton.png"
        if default_carton.exists():
            carton_img = str(default_carton)

    ribbon_img = product.promo_ribbon_image
    if not ribbon_img:
        default_ribbon = ASSETS / "default_ribbon.png"
        if default_ribbon.exists():
            ribbon_img = str(default_ribbon)

    # ── LEFT side: carton (if on) BEHIND, then bag, then ribbon (if on) ──
    if product.promo_carton_left and carton_img:
        _add_pic_fit(slide, carton_img, PROMO_LEFT_CARTON)
    if product.packshot_path:
        _add_pic_fit(
            slide, product.packshot_path,
            PROMO_LEFT_PACK_INBOX if product.promo_carton_left else PROMO_LEFT_PACK,
        )
    if product.promo_ribbon_left and ribbon_img:
        _add_pic_fit(slide, ribbon_img, PROMO_LEFT_RIBBON)

    # ── RIGHT side: image is the resolved per-role override (different SKU) ──
    right_image = _resolve_right_image_pptx(product)
    if product.promo_carton_right and carton_img:
        _add_pic_fit(slide, carton_img, PROMO_RIGHT_CARTON)
    if right_image:
        _add_pic_fit(
            slide, right_image,
            PROMO_RIGHT_PACK_INBOX if product.promo_carton_right else PROMO_RIGHT_PACK,
        )
    if product.promo_ribbon_right and ribbon_img:
        _add_pic_fit(slide, ribbon_img, PROMO_RIGHT_RIBBON)

    # Red arrow in the middle
    # Rule 4: bigger arrow
    _add_text(slide, PROMO_ARROW, "→",
              size=140, bold=True, color=RED)

    # Captions BESIDE the bags, left-aligned.
    left_txt, right_txt = _promo_texts(product)
    if left_txt:
        _add_promo_text(slide, PROMO_LEFT_TEXT, left_txt, accent_idx=1)
    if right_txt:
        _add_promo_text(slide, PROMO_RIGHT_TEXT, right_txt, accent_idx=0)


def _norm(s: str) -> str:
    """Strip accents + casefold for forgiving label comparison."""
    nfkd = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip().casefold()


def _is_mio_detail(deck: Deck) -> bool:
    """True when every group is 'Détail' and every subgroup is 'MIO'.

    Drives whether to start the deck from the static MIO_DETAIL_TEMPLATE
    instead of synthesizing a cover."""
    if not deck.groupes:
        return False
    for g in deck.groupes:
        if _norm(g.nom) != "detail":
            return False
        if not g.sous_groupes:
            return False
        for sg in g.sous_groupes:
            if _norm(sg.nom) != "mio":
                return False
    return True


def build_pptx(deck: Deck, output_path: Optional[str] = None,
               with_subgroup_dividers: bool = True) -> bytes:
    use_template = _is_mio_detail(deck) and MIO_DETAIL_TEMPLATE.exists()
    if use_template:
        # Inherit the two static intro pages (cadre + secondary) from the
        # template; skip the generated cover.
        prs = Presentation(str(MIO_DETAIL_TEMPLATE))
    else:
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
