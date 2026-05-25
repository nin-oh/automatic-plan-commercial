"""Products CRUD + Excel import/export/template."""
from __future__ import annotations

import tempfile
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

import openpyxl
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from ..session import (
    IMAGE_DIR, PRODUCT_FIELDS, Session, blank_product, normalize_product,
    with_session,
)
from plan_commercial import read_excel, write_template  # noqa: E402
import excel_reader as byfpc_reader  # noqa: E402
import image_assets  # noqa: E402

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductPatch(BaseModel):
    """Partial update — any subset of PRODUCT_FIELDS."""
    model_config = {"extra": "allow"}


class ProductsOut(BaseModel):
    items: List[Dict[str, Any]]
    total: int


@router.get("", response_model=ProductsOut)
def list_products(s: Session = Depends(with_session)):
    return ProductsOut(items=s.products, total=len(s.products))


# ---- Lookup by name (single-item fetch) ------------------------------------

def _find_product(s: Session, q: str) -> tuple[int, Dict[str, Any]]:
    """Locate a single product by `q`. Exact-match on `nom` wins, otherwise
    the first row whose `nom` contains `q` (case-insensitive). Raises 404
    when nothing matches."""
    if not q or not q.strip():
        raise HTTPException(400, "missing query (?q=...)")
    needle = q.strip()
    lower = needle.casefold()
    contains: tuple[int, Dict[str, Any]] | None = None
    for i, row in enumerate(s.products):
        nom = str(row.get("nom") or "").strip()
        if nom == needle:
            return i, row
        if contains is None and lower in nom.casefold():
            contains = (i, row)
    if contains is not None:
        return contains
    raise HTTPException(404, f"no product matches {q!r}")


@router.get("/lookup", response_model=Dict[str, Any])
def lookup_product(
    q: str = Query(..., description="ItemCode or substring of `nom`."),
    s: Session = Depends(with_session),
):
    """Return the first product whose `nom` matches `q` (exact first, then
    case-insensitive contains)."""
    idx, row = _find_product(s, q)
    return {"index": idx, "item": row}


@router.get("/lookup/image")
def lookup_product_image(
    q: str = Query(..., description="ItemCode or substring of `nom`."),
    download: bool = Query(False, description="Force download instead of inline display."),
    s: Session = Depends(with_session),
):
    """Stream the resolved packshot for the matched product. Falls back to
    `logo_groupe` if no packshot is set. Bare filenames are resolved through
    the recursive image scanner so files in brand subfolders work too."""
    _idx, row = _find_product(s, q)
    candidate = (
        str(row.get("packshot") or "").strip()
        or str(row.get("logo_groupe") or "").strip()
    )
    if not candidate:
        raise HTTPException(404, "product has no image attached")
    rel = image_assets.find_relative_path(IMAGE_DIR, candidate)
    if not rel:
        raise HTTPException(
            404, f"image {candidate!r} not found in assets/images/",
        )
    path = IMAGE_DIR / rel
    headers = {}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="{path.name}"'
    return FileResponse(str(path), headers=headers)


@router.post("", response_model=Dict[str, Any])
def create_product(
    row: Dict[str, Any] | None = None,
    s: Session = Depends(with_session),
):
    new = blank_product()
    if row:
        new.update({k: v for k, v in row.items() if k in PRODUCT_FIELDS})
    new = normalize_product(new)
    s.products.append(new)
    return {"index": len(s.products) - 1, "item": new}


@router.patch("/{idx}", response_model=Dict[str, Any])
def patch_product(
    idx: int,
    payload: Dict[str, Any],
    s: Session = Depends(with_session),
):
    if idx < 0 or idx >= len(s.products):
        raise HTTPException(404, "row not found")
    current = s.products[idx]
    current.update({k: v for k, v in payload.items() if k in PRODUCT_FIELDS})
    s.products[idx] = normalize_product(current)
    return {"index": idx, "item": s.products[idx]}


@router.delete("/{idx}")
def delete_product(idx: int, s: Session = Depends(with_session)):
    if idx < 0 or idx >= len(s.products):
        raise HTTPException(404, "row not found")
    s.products.pop(idx)
    return {"ok": True, "remaining": len(s.products)}


class MovePayload(BaseModel):
    """Target position is 1-indexed to match the user's mental model.

    Setting `position=5` makes that SKU the 5th row, shifting whoever was at
    5 down to 6, whoever was at 6 down to 7, etc. Positions outside [1, N]
    are clamped to the edges.
    """
    position: int


@router.post("/{idx}/move", response_model=Dict[str, Any])
def move_product(
    idx: int,
    payload: MovePayload,
    s: Session = Depends(with_session),
):
    n = len(s.products)
    if idx < 0 or idx >= n:
        raise HTTPException(404, "row not found")
    if n == 0:
        return {"ok": True, "from": idx, "to": 0, "total": 0}
    target = max(0, min(n - 1, payload.position - 1))  # clamp to [0, n-1]
    if target == idx:
        return {"ok": True, "from": idx, "to": idx, "total": n}
    row = s.products.pop(idx)
    s.products.insert(target, row)
    return {"ok": True, "from": idx, "to": target, "total": n}


@router.delete("")
def clear_products(s: Session = Depends(with_session)):
    n = len(s.products)
    s.products = []
    return {"ok": True, "deleted": n}


# ---- Bulk update by brand (for logo propagation) ---------------------------

class BrandLogoIn(BaseModel):
    brand: str
    brand_field: str = "sous_groupe"   # or "groupe"
    logo_filename: str


@router.post("/bulk/apply-logo")
def apply_brand_logo(payload: BrandLogoIn, s: Session = Depends(with_session)):
    field = payload.brand_field if payload.brand_field in {"groupe", "sous_groupe"} else "sous_groupe"
    n = 0
    for row in s.products:
        if str(row.get(field) or "").strip() == payload.brand.strip():
            row["logo_groupe"] = payload.logo_filename
            n += 1
    return {"ok": True, "updated": n}


# ---- Excel template / export / import --------------------------------------

@router.get("/template")
def download_template():
    data = write_template()
    return StreamingResponse(
        BytesIO(data),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": 'attachment; filename="plan_commercial_template.xlsx"'},
    )


@router.get("/export")
def export_xlsx(s: Session = Depends(with_session)):
    rows: List[Dict[str, Any]] = [normalize_product(p) for p in s.products]
    data = write_template(titre=s.titre, canal=s.canal, mois=s.mois, rows=rows)
    fname = f"{s.titre.replace(' ', '_')}_{s.canal.replace(' ', '_')}_{s.mois.replace(' ', '_')}.xlsx"
    return StreamingResponse(
        BytesIO(data),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.post("/import")
async def import_xlsx(
    file: UploadFile = File(...),
    s: Session = Depends(with_session),
):
    data = await file.read()
    try:
        sheet_names = openpyxl.load_workbook(BytesIO(data), read_only=True).sheetnames
    except Exception as exc:
        raise HTTPException(400, f"Cannot open workbook: {exc}") from exc

    rows: List[Dict[str, Any]] = []

    if "BySKU" in sheet_names:
        # PL_Changes workbook
        tmp = Path(tempfile.gettempdir()) / "_uploaded.xlsx"
        tmp.write_bytes(data)
        try:
            products = byfpc_reader.read_bysku(tmp)
        except Exception as exc:
            raise HTTPException(400, f"Failed to read BySKU sheet: {exc}") from exc
        for p in products:
            rows.append(normalize_product({
                "groupe": p.category or "Sans catégorie",
                "sous_groupe": p.brand or "Sans marque",
                "nom": p.sku,
                "packshot": f"{p.sku}.png",
                "prix_gros": p.bp_new or 0.0,
                "prix_gros_net": p.net_new or 0.0,
                "colisage_prix_gros": p.bp_new or 0.0,
                "colisage_prix_gros_net": p.net_new or 0.0,
                "logo_groupe": f"{p.brand}.png" if p.brand else "",
            }))
        s.products = rows
        return {"ok": True, "loaded": len(rows), "kind": "BySKU"}

    if "Meta" in sheet_names and "Produits" in sheet_names:
        try:
            deck = read_excel(data, image_resolver=lambda n: n)
        except Exception as exc:
            raise HTTPException(400, f"Failed to read template: {exc}") from exc
        for g in deck.groupes:
            for sg in g.sous_groupes:
                for p in sg.produits:
                    rows.append(normalize_product({
                        "groupe": g.nom, "sous_groupe": sg.nom, "nom": p.nom,
                        "packshot": p.packshot_path or "",
                        "nom_image": p.nom_image_path or "",
                        "prix_gros": p.prix_gros, "prix_gros_net": p.prix_gros_net,
                        "colisage": p.colisage,
                        "colisage_prix_gros": p.colisage_prix_gros,
                        "colisage_prix_gros_net": p.colisage_prix_gros_net,
                        "logo_groupe": g.logo_path or "",
                        "is_promo": p.is_promo, "type_promo": p.type_promo,
                        "promo_achat_qte": p.promo_achat_qte,
                        "promo_gratuit_qte": p.promo_gratuit_qte,
                        "promo_remise_pct": p.promo_remise_pct,
                        "promo_texte": p.promo_texte,
                        "packshot_left": p.packshot_left,
                        "packshot_top": p.packshot_top,
                        "packshot_width": p.packshot_width,
                        "packshot_height": p.packshot_height,
                    }))
        s.products = rows
        s.titre, s.canal, s.mois = deck.titre, deck.canal, deck.mois
        return {"ok": True, "loaded": len(rows), "kind": "Meta+Produits"}

    raise HTTPException(
        400,
        f"Unrecognized workbook. Expected `BySKU` or `Meta`+`Produits`, got {sheet_names}.",
    )
