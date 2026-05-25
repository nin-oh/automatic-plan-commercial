"""Deck-level state: title/canal/mois + banner/background/cover overrides."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..session import IMAGE_DIR, Session, save_session, with_session
import image_assets  # noqa: E402  — added to sys.path by deps

router = APIRouter(prefix="/api/state", tags=["state"])


class StateOut(BaseModel):
    titre: str
    canal: str
    mois: str
    banner: Optional[str]
    background: Optional[str]
    cover_photo: Optional[str]
    n_products: int


class MetaIn(BaseModel):
    titre: Optional[str] = None
    canal: Optional[str] = None
    mois: Optional[str] = None


def _state_out(s: Session) -> StateOut:
    return StateOut(
        titre=s.titre, canal=s.canal, mois=s.mois,
        banner=s.banner, background=s.background, cover_photo=s.cover_photo,
        n_products=len(s.products),
    )


@router.get("", response_model=StateOut)
def read_state(s: Session = Depends(with_session)):
    return _state_out(s)


@router.put("/meta", response_model=StateOut)
def update_meta(payload: MetaIn, s: Session = Depends(with_session)):
    if payload.titre is not None:
        s.titre = payload.titre
    if payload.canal is not None:
        s.canal = payload.canal
    if payload.mois is not None:
        s.mois = payload.mois
    return _state_out(s)


_KIND_TO_FIELD = {
    "banner": "banner",
    "background": "background",
    "cover": "cover_photo",
}


@router.post("/global-image/{kind}", response_model=StateOut)
async def upload_global_image(
    kind: str,
    file: UploadFile = File(...),
    s: Session = Depends(with_session),
):
    field = _KIND_TO_FIELD.get(kind)
    if not field:
        raise HTTPException(400, f"unknown kind '{kind}' (banner|background|cover)")
    data = await file.read()
    image_assets.register_upload(IMAGE_DIR, file.filename, data, type_="other")
    setattr(s, field, file.filename)
    return _state_out(s)


@router.delete("/global-image/{kind}", response_model=StateOut)
def clear_global_image(kind: str, s: Session = Depends(with_session)):
    field = _KIND_TO_FIELD.get(kind)
    if not field:
        raise HTTPException(400, f"unknown kind '{kind}'")
    setattr(s, field, None)
    return _state_out(s)
