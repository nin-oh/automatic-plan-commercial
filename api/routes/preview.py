"""Slide preview rendering + click-to-place packshot."""
from __future__ import annotations

from io import BytesIO
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..session import Session, with_session
from ..deps import build_deck, get_promo_count, make_single_product_deck
from plan_commercial import render_cover, render_product
from plan_commercial import generator as G

router = APIRouter(prefix="/api/preview", tags=["preview"])

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


@router.get("/cover")
def preview_cover(s: Session = Depends(with_session)):
    deck = build_deck(s)
    png = render_cover(deck)
    return StreamingResponse(BytesIO(png), media_type="image/png")


@router.get("/product/{idx}")
def preview_product(
    idx: int,
    promo: int = 0,
    s: Session = Depends(with_session),
):
    """Render slide for row `idx`. `promo` selects which `//`-separated
    offer to render when the row carries multiple promos (default: 0)."""
    try:
        deck, group, product = make_single_product_deck(s, idx, promo=promo)
    except IndexError:
        raise HTTPException(404, "row not found")
    png = render_product(deck, group, product)
    return StreamingResponse(BytesIO(png), media_type="image/png")


class PromoCountOut(BaseModel):
    count: int


@router.get("/product/{idx}/promo-count", response_model=PromoCountOut)
def get_product_promo_count(idx: int, s: Session = Depends(with_session)):
    """How many slides this row produces (>1 when promo_texte has `//`)."""
    try:
        return PromoCountOut(count=get_promo_count(s, idx))
    except IndexError:
        raise HTTPException(404, "row not found")


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
