"""Slide preview rendering + click-to-place packshot."""
from __future__ import annotations

import hashlib
import json
import os
import threading
from collections import OrderedDict
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel

from pathlib import Path

from ..session import IMAGE_DIR, Session, with_session
from ..deps import build_deck, get_promo_count, make_single_product_deck, resolve_image
from plan_commercial import render_cover, render_product
from plan_commercial import generator as G
from plan_commercial.promo_split import expand_multi_promos

router = APIRouter(prefix="/api/preview", tags=["preview"])


# ─── Render cache ───────────────────────────────────────────────────────────
# Rendering one slide with PIL costs ~200-500ms; the editor + rail + planche
# contact all hit these endpoints constantly. Cache the PNG bytes keyed by a
# hash of everything that affects the pixels: the row's fields, deck meta,
# the promo sub-index, the requested width, AND the mtimes of every image
# file involved (so re-uploading a packshot under the same name invalidates).
# LRU with a hard cap so memory stays bounded (~160 renders ≈ tens of MB).

_CACHE_MAX = 160
_render_cache: "OrderedDict[str, bytes]" = OrderedDict()
_cache_lock = threading.Lock()

_ROW_IMAGE_FIELDS = (
    "packshot", "nom_image", "logo_groupe",
    "promo_carton_image", "promo_ribbon_image",
    "promo_remise_image", "promo_gratuite_image",
    "promo_gratuite_image_2", "promo_gratuite_image_3", "promo_gratuite_image_4",
)


def _mtime(path: Optional[str]) -> float:
    try:
        return os.path.getmtime(path) if path else 0.0
    except OSError:
        return 0.0


def _cache_key(parts: list) -> str:
    payload = json.dumps(parts, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha1(payload.encode("utf-8")).hexdigest()


def _cache_get(key: str) -> Optional[bytes]:
    with _cache_lock:
        png = _render_cache.get(key)
        if png is not None:
            _render_cache.move_to_end(key)
        return png


def _cache_put(key: str, png: bytes) -> None:
    with _cache_lock:
        _render_cache[key] = png
        _render_cache.move_to_end(key)
        while len(_render_cache) > _CACHE_MAX:
            _render_cache.popitem(last=False)


def _deck_meta_parts(s: Session) -> list:
    return [
        s.titre, s.canal, s.mois, s.banner, s.background, s.cover_photo,
        _mtime(resolve_image(s.banner)),
        _mtime(resolve_image(s.background)),
        _mtime(resolve_image(s.cover_photo)),
    ]


def _downscale(png: bytes, w: int) -> bytes:
    """Resize the rendered PNG to `w` px wide (only ever downscale)."""
    try:
        from PIL import Image
        im = Image.open(BytesIO(png))
        if im.width <= w:
            return png
        ratio = w / im.width
        im = im.resize((w, max(1, int(im.height * ratio))), Image.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        return png

# Slide dimensions in inches (mirror plan_commercial.generator.SLIDE_W/H)
SLIDE_W = 13.333
SLIDE_H = 7.5


class RectOut(BaseModel):
    """Packshot rectangle in inches, with the slide dimensions so the
    frontend can map to its preview image's pixel coords."""
    left: float
    top: float
    width: float
    height: float
    slide_width: float = SLIDE_W
    slide_height: float = SLIDE_H


@router.get("/product/{idx}/rect", response_model=RectOut)
def get_packshot_rect(idx: int, s: Session = Depends(with_session)):
    """Effective packshot rectangle — overrides if set, else the layout default
    from generator.PACKSHOT_POS. Lets the frontend draw a draggable handle
    over the preview without hardcoding defaults."""
    if idx < 0 or idx >= len(s.products):
        raise HTTPException(404, "row not found")
    row = s.products[idx]
    dl, dt, dw, dh = G.PACKSHOT_POS
    return RectOut(
        left=float(row.get("packshot_left") or 0) or dl,
        top=float(row.get("packshot_top") or 0) or dt,
        width=float(row.get("packshot_width") or 0) or dw,
        height=float(row.get("packshot_height") or 0) or dh,
    )


@router.get("/banner")
def preview_banner(canal: str = "", s: Session = Depends(with_session)):
    """The built-in channel ribbon the deck will use (Gros / Détail). The
    banner is fully automatic — this endpoint only exists so the Deck page
    can show which ribbon is active. `canal` overrides the stored session
    value so the preview follows the dropdown instantly (no save race)."""
    from fastapi.responses import FileResponse
    return FileResponse(G._default_banner(canal or s.canal), media_type="image/png")


@router.get("/cover")
def preview_cover(w: int = 0, s: Session = Depends(with_session)):
    key = _cache_key(["cover", _deck_meta_parts(s), w])
    png = _cache_get(key)
    if png is None:
        deck = build_deck(s)
        png = render_cover(deck)
        if w > 0:
            png = _downscale(png, w)
        _cache_put(key, png)
    return Response(content=png, media_type="image/png")


@router.get("/product/{idx}")
def preview_product(
    idx: int,
    promo: int = 0,
    w: int = 0,
    s: Session = Depends(with_session),
):
    """Render slide for row `idx`. `promo` selects which `//`-separated
    offer to render when the row carries multiple promos (default: 0).
    `w` (optional) downscales the PNG to that width — used for thumbnails
    in the product rail and the planche contact grid."""
    if idx < 0 or idx >= len(s.products):
        raise HTTPException(404, "row not found")
    row = s.products[idx]
    key = _cache_key([
        "product", row, promo, w, _deck_meta_parts(s),
        [_mtime(resolve_image(row.get(f))) for f in _ROW_IMAGE_FIELDS],
    ])
    png = _cache_get(key)
    if png is None:
        try:
            deck, group, product = make_single_product_deck(s, idx, promo=promo)
        except IndexError:
            raise HTTPException(404, "row not found")
        png = render_product(deck, group, product)
        if w > 0:
            png = _downscale(png, w)
        _cache_put(key, png)
    return Response(content=png, media_type="image/png")


class PromoCountOut(BaseModel):
    count: int


@router.get("/product/{idx}/promo-count", response_model=PromoCountOut)
def get_product_promo_count(idx: int, s: Session = Depends(with_session)):
    """How many slides this row produces (>1 when promo_texte has `//`)."""
    try:
        return PromoCountOut(count=get_promo_count(s, idx))
    except IndexError:
        raise HTTPException(404, "row not found")


class CatalogueSlide(BaseModel):
    """One renderable page in the catalogue flipbook. Rich enough for the
    frontend to render the product page directly in HTML/CSS instead of
    embedding the pre-rendered PNG — that lets us stagger-animate each
    element (name, packshot, price, badges) as the page becomes active."""
    # Fallback: pre-rendered PNG URL — kept for promo pages whose composite
    # layout (two bags, carton, ribbon, "+" symbol, etc.) is hard to faithfully
    # rebuild in HTML/CSS. Regular pages ignore this.
    url: str
    label: str                # short label (used in ToC + page footer)
    group: str                # parent groupe (channel / brand axis)
    subgroup: str             # parent sous-groupe (brand)
    row_idx: int              # source product row index (for click-through)
    promo_idx: int = 0        # which `//`-split offer this page is

    # ── Rich product data (so the page can render with CSS, not as an
    # opaque PNG) ───────────────────────────────────────────────────────
    nom: str = ""
    is_promo: bool = False
    type_promo: str = ""               # gratuite / remise / remise+gratuite
    promo_texte: str = ""              # raw offer text
    promo_achat_qte: int = 0
    promo_gratuit_qte: int = 0
    promo_remise_pct: float = 0.0
    prix_gros: float = 0.0
    prix_gros_net: float = 0.0
    colisage: str = ""
    colisage_prix_gros: float = 0.0
    colisage_prix_gros_net: float = 0.0
    packshot_file_url: Optional[str] = None    # /files/... served by FastAPI
    logo_file_url: Optional[str] = None
    # The "free" product image for type_promo="gratuite" (often a smaller
    # SKU than the bought one) and an optional artwork for "remise". Both
    # default to None — the frontend falls back to packshot_file_url or to
    # a CSS-only badge (for remise) when these aren't set.
    promo_gratuite_image_url: Optional[str] = None
    promo_remise_image_url: Optional[str] = None


class CatalogueManifest(BaseModel):
    """The ordered list of pages the flipbook UI cycles through."""
    cover_url: str
    slides: list[CatalogueSlide]
    title: str
    canal: str
    mois: str
    total_pages: int          # cover + slides


def _file_url(abs_path: Optional[str]) -> Optional[str]:
    """Map an absolute image path under IMAGE_DIR to a `/files/...` URL
    that the FastAPI static mount serves. Returns None for missing files
    (resolver already logged the miss)."""
    if not abs_path:
        return None
    try:
        rel = Path(abs_path).resolve().relative_to(Path(IMAGE_DIR).resolve())
    except ValueError:
        # Path lies outside IMAGE_DIR (assets/ shipped with the app, etc.)
        # — those aren't served via /files. Skip them; the page renders
        # without that image rather than 404.
        return None
    return f"/files/{rel.as_posix()}"


@router.get("/manifest", response_model=CatalogueManifest)
def get_catalogue_manifest(s: Session = Depends(with_session)):
    """Manifest for the in-app flipbook: cover URL + the ordered list of
    every product page with enough data to render in HTML/CSS. Pages keep
    their pre-rendered PNG URL as a fallback the UI can use for promo
    layouts whose composite (two bags + carton + ribbon + "+" symbol) is
    too complex to fully re-render with CSS."""
    slides: list[CatalogueSlide] = []
    # Mirror build_pptx ordering: outer = product row order, inner = each `//` offer.
    for idx, row in enumerate(s.products):
        sub_rows = list(expand_multi_promos(row)) or [row]
        gname = (row.get("groupe") or "").strip() or "Sans groupe"
        sgname = (row.get("sous_groupe") or "").strip() or "Sans sous-groupe"
        for pi, sub_row in enumerate(sub_rows):
            nom = (sub_row.get("nom") or row.get("nom") or "").strip() or f"Produit #{idx}"
            label = nom if len(sub_rows) == 1 else f"{nom} (offre {pi + 1})"
            slides.append(CatalogueSlide(
                url=f"/api/preview/product/{idx}?promo={pi}",
                label=label, group=gname, subgroup=sgname,
                row_idx=idx, promo_idx=pi,
                nom=nom,
                is_promo=bool(sub_row.get("is_promo") or False),
                type_promo=str(sub_row.get("type_promo") or ""),
                promo_texte=str(sub_row.get("promo_texte") or ""),
                promo_achat_qte=int(sub_row.get("promo_achat_qte") or 0),
                promo_gratuit_qte=int(sub_row.get("promo_gratuit_qte") or 0),
                promo_remise_pct=float(sub_row.get("promo_remise_pct") or 0),
                prix_gros=float(sub_row.get("prix_gros") or 0),
                prix_gros_net=float(sub_row.get("prix_gros_net") or 0),
                colisage=str(sub_row.get("colisage") or "").strip(),
                colisage_prix_gros=float(sub_row.get("colisage_prix_gros") or 0),
                colisage_prix_gros_net=float(sub_row.get("colisage_prix_gros_net") or 0),
                packshot_file_url=_file_url(resolve_image(sub_row.get("packshot"))),
                logo_file_url=_file_url(resolve_image(sub_row.get("logo_groupe"))),
                promo_gratuite_image_url=_file_url(
                    resolve_image(sub_row.get("promo_gratuite_image"))
                ),
                promo_remise_image_url=_file_url(
                    resolve_image(sub_row.get("promo_remise_image"))
                ),
            ))
    return CatalogueManifest(
        cover_url="/api/preview/cover",
        slides=slides,
        title=(s.titre or "Plan Commercial").strip() or "Plan Commercial",
        canal=(s.canal or "Canal Gros").strip() or "Canal Gros",
        mois=(s.mois or "").strip(),
        total_pages=1 + len(slides),
    )


@router.get("/product/{idx}/debug")
def debug_resolved_product(
    idx: int,
    promo: int = 0,
    s: Session = Depends(with_session),
):
    """Returns the resolved Product fields exactly as the renderer sees them.

    Useful when the preview looks wrong: lets you check, per index, which
    image paths the resolver picked (or `null` when an image was set but
    couldn't be found on disk). The same call path as `/product/{idx}`,
    just without rendering.

    Also reports which side of the promo each image will land on (`right_image`
    is what the two-bag renderer's `_resolve_right_image` returns), and
    whether the file the raw row points at exists at all on disk. Lets us
    distinguish three failure modes:
      * the frontend never saved the change         (raw_row.* is empty)
      * the file isn't there                        (raw_row.* set, *_path null)
      * the renderer ignored the image              (paths set, but render
                                                     still shows packshot)
    """
    from pathlib import Path
    from ..deps import resolve_image
    from ..session import IMAGE_DIR
    try:
        deck, group, product = make_single_product_deck(s, idx, promo=promo)
    except IndexError:
        raise HTTPException(404, "row not found")
    raw = s.products[idx]
    # Verify each image field independently — direct exact-path check + the
    # full resolver (which also does basename + case-insensitive fallback).
    def _diag(name):
        v = (raw.get(name) or "").strip()
        if not v:
            return {"raw": "", "exists_exact": None, "resolved": None}
        return {
            "raw": v,
            "exists_exact": (IMAGE_DIR / v).is_file(),
            "resolved": resolve_image(v),
        }
    return {
        "idx": idx,
        "promo_subindex": promo,
        "nom": product.nom,
        "type_promo": product.type_promo,
        "is_promo": product.is_promo,
        # What the renderer's Product object holds (post-resolve).
        "product": {
            "packshot_path": product.packshot_path,
            "promo_remise_image": product.promo_remise_image,
            "promo_gratuite_image": product.promo_gratuite_image,
            "promo_carton_image": product.promo_carton_image,
            "promo_ribbon_image": product.promo_ribbon_image,
        },
        # Per-field diagnostics — `raw` is the session value, `exists_exact`
        # is whether the file exists at the exact path, `resolved` is what
        # the resolver returns (None = renderer falls back to packshot).
        "diagnostics": {
            "packshot":             _diag("packshot"),
            "promo_remise_image":   _diag("promo_remise_image"),
            "promo_gratuite_image": _diag("promo_gratuite_image"),
            "promo_carton_image":   _diag("promo_carton_image"),
            "promo_ribbon_image":   _diag("promo_ribbon_image"),
        },
        # Raw session fields too — for completeness.
        "raw_row": raw,
    }


class PlaceIn(BaseModel):
    x_norm: float    # 0..1, click position in the rendered PNG
    y_norm: float


class PlaceOut(BaseModel):
    packshot_left: float
    packshot_top: float
    packshot_width: float
    packshot_height: float


@router.post("/product/{idx}/place", response_model=PlaceOut)
def place_packshot(idx: int, payload: PlaceIn, s: Session = Depends(with_session)):
    """Mirror of the streamlit_image_coordinates math in app.py:480-503.

    The PPTX canvas is 13.333" × 7.5". The user clicks at normalized
    (x_norm, y_norm) in the preview; we move the packshot so its center sits
    on that click, clamped to stay inside the canvas.
    """
    if idx < 0 or idx >= len(s.products):
        raise HTTPException(404, "row not found")
    row = s.products[idx]
    cx_in = max(0.0, min(1.0, payload.x_norm)) * SLIDE_W
    cy_in = max(0.0, min(1.0, payload.y_norm)) * SLIDE_H

    dl, dt, dw, dh = G.PACKSHOT_POS
    w_in = float(row.get("packshot_width") or 0) or dw
    h_in = float(row.get("packshot_height") or 0) or dh
    new_left = max(0.0, min(SLIDE_W - w_in, cx_in - w_in / 2))
    new_top = max(0.0, min(SLIDE_H - h_in, cy_in - h_in / 2))

    row["packshot_left"] = round(new_left, 2)
    row["packshot_top"] = round(new_top, 2)
    row["packshot_width"] = round(w_in, 2)
    row["packshot_height"] = round(h_in, 2)
    return PlaceOut(
        packshot_left=row["packshot_left"], packshot_top=row["packshot_top"],
        packshot_width=row["packshot_width"], packshot_height=row["packshot_height"],
    )
