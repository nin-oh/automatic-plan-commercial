import re as _re
import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Optional

from PIL import Image as _PILImage
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from .model import Deck, Group, Product, SubGroup

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
# "Nouveau lancement" ribbon — top-centre, in the gap between the canal
# banner (ends ~4.96) and the logo (starts ~10.40). Aspect ≈ 2.76.
NOUVEAU_POS  = (5.55, 0.08, 3.40, 1.23)
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


# ── Packshot auto-trim ──────────────────────────────────────────────────────
# Many packshots carry a wide transparent margin baked into the PNG. Because
# the renderer scales an image by its FULL pixel size, such a product ends up
# small inside its box while a tightly-cropped neighbour fills the same box —
# visibly inconsistent (measured: IRIS 10kg filled only 25% of its image).
# `_trim_transparent` crops the fully-transparent margin away (by the alpha
# channel, so a transparent-WHITE border is caught too), then re-pads by a
# small uniform fraction so every product gets the same breathing room and
# nothing touches the box edge.
_TRIM_PAD_FRAC = 0.03      # transparent margin re-added, as a fraction of max(w,h)
_TRIM_SKIP_FILL = 0.985    # already this full? leave it — nothing to gain

# (path, mtime) -> (png_bytes, width_px, height_px). Trimming forces a decode +
# re-encode; memoising keeps a multi-slide build from paying it twice for the
# same file (promo layouts reuse the packshot on the left and right).
_trim_cache: dict = {}


def _trim_transparent(im: "_PILImage.Image") -> "_PILImage.Image":
    """Return `im` cropped to its opaque content + a small uniform transparent
    margin. No-op (returns the input) when the image has no alpha, is fully
    transparent, or is already essentially full-bleed."""
    if im.mode != "RGBA":
        return im
    bbox = im.getchannel("A").getbbox()
    if not bbox:
        return im                     # fully transparent — leave as-is
    cw, ch = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if cw * ch >= im.width * im.height * _TRIM_SKIP_FILL:
        return im                     # already tight — skip the re-encode
    cropped = im.crop(bbox)
    pad = max(1, round(_TRIM_PAD_FRAC * max(cw, ch)))
    out = _PILImage.new("RGBA", (cw + 2 * pad, ch + 2 * pad), (0, 0, 0, 0))
    out.paste(cropped, (pad, pad))
    return out


def _safe_picture_stream(path, trim: bool = False):
    """Return `(BytesIO, width_px, height_px)` ready for
    `slide.shapes.add_picture`. Routes problem formats through a PIL →
    PNG sanitiser, but takes a fast path for already-safe files.

    Why the fast path matters: a 165-slide deck embeds 500-800 images.
    Re-encoding every one as PNG (decode → convert → deflate) costs
    ~0.5 s per ≥1 MB packshot — 5+ minutes total. Files that are
    already standard RGB/RGBA PNG or RGB JPEG bypass PIL entirely and
    embed their original bytes (just opened twice — once to peek at
    mode/size, once to slurp the bytes).

    Slow path (PIL re-encode) triggers for:
      * WebP, BMP, TIFF, GIF, anything non-PNG/JPEG by extension
      * CMYK JPEG  — PowerPoint refuses these
      * Palette PNG with transparency, LA, PA — same
      * Any file whose extension lies about its real format

    Returns `None` for unreadable files (missing / corrupt) — the caller
    skips adding the picture entirely in that case.

    `trim=True` (packshots only): crop the transparent margin baked into the
    file so every product fills its box consistently. This always decodes +
    re-encodes, so it bypasses the fast path — memoised by (path, mtime).
    """
    path_str = str(path)
    ext = path_str.lower().rsplit(".", 1)[-1] if "." in path_str else ""

    # ── Trim path: crop transparent margin, then re-encode (memoised) ──
    if trim:
        try:
            key = (path_str, Path(path_str).stat().st_mtime)
        except OSError:
            return None
        hit = _trim_cache.get(key)
        if hit is not None:
            buf, iw, ih = hit
            return BytesIO(buf), iw, ih
        try:
            with _PILImage.open(path_str) as im:
                im.load()
                if im.width <= 0 or im.height <= 0:
                    return None
                # Only RGBA can carry a transparent margin; other modes are
                # normalised the same way the slow path does, then pass through.
                if im.mode == "CMYK":
                    clean = im.convert("RGB")
                elif im.mode in ("RGB", "RGBA"):
                    clean = im
                elif im.mode == "P" and "transparency" in im.info:
                    clean = im.convert("RGBA")
                elif im.mode in ("LA", "PA"):
                    clean = im.convert("RGBA")
                else:
                    clean = im.convert("RGB")
                clean = _trim_transparent(clean)
                out = BytesIO()
                clean.save(out, format="PNG", optimize=False)
                data = out.getvalue()
                _trim_cache[key] = (data, clean.width, clean.height)
                return BytesIO(data), clean.width, clean.height
        except (OSError, FileNotFoundError, _PILImage.DecompressionBombError):
            return None

    # ── Fast path: peek without decoding pixels ──
    if ext in ("png", "jpg", "jpeg"):
        try:
            with _PILImage.open(path_str) as im:
                iw, ih = im.size
                if iw <= 0 or ih <= 0:
                    return None
                mode = im.mode
                # Modes PowerPoint handles without complaint AND the
                # file extension matches the real format.
                if (
                    (ext == "png" and mode in ("RGB", "RGBA") and "transparency" not in im.info)
                    or (ext in ("jpg", "jpeg") and mode == "RGB" and im.format == "JPEG")
                ):
                    with open(path_str, "rb") as f:
                        return BytesIO(f.read()), iw, ih
        except (OSError, FileNotFoundError, _PILImage.DecompressionBombError):
            return None

    # ── Slow path: PIL convert + re-encode as PNG ──
    try:
        with _PILImage.open(path_str) as im:
            im.load()                         # force decode (catches corrupt files)
            iw, ih = im.size
            if iw <= 0 or ih <= 0:
                return None
            if im.mode == "CMYK":
                clean = im.convert("RGB")
            elif im.mode in ("RGB", "RGBA"):
                clean = im
            elif im.mode == "P" and "transparency" in im.info:
                clean = im.convert("RGBA")
            elif im.mode in ("LA", "PA"):
                clean = im.convert("RGBA")
            else:
                clean = im.convert("RGB")
            buf = BytesIO()
            clean.save(buf, format="PNG", optimize=False)
            buf.seek(0)
            return buf, iw, ih
    except (OSError, FileNotFoundError, _PILImage.DecompressionBombError):
        return None


def _add_pic(slide, path, pos):
    """Stretch image to fill the box exactly. Use for full-bleed assets
    (banner, background, labels, name image, brand logo). Goes through
    `_safe_picture_stream()` so any non-standard source format becomes
    a clean embedded PNG."""
    res = _safe_picture_stream(path)
    if res is None:
        return
    stream, _, _ = res
    l, t, w, h = pos
    slide.shapes.add_picture(stream, Inches(l), Inches(t), Inches(w), Inches(h))


def _add_pic_fit(slide, path, pos, *, anchor: str = "center", trim: bool = False):
    """Preserve aspect ratio: scale the image to fit inside `pos` (inches)
    and anchor it within the box. Mirrors preview.py's `_paste_scaled` so
    the downloaded PPTX matches the in-app preview pixel-for-pixel.

    `anchor`:
      * ``"center"`` (default) — image centered vertically. Used for
        decorations (bow, banner, badge) that should sit at a known spot.
      * ``"bottom"`` — image's bottom edge aligns with the box bottom.
        Used for product packshots so tall and short products share the
        same baseline ("standing on the wood floor"), instead of one
        floating in the middle of its box.

    `trim=True` — crop the packshot's transparent margin first so it fills
    the box consistently. Pass for product images, NOT for decorations
    (carton / ribbon / badge / bow) whose padding is intentional.
    """
    res = _safe_picture_stream(path, trim=trim)
    if res is None:
        return
    stream, iw, ih = res
    l, t, w, h = pos
    scale = min(w / iw, h / ih)  # inches per pixel — same as preview's ratio
    nw_in, nh_in = iw * scale, ih * scale
    cx = l + (w - nw_in) / 2
    if anchor == "bottom":
        cy = t + (h - nh_in)
    else:
        cy = t + (h - nh_in) / 2
    slide.shapes.add_picture(
        stream, Inches(cx), Inches(cy), Inches(nw_in), Inches(nh_in),
    )


def _blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def _add_background(slide, deck: Deck):
    _add_pic(slide, deck.background_path or _asset("wood_background.png"), WOOD_POS)


def _default_banner(canal: str) -> str:
    """Channel-aware built-in banner: the "Canal Détail" ribbon for Détail
    decks, the "Canal Gros" ribbon otherwise. The banner is ALWAYS derived
    from the canal — a manual override proved to be a footgun (a stale
    "Canal Gros" upload silently shipping on a Détail deck), so
    deck.banner_path is intentionally ignored here."""
    name = "banner_canal_detail.png" if _is_detail(canal) else "banner_canal_gros.png"
    return _asset(name)


def _add_banner(slide, deck: Deck):
    _add_pic(slide, _default_banner(deck.canal), BANNER_POS)


def _add_logo(slide, group: Optional[Group],
              subgroup: Optional[SubGroup] = None):
    """Pick the per-slide logo. SubGroup.logo_path wins because that's
    where the actual brand identifier lives when the user has bulk-set
    groupe to a channel label ("Gros"/"Détail"). Falls back to the
    Group's logo (the old-shape data where groupe was the brand), then
    to the built-in MIO logo so a slide is never logo-less."""
    logo = (
        (subgroup.logo_path if subgroup and subgroup.logo_path else None)
        or (group.logo_path if group and group.logo_path else None)
        or _asset("mio_logo.png")
    )
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


# ─── Channel-aware helpers ────────────────────────────────────────────
# When `canal` carries "détail" (case/accent-insensitive) the price
# tables show "Prix Détail / Prix Détail Net", the promo wording uses
# "unités" instead of "caisses", and the cell values come from
# `prix_detail` / `prix_detail_net` (falling back to gros when those
# fields are zero/empty — keeps existing single-channel data working).
def _is_detail(canal: str) -> bool:
    v = (canal or "").lower()
    return "détail" in v or "detail" in v


def _price_pair(product: Product, is_detail: bool):
    """Unit (brut, net) prices for the current channel. Falls back to
    the gros pair when the detail fields are unset, so a sheet that
    only fills `prix_gros` still renders correctly under Détail."""
    if is_detail:
        brut = product.prix_detail or product.prix_gros
        net = product.prix_detail_net or product.prix_gros_net
        return brut, net
    return product.prix_gros, product.prix_gros_net


def _price_labels(is_detail: bool):
    """Headers for the price tables."""
    if is_detail:
        return "Prix Détail", "Prix Détail Net"
    return "Prix Gros", "Prix Gros Net"


def _unit_word(is_detail: bool, n: int, override: str = "") -> str:
    """Singular / plural noun for the promo "Pour N …" wording.

    Priority: explicit per-product `override` (sac / carton / caisse /
    unité) wins, then channel default (Gros → caisse, Détail → unité).
    Empty override falls back to channel default. Pluralisation is
    automatic.
    """
    base = (override or "").strip().lower()
    if base == "sac":
        return "sac" if n <= 1 else "sacs"
    if base == "carton":
        return "carton" if n <= 1 else "cartons"
    if base == "caisse":
        return "caisse" if n <= 1 else "caisses"
    if base == "colis":
        return "colis"                       # invariable: un colis / des colis
    if base == "palette":
        return "palette" if n <= 1 else "palettes"
    if base in {"unité", "unite"}:
        return "unité" if n <= 1 else "unités"
    # Fall back to channel default.
    if is_detail:
        return "unité" if n <= 1 else "unités"
    return "caisse" if n <= 1 else "caisses"


def _unit_word_fem_adj(_is_detail: bool, n: int, override: str = "") -> str:
    """Agreement suffix for the past-participle "Gratuite(s)". All
    container words we support are masculine (sac, carton) or feminine
    (caisse, unité). The user's original phrasing uses the FEMININE form
    ("1 caisse Gratuite") which agrees with caisse/unité. For sac/carton
    the masculine "Gratuit(s)" would be technically correct; we let the
    caller decide via the explicit override. Default: feminine to keep
    legacy behaviour."""
    base = (override or "").strip().lower()
    masculine = base in {"sac", "carton"}
    if masculine:
        return ("" if n <= 1 else "s")           # "Gratuit" / "Gratuits"
    return "" if n <= 1 else "s"                 # "Gratuite" / "Gratuites"


def _gratuite_word(is_detail: bool, n: int, override: str = "") -> str:
    """Returns 'Gratuit' or 'Gratuite' (with optional plural -s).
    Masculine for sac/carton, feminine for caisse/unité."""
    base = (override or "").strip().lower()
    masculine = base in {"sac", "carton", "colis"}
    root = "Gratuit" if masculine else "Gratuite"
    return root + ("" if n <= 1 else "s")


def _unite_table(slide, product: Product, is_detail: bool = False):
    l, t, w, h = TABLE_U_POS
    tbl = slide.shapes.add_table(2, 2, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _disable_table_style(tbl)
    h1, h2 = _price_labels(is_detail)
    brut, net = _price_pair(product, is_detail)
    _style_cell(tbl.cell(0, 0), h1, bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 1), h2, bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(1, 0), _fmt(brut), bold=True, size=16)
    _style_cell(tbl.cell(1, 1), _fmt(net),  bold=True, size=16)


def _caisse_table(slide, product: Product, is_detail: bool = False):
    l, t, w, h = TABLE_C_POS
    tbl = slide.shapes.add_table(2, 3, Inches(l), Inches(t), Inches(w), Inches(h)).table
    _disable_table_style(tbl)
    # Colisage label is long ("Carton de 12 unités") — give it more horizontal
    # room than the two price columns. Weights 1.6/1/1 ≈ 44/28/28% of width.
    weights = (1.6, 1.0, 1.0)
    total = sum(weights)
    for i, wt in enumerate(weights):
        tbl.columns[i].width = Inches(w * wt / total)
    h1, h2 = _price_labels(is_detail)
    _style_cell(tbl.cell(0, 0), "Colisage", bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 1), h1,         bold=True, color=WHITE, bg=RED)
    _style_cell(tbl.cell(0, 2), h2,         bold=True, color=WHITE, bg=RED)
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


def _add_subgroup_divider(prs, deck: Deck, group: Group,
                          subgroup: SubGroup):
    slide = _blank(prs)
    _add_background(slide, deck)
    _add_banner(slide, deck)
    _add_logo(slide, group, subgroup)
    _add_text(slide, (1.0, 2.8, 11.3, 0.7), group.nom,      size=28, color=DARK)
    _add_text(slide, (1.0, 3.5, 11.3, 0.9), subgroup.nom,   size=48, bold=True, color=RED)


def _dual_boxes(box):
    """From a single centre box, two overlapping packshot boxes for the
    two-scent layout: the back bottle is left + slightly higher & smaller,
    the front bottle is right + full-size, overlapping in the middle."""
    l, t, w, h = box
    cx = l + w / 2
    bw, bh = w * 0.82, h * 0.88
    fw, fh = w * 0.94, h * 1.00
    back = (cx - 0.24 * w - bw / 2, t + h - bh - 0.06 * h, bw, bh)
    front = (cx + 0.24 * w - fw / 2, t + h - fh, fw, fh)
    return back, front


def _add_dual_packshots(slide, p_back, p_front, box):
    """Two scents on one slide — back bottle first, front bottle on top."""
    back, front = _dual_boxes(box)
    if p_back:
        _add_pic_fit(slide, p_back, back, anchor="bottom", trim=True)
    if p_front:
        _add_pic_fit(slide, p_front, front, anchor="bottom", trim=True)


def _scent_paths(product) -> list:
    """Every scent image for this SKU, in slot order, hero first."""
    candidates = [
        product.packshot_path, product.packshot2_path, product.packshot3_path,
        product.packshot4_path, product.packshot5_path, product.packshot6_path,
    ]
    return [p for p in candidates if p]


# Overlap geometry, generalised straight from `_dual_boxes` so n=2 keeps
# rendering byte-identically to the long-standing two-scent slide: each
# bottle steps right, sits slightly lower and grows slightly, and the one
# drawn after overlaps the one before — depth, not a row.
_SCENT_STEP     = 0.24      # horizontal step between neighbours, × box width
_SCENT_H_BACK   = 0.88      # height scale of the rearmost bottle
_SCENT_H_FRONT  = 1.00      # height scale of the frontmost
_SCENT_W_INSET  = 0.06      # width runs this much narrower than the height scale
_SCENT_LIFT     = 0.06      # how far the rearmost bottle floats above the floor


def _scent_boxes(n: int, box) -> list:
    """Overlapping boxes for `n` scents, centred as one group.

    The bottles are drawn back-to-front: each is nudged right, dropped
    closer to the floor and scaled up a touch, so it stands *in front of*
    its neighbour instead of beside it. The group stays centred on the
    box's centre whatever `n` is, so it sits under the price tables.

    n=2 reproduces `_dual_boxes` exactly — existing two-scent slides are
    untouched.
    """
    l, t, w, h = box
    cx, floor = l + w / 2, t + h
    span = _SCENT_STEP * w * max(1, n - 1)      # half-width of the group
    boxes = []
    for i in range(n):
        f = i / (n - 1) if n > 1 else 1.0       # 0 = rearmost, 1 = frontmost
        hs = _SCENT_H_BACK + (_SCENT_H_FRONT - _SCENT_H_BACK) * f
        bw, bh = w * (hs - _SCENT_W_INSET), h * hs
        x = cx + (2 * f - 1) * span - bw / 2
        y = floor - bh - _SCENT_LIFT * h * (1 - f)
        boxes.append((x, y, bw, bh))
    return boxes


def _add_scent_row(slide, paths, box):
    """Every scent of a SKU on one diapo, overlapping and centred."""
    for path, cell in zip(paths, _scent_boxes(len(paths), box)):
        _add_pic_fit(slide, path, cell, anchor="bottom", trim=True)


# Bottom of the price tables. A packshot whose imported box starts above
# this would be painted OVER the prices.
_TABLE_BOTTOM = TABLE_U_POS[1] + TABLE_U_POS[3]


def _packshot_box(product):
    """Effective packshot rect: the product's own override when it is sane,
    else the layout default.

    PPTX imports can carry a box that starts above the price tables and is
    far larger than the standard zone. Combined with `trim=True` (which
    scales the product up to fill its box once the transparent margin is
    cropped) that paints a giant packshot across the prices. Such a box is
    bad data, so fall back to the default rather than honour it."""
    dl, dt, dw, dh = PACKSHOT_POS
    top = product.packshot_top if product.packshot_top > 0 else dt
    if top < _TABLE_BOTTOM:
        return PACKSHOT_POS
    return (
        product.packshot_left if product.packshot_left > 0 else dl,
        top,
        product.packshot_width if product.packshot_width > 0 else dw,
        product.packshot_height if product.packshot_height > 0 else dh,
    )


def _add_product_slide(prs, deck: Deck, group: Group,
                       product: Product,
                       subgroup: Optional[SubGroup] = None):
    """`subgroup` is optional for callers that still pass the legacy
    signature (preview's `make_single_product_deck` builds a one-off
    Group with the right logo, so it doesn't need a SubGroup). When
    omitted, the logo falls back to Group.logo_path."""
    slide = _blank(prs)
    _add_background(slide, deck)
    _add_banner(slide, deck)
    _add_logo(slide, group, subgroup)
    if deck.nouveau_lancement or getattr(product, "nouveau", False):
        _add_pic(slide, _asset("banner_nouveau.png"), NOUVEAU_POS)

    if product.nom_image_path:
        _add_pic(slide, product.nom_image_path, NAME_POS)
    else:
        _add_text(slide, NAME_POS, product.nom, size=32, bold=True, color=RED)

    _add_pic(slide, _asset("label_prix_unite.png"),  LABEL_U_POS)
    _add_pic(slide, _asset("label_prix_caisse.png"), LABEL_C_POS)

    # Channel drives table headers ("Prix Gros" vs "Prix Détail"), price
    # values (the prix_detail* fields when available), AND the promo
    # wording ("Pour N caisses" vs "Pour N unités"). The product's own
    # `promo_unit` can still override the unit word per-row.
    is_detail = _is_detail(deck.canal)
    _unite_table(slide, product, is_detail)
    _caisse_table(slide, product, is_detail)

    scents = _scent_paths(product)
    if product.is_promo:
        _add_promo(slide, product, is_detail)
    elif len(scents) >= 3:
        # Three scents up: hero + smaller row. Two stays on the tighter
        # overlapping pair, which reads better than a 2-cell row.
        _add_scent_row(slide, scents, PACKSHOT_POS)
    elif product.packshot2_path and product.packshot_path:
        _add_dual_packshots(slide, product.packshot_path,
                            product.packshot2_path, PACKSHOT_POS)
    elif product.packshot_path:
        pos = _packshot_box(product)
        _add_pic_fit(slide, product.packshot_path, pos, trim=True)


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
# Two-scent remise: the pair of bottles is wider than a single bag, so the
# captions move outward into the free side zones — clear of the images.
PROMO_REMISE_DUAL_LEFT_TEXT  = (2.35, 5.20, 2.15, 0.50)
PROMO_REMISE_DUAL_RIGHT_TEXT = (8.85, 5.20, 2.15, 0.50)

# Triple-product layout (remise+gratuite with 2 distinct products on right).
# Each pack is 1.75" (instead of 1.90") to leave a 0.80" gap for the big
# red "+" symbol — visual cue that "buy this + get that free", not "either/or".
PROMO_RG_REMISE_PACK    = (7.95, 4.10, 1.75, 3.30)
PROMO_RG_PLUS           = (9.75, 5.20, 0.70, 1.10)   # big red "+" between packs
PROMO_RG_GRATUITE_PACK  = (10.50, 4.10, 1.75, 3.30)
PROMO_RG_REMISE_LABEL   = (7.95, 3.55, 1.75, 0.50)
PROMO_RG_GRATUITE_LABEL = (10.50, 3.55, 1.75, 0.50)
PROMO_RG_REMISE_BADGE   = (8.27, 4.00, 1.10, 1.10)
PROMO_RG_GRATUITE_BOW   = (10.82, 4.00, 1.10, 1.10)


def _pct(v):
    if v is None:
        return "0"
    if float(v) == int(v):
        return str(int(v))
    return f"{float(v):.1f}".replace(".", ",")


def _promo_texts(product, is_detail: bool = False):
    """Build the (left_caption, right_caption) pair for the promo strip
    on a product slide. Wording follows this priority:
      1. Per-product `promo_unit` override → "Pour 20 sacs", "1 carton Gratuit"…
      2. Channel default — Gros → caisse, Détail → unité.
    """
    override = (product.promo_unit or "")
    unit = lambda n: _unit_word(is_detail, n, override)
    # The FREE side is counted in the channel's unit (unités en Détail,
    # caisses en Gros), never in the buy-side container: "Pour 1 carton"
    # must give "1 unité Gratuite", not "1 carton Gratuit".
    unit_free = lambda n: _unit_word(is_detail, n, "")
    gratuite = lambda n: _gratuite_word(is_detail, n, "")
    n = product.promo_achat_qte or 0
    x = product.promo_gratuit_qte or 0
    p = product.promo_remise_pct or 0
    left = f"Pour {n} {unit(n)}" if n else ""

    # Whenever the quantities are known, ALWAYS generate proper French
    # wording — the raw spreadsheet text ("1cs -> 2u LV 1250") is only a
    # fallback for rows whose fields couldn't be parsed. The offered
    # product itself is conveyed by the gratuite photo.
    # Name the free SKU(s) when known — the photo alone doesn't tell a
    # seller WHICH product is being handed out.
    noms = _gratuite_noms(product)
    suffix = f" : {' + '.join(noms)}" if noms else ""

    if x and p:
        return left, f"{x} {unit_free(x)} {gratuite(x)}{suffix} + -{_pct(p)}%"
    if x:
        return left, f"{x} {unit_free(x)} {gratuite(x)}{suffix}"
    if noms and not p:
        return left, f"{gratuite(1)}{suffix}"
    if p:
        return left, f"-{_pct(p)}% de remise"
    if product.promo_texte:
        # The left caption already says "Pour N <container>" — drop a
        # duplicated "N <container> →" prefix from the raw text so a price
        # remise shows "Pour 1 sac → 15,20 DH" instead of repeating itself.
        txt = _re.sub(
            r"^\s*\d+\s*(?:cs|caisses?|cartons?|sacs?|u\b|unit[eé]s?)\s*(?:->|→|=>)\s*",
            "", product.promo_texte, flags=_re.IGNORECASE,
        ).strip()
        return left, txt or product.promo_texte
    return left, ""


def _promo_text_size(text: str) -> int:
    """Point size for a promo caption. Naming the free SKU makes this text
    far longer than the bare "1 unité Gratuite", so step down rather than
    overflow the 0.50" strip between the price table and the bags. Shared
    with preview.py so the in-app preview matches the PPT."""
    n = len(text or "")
    if n <= 24:
        return 24
    return 18 if n <= 44 else 14


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
    size = _promo_text_size(text)
    for i, w2 in enumerate(words):
        run = p.add_run()
        run.text = w2 + (" " if i < len(words) - 1 else "")
        run.font.size = Pt(size)
        run.font.bold = True
        run.font.color.rgb = RED if i == accent_idx else dark_blue


def _has_two_right_products(product) -> bool:
    """True iff `type_promo` is "remise+gratuite" (either spelling).

    Image overrides aren't required — when one or both are missing, the
    triple renderer falls back to the packshot for that side. This means
    picking "remise+gratuite" from the dropdown always produces the
    triple layout, even if the user hasn't uploaded a separate gratuite
    image yet."""
    t = (product.type_promo or "").strip().lower()
    return t in ("remise+gratuite", "gratuite+remise")


def _resolve_right_image_pptx(product):
    t = (product.type_promo or "").strip().lower()
    if "gratuite" in t and product.promo_gratuite_image:
        return product.promo_gratuite_image
    if "remise" in t and product.promo_remise_image:
        return product.promo_remise_image
    return product.packshot_path


def _gratuite_images(product) -> list:
    """All non-empty gratuite item images, in slot order. Used for the
    multi-item layout (1 promo can hand out multiple free SKUs)."""
    candidates = [
        product.promo_gratuite_image,
        product.promo_gratuite_image_2,
        product.promo_gratuite_image_3,
        product.promo_gratuite_image_4,
    ]
    return [img for img in candidates if img]


def _gratuite_noms(product) -> list:
    """Names of the free SKUs, slot order, blanks dropped. Paired with the
    slot's image by position, so a named slot with no image still gets
    announced in the caption."""
    candidates = [
        getattr(product, "promo_gratuite_nom", ""),
        getattr(product, "promo_gratuite_nom_2", ""),
        getattr(product, "promo_gratuite_nom_3", ""),
        getattr(product, "promo_gratuite_nom_4", ""),
    ]
    return [str(n).strip() for n in candidates if str(n or "").strip()]


def _gratuite_layout(n: int) -> tuple:
    """Return `(cells, plus_zones)` for N gratuite items on the right side
    of a two-bag promo slide.

    Each `cell` is an `(x, y, w, h)` rect (inches) the renderer hands to
    `_add_pic_fit(..., anchor="bottom")` so every item shares the same
    floor as the bought packshot. Each `plus_zone` is a rect for a red
    "+" symbol drawn between cells — like the remise+gratuite layout.

    Choices behind the numbers:
      n=1 → identity: the legacy single-image PROMO_RIGHT_PACK
      n=2 → two BIGGER cells (1.50 × 2.80) centered around x=9.65 with
            a red "+" between them. Wider zone than a 50/50 subdivision
            of PROMO_RIGHT_PACK gives, so each item actually reads.
      n=3 → row of three centered around the right zone, no plus signs
            (2 plus signs feel busy)
      n=4 → 2×2 grid roughly centered in the right zone
      ≥5 → single row, equal widths (defensive — the UI only exposes
            four slots).
    """
    if n <= 1:
        return [PROMO_RIGHT_PACK], []
    if n == 2:
        return [
            # Wider zone than PROMO_RIGHT_PACK alone — extends slightly
            # left of x=8.10 so each cell is 1.50 wide instead of 1.40.
            # Items shorter (2.80 not 3.30) so square packshots fill
            # the cell instead of sitting in a tall empty column.
            (7.85, 4.40, 1.50, 2.80),
            (9.90, 4.40, 1.50, 2.80),
        ], [
            # Red "+" centered horizontally between the two cells,
            # vertically aligned with the middle of the items.
            (9.40, 5.30, 0.50, 1.00),
        ]
    if n == 3:
        return [
            (7.55, 4.70, 1.30, 2.50),
            (9.05, 4.70, 1.30, 2.50),
            (10.55, 4.70, 1.30, 2.50),
        ], []
    if n == 4:
        return [
            (7.95, 4.40, 1.40, 1.35),
            (9.55, 4.40, 1.40, 1.35),
            (7.95, 5.95, 1.40, 1.35),
            (9.55, 5.95, 1.40, 1.35),
        ], []
    # Fallback for 5+ — single row equal widths inside the base zone.
    bx, by, bw, bh = PROMO_RIGHT_PACK
    w = bw / n
    return [(bx + i * w, by, w, bh) for i in range(n)], []


def _gratuite_subzones(base_zone, n: int) -> list:
    """Legacy helper kept for any external caller. Cells only — no plus
    signs. Prefer `_gratuite_layout(n)` which returns both."""
    cells, _ = _gratuite_layout(n)
    return cells


def _lift_cell(cell, lift: float):
    """Raise a bottom-anchored cell by `lift` inches (0 = unchanged)."""
    if not lift:
        return cell
    x, y, w, h = cell
    return (x, y - lift, w, h)


def _add_promo(slide, product, is_detail: bool = False):
    """Branch on `type_promo` + per-role product images:
      - "remise"            → single-bag layout
      - "remise+gratuite" with 2 distinct images → triple-product layout
      - else                → standard two-bag layout
    """
    t = (product.type_promo or "").strip().lower()
    if t == "remise":
        _add_promo_remise(slide, product, is_detail)
    elif _has_two_right_products(product):
        _add_promo_triple(slide, product, is_detail)
    else:
        _add_promo_two_bags(slide, product, is_detail)


def _add_promo_remise(slide, product, is_detail: bool = False):
    """Single centered bag + REMISE badge + 2 side captions, no arrow."""
    bag = product.promo_remise_image or product.packshot_path
    if product.packshot2_path and bag:
        _add_dual_packshots(slide, bag, product.packshot2_path, PROMO_REMISE_PACK)
    elif bag:
        _add_pic_fit(slide, bag, PROMO_REMISE_PACK, anchor="bottom", trim=True)

    badge = product.promo_ribbon_image
    if not badge:
        default_remise = ASSETS / "default_remise.png"
        if default_remise.exists():
            badge = str(default_remise)
    if badge:
        _add_pic_fit(slide, badge, PROMO_REMISE_BADGE)

    dual = bool(product.packshot2_path)
    left_pos = PROMO_REMISE_DUAL_LEFT_TEXT if dual else PROMO_REMISE_LEFT_TEXT
    right_pos = PROMO_REMISE_DUAL_RIGHT_TEXT if dual else PROMO_REMISE_RIGHT_TEXT
    left_txt, right_txt = _promo_texts(product, is_detail)
    if left_txt:
        _add_promo_text(slide, left_pos, left_txt, accent_idx=1)
    if right_txt:
        _add_promo_text(slide, right_pos, right_txt, accent_idx=0)


def _add_promo_triple(slide, product, is_detail: bool = False):
    """Triple-product layout for remise+gratuite. Left = bought product,
    right column = remise pack + big red "+" + gratuite pack.

    Decorations (REMISE badge on the remise pack, bow on the gratuite pack)
    are opt-in via `promo_ribbon_left` / `promo_ribbon_right` — same flags
    the two-bag layout uses, so the SlideEditor toggles work identically
    here."""
    # Left: bought product
    if product.packshot_path:
        _add_pic_fit(slide, product.packshot_path, PROMO_LEFT_PACK,
                     anchor="bottom", trim=True)

    # Right column: remise product on the left, gratuite on the right. Each
    # falls back to the packshot when the user hasn't picked a role-specific
    # image — keeps the triple layout consistent with what the dropdown says.
    # All three products bottom-anchored → shared baseline (see _add_pic_fit).
    remise_img   = product.promo_remise_image   or product.packshot_path
    gratuite_img = product.promo_gratuite_image or product.packshot_path
    if remise_img:
        _add_pic_fit(slide, remise_img,   PROMO_RG_REMISE_PACK,   anchor="bottom", trim=True)
    if gratuite_img:
        _add_pic_fit(slide, gratuite_img, PROMO_RG_GRATUITE_PACK, anchor="bottom", trim=True)

    # Optional decorations — opt-in. `promo_ribbon_image` overrides the bow.
    if product.promo_ribbon_left:
        remise_badge = ASSETS / "default_remise.png"
        if remise_badge.exists():
            _add_pic_fit(slide, str(remise_badge), PROMO_RG_REMISE_BADGE)
    if product.promo_ribbon_right:
        bow_path = product.promo_ribbon_image
        if not bow_path:
            default_ribbon = ASSETS / "default_ribbon.png"
            if default_ribbon.exists():
                bow_path = str(default_ribbon)
        if bow_path:
            _add_pic_fit(slide, bow_path, PROMO_RG_GRATUITE_BOW)

    # Big red arrow
    _add_text(slide, PROMO_ARROW, "→",
              size=140, bold=True, color=RED)

    # Big red "+" between the remise pack and the gratuite pack — visual
    # cue that the buyer gets BOTH (discounted product AND free product),
    # not "pick one or the other".
    _add_text(slide, PROMO_RG_PLUS, "+",
              size=72, bold=True, color=RED)

    # Captions
    pct = product.promo_remise_pct or 0
    qty = product.promo_gratuit_qte or 0
    n_achat = product.promo_achat_qte
    override = product.promo_unit or ""
    left_txt = (f"Pour {n_achat} {_unit_word(is_detail, n_achat, override)}"
                if n_achat else "")
    remise_lbl = f"REMISE -{_pct(pct)}%"
    # Use the same gratuite-word logic but uppercased to fit the existing
    # all-caps label style ("3 GRATUITES" / "3 GRATUITS" / "1 GRATUITE").
    gratuite_lbl = f"{qty} {_gratuite_word(is_detail, qty, override).upper()}"

    if left_txt:
        _add_promo_text(slide, PROMO_LEFT_TEXT, left_txt, accent_idx=1)
    _add_promo_text(slide, PROMO_RG_REMISE_LABEL, remise_lbl, accent_idx=1)
    _add_promo_text(slide, PROMO_RG_GRATUITE_LABEL, gratuite_lbl, accent_idx=1)


def _add_promo_two_bags(slide, product, is_detail: bool = False):
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
            anchor="bottom", trim=True,
        )
    if product.promo_ribbon_left and ribbon_img:
        _add_pic_fit(slide, ribbon_img, PROMO_LEFT_RIBBON)

    # ── RIGHT side ──
    # For type_promo="gratuite" the user can list up to 4 distinct free
    # SKUs (`promo_gratuite_image` + `_2/_3/_4`). When there are 2+ we
    # subdivide PROMO_RIGHT_PACK into one cell per item, each anchored
    # bottom-of-cell. 1-item promos render the same as before.
    t = (product.type_promo or "").strip().lower()
    gratuite_imgs = _gratuite_images(product) if "gratuite" in t else []

    base_pack = (
        PROMO_RIGHT_PACK_INBOX if product.promo_carton_right else PROMO_RIGHT_PACK
    )
    if product.promo_carton_right and carton_img:
        _add_pic_fit(slide, carton_img, PROMO_RIGHT_CARTON)

    if len(gratuite_imgs) >= 2:
        # Multi-gratuite: dedicated layout — bigger centered cells with
        # a red "+" between them when n=2 (matches the triple-product
        # remise+gratuite style). carton-right inset is ignored here
        # because the cells already account for proper sizing.
        cells, plus_zones = _gratuite_layout(len(gratuite_imgs))
        for img, cell in zip(gratuite_imgs, cells):
            _add_pic_fit(slide, img, _lift_cell(cell, product.promo_gratuite_lift),
                         anchor="bottom", trim=True)
        for plus_pos in plus_zones:
            # Same red "+" treatment as the triple layout (PROMO_RG_PLUS)
            _add_text(slide, plus_pos, "+",
                      size=72, bold=True, color=RED)
    else:
        # Single-item (or no gratuite override) — original layout
        right_image = _resolve_right_image_pptx(product)
        if right_image:
            _add_pic_fit(slide, right_image,
                         _lift_cell(base_pack, product.promo_gratuite_lift),
                         anchor="bottom", trim=True)

    if product.promo_ribbon_right and ribbon_img:
        _add_pic_fit(slide, ribbon_img, PROMO_RIGHT_RIBBON)

    # Red arrow in the middle
    # Rule 4: bigger arrow
    _add_text(slide, PROMO_ARROW, "→",
              size=140, bold=True, color=RED)

    # Captions BESIDE the bags, left-aligned.
    left_txt, right_txt = _promo_texts(product, is_detail)
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
               with_subgroup_dividers: bool = True,
               progress_callback=None) -> bytes:
    """Generate the deck. `progress_callback(current, total, phase)` is
    invoked after each slide is added (and once at the very end when the
    XML is serialised + zip-compressed). `total` is the planned slide
    count; `current` is 1-based; `phase` is a short French status string.

    Errors raised inside the callback are swallowed (logged) — progress
    reporting must never break generation.
    """
    use_template = _is_mio_detail(deck) and MIO_DETAIL_TEMPLATE.exists()

    # Compute planned slide count up front for the % calculation. Cover
    # counts as 1 (unless the MIO template skips it); each subgroup divider
    # is 1; each product is 1.
    total = 0 if use_template else 1
    for group in deck.groupes:
        for subgroup in group.sous_groupes:
            if with_subgroup_dividers:
                total += 1
            total += len(subgroup.produits)

    def _report(current, phase):
        if progress_callback is None:
            return
        try:
            progress_callback(current, total, phase)
        except Exception:        # noqa: BLE001 — progress is best-effort
            pass

    if use_template:
        # Inherit the two static intro pages (cadre + secondary) from the
        # template; skip the generated cover.
        prs = Presentation(str(MIO_DETAIL_TEMPLATE))
        current = 0
    else:
        prs = Presentation()
        prs.slide_width = Inches(SLIDE_W)
        prs.slide_height = Inches(SLIDE_H)
        # "Nouveau lancement" decks are product-slides only — no title cover.
        if deck.nouveau_lancement:
            current = 0
        else:
            _add_cover(prs, deck)
            current = 1
            _report(current, "Page de couverture")

    for group in deck.groupes:
        for subgroup in group.sous_groupes:
            if with_subgroup_dividers and not deck.nouveau_lancement:
                _add_subgroup_divider(prs, deck, group, subgroup)
                current += 1
                _report(current, f"Séparateur · {group.nom} / {subgroup.nom}")
            for product in subgroup.produits:
                _add_product_slide(prs, deck, group, product, subgroup=subgroup)
                current += 1
                _report(current, f"Slide produit · {product.nom or '(sans nom)'}")

    # The XML serialisation + zip compression is the biggest non-image
    # chunk of work. Surface it as a final "Compression" phase so the UI
    # doesn't sit at 100% wondering why it hasn't returned yet.
    _report(total, "Compression du fichier .pptx…")
    buf = BytesIO()
    prs.save(buf)
    data = buf.getvalue()
    if output_path:
        Path(output_path).write_bytes(data)
    return data
