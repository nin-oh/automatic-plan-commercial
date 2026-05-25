"""Image library — upload, list (filtered), edit metadata, delete, raw bytes."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from ..session import IMAGE_DIR, Session, with_session
import image_assets

router = APIRouter(prefix="/api/images", tags=["images"])


class ImageMeta(BaseModel):
    filename: str
    brand: str
    type: str
    added: str
    size: int
    used_in: int


def _meta_to_out(m, products) -> ImageMeta:
    used = sum(
        1 for row in products
        for col in ("packshot", "nom_image", "logo_groupe")
        if str(row.get(col) or "") == m.filename
    )
    return ImageMeta(
        filename=m.filename, brand=m.brand, type=m.type,
        added=m.added, size=m.size, used_in=used,
    )


@router.get("", response_model=List[ImageMeta])
def list_images(
    brand: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    s: Session = Depends(with_session),
):
    items = image_assets.list_assets(
        IMAGE_DIR, brand=brand or None, type_=type or None, search=search or None,
    )
    return [_meta_to_out(m, s.products) for m in items]


@router.post("", response_model=List[ImageMeta])
async def upload_images(
    files: List[UploadFile] = File(...),
    brand: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    s: Session = Depends(with_session),
):
    saved = []
    for f in files:
        data = await f.read()
        meta = image_assets.register_upload(
            IMAGE_DIR, f.filename, data,
            brand=brand or None, type_=type or None,
        )
        saved.append(_meta_to_out(meta, s.products))
    return saved


class ImagePatch(BaseModel):
    brand: Optional[str] = None
    type: Optional[str] = None


@router.patch("/{filename:path}", response_model=ImageMeta)
def patch_image(
    filename: str,
    payload: ImagePatch,
    s: Session = Depends(with_session),
):
    all_meta = image_assets.load_metadata(IMAGE_DIR)
    if filename not in all_meta:
        raise HTTPException(404, "image not found")
    entry = all_meta[filename]
    if payload.brand is not None:
        entry.brand = payload.brand.upper().strip()
    if payload.type is not None:
        if payload.type not in {"packshot", "logo", "badge", "other"}:
            raise HTTPException(400, "invalid type")
        entry.type = payload.type
    image_assets.save_metadata(IMAGE_DIR, all_meta)
    return _meta_to_out(entry, s.products)


@router.delete("/{filename:path}")
def delete_image(filename: str, s: Session = Depends(with_session)):
    image_assets.delete_asset(IMAGE_DIR, filename)
    # Best-effort: also clear references in products that pointed at this file.
    for row in s.products:
        for col in ("packshot", "nom_image", "logo_groupe"):
            if str(row.get(col) or "") == filename:
                row[col] = ""
    return {"ok": True}


@router.get("/raw/{filename:path}")
def get_raw_image(filename: str):
    p = IMAGE_DIR / filename
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(str(p))


@router.get("/by-name/{name:path}")
def get_image_by_name(name: str):
    """Resolve a possibly-bare filename to its actual location and stream it.

    Lets the frontend reference images by their basename (``foo.png``) even
    after they've been moved into a subfolder (``MIO/foo.png``) — exactly
    matching the resolver used by the slide renderer."""
    rel = image_assets.find_relative_path(IMAGE_DIR, name)
    if not rel:
        raise HTTPException(404)
    return FileResponse(str(IMAGE_DIR / rel))
