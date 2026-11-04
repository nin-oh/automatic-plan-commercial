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
    IMAGE_DIR, PRODUCT_FIELDS, Session, all_project_prices, apply_stored_priority,
    apply_product_memory, blank_product, create_snapshot, normalize_product,
    save_session, with_session,
)
from .. import order_presets
from .. import pptx_import as _pptx
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


@router.post("/{idx}/move-in-brand", response_model=Dict[str, Any])
def move_product_in_brand(
    idx: int,
    payload: MovePayload,
    s: Session = Depends(with_session),
):
    """Move a SKU to position N **within its own brand block**, leaving
    every other brand's products untouched. The position is 1-indexed and
    relative to siblings sharing the same `sous_groupe`.

    Used by the OrderPage when the user reorders inside a brand group —
    the global product-list order is recomputed from the new within-brand
    layout, then mirrored into `sku_priority` like any other reorder.
    """
    n = len(s.products)
    if idx < 0 or idx >= n:
        raise HTTPException(404, "row not found")
    brand = (s.products[idx].get("sous_groupe") or "").strip()
    siblings = [
        i for i, p in enumerate(s.products)
        if (p.get("sous_groupe") or "").strip() == brand
    ]
    if not siblings:
        raise HTTPException(404, "no siblings in brand")
    within_count = len(siblings)
    current_within = siblings.index(idx)
    target_within = max(0, min(within_count - 1, payload.position - 1))
    if current_within == target_within:
        return {"ok": True, "brand": brand, "from": current_within,
                "to": current_within, "total_in_brand": within_count}

    # Pull the brand's rows out in current order, reorder, splice back
    # into the global list at the same global indices.
    brand_rows = [s.products[i] for i in siblings]
    moved = brand_rows.pop(current_within)
    brand_rows.insert(target_within, moved)
    new_products = list(s.products)
    for k, global_i in enumerate(siblings):
        new_products[global_i] = brand_rows[k]
    s.products = new_products
    return {"ok": True, "brand": brand, "from": current_within,
            "to": target_within, "total_in_brand": within_count}


@router.post("/brand/{brand:path}/move", response_model=Dict[str, Any])
def move_brand(
    brand: str,
    payload: MovePayload,
    s: Session = Depends(with_session),
):
    """Move every product belonging to `brand` to the Nth brand-slot
    (1-indexed). Within-brand order is preserved.

    Example: if the deck has brand blocks [MIO, FIX, IRIS] and the caller
    sends `position=1` for "IRIS", the result is [IRIS, MIO, FIX] —
    every IRIS product moves above every MIO/FIX product, but the
    relative order of IRIS products amongst themselves is kept."""
    # Discover current brand blocks in their appearance order.
    seen: List[str] = []
    by_brand: Dict[str, List[Dict[str, Any]]] = {}
    no_brand: List[Dict[str, Any]] = []
    for p in s.products:
        b = (p.get("sous_groupe") or "").strip()
        if not b:
            no_brand.append(p)
            continue
        if b not in by_brand:
            by_brand[b] = []
            seen.append(b)
        by_brand[b].append(p)

    if brand not in by_brand:
        raise HTTPException(404, f"brand {brand!r} not found in deck")

    current_idx = seen.index(brand)
    target_idx = max(0, min(len(seen) - 1, payload.position - 1))
    if current_idx == target_idx:
        return {"ok": True, "from": current_idx, "to": current_idx,
                "total_brands": len(seen)}

    seen.remove(brand)
    seen.insert(target_idx, brand)
    new_products: List[Dict[str, Any]] = []
    for b in seen:
        new_products.extend(by_brand[b])
    new_products.extend(no_brand)
    s.products = new_products
    return {"ok": True, "from": current_idx, "to": target_idx,
            "total_brands": len(seen)}


@router.delete("")
def clear_products(s: Session = Depends(with_session)):
    n = len(s.products)
    create_snapshot("Avant effacement")
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


@router.get("/missing-packshots/export.xlsx")
def export_missing_packshots(s: Session = Depends(with_session)):
    """Export a flat list of every SKU whose packshot is missing.

    "Missing" means either the field is empty OR it points to a file that
    doesn't resolve on disk via `image_assets.find_relative_path`. Same
    semantics as the "PPT with packshot only" filter, just negated — so
    the user can hand this Excel to a sourcing team and trust that
    everything in it really needs an image.
    """
    cols = [
        "groupe", "sous_groupe", "nom", "item_code",
        "packshot", "packshot_status",
        "prix_gros", "prix_gros_net",
        "colisage", "is_promo", "type_promo",
    ]
    # French status labels — keep in sync with PACKSHOT_STATUS_OPTIONS in
    # the frontend (BrandWorkflow.tsx / MissingPackshotsModal.tsx). When
    # the field is empty we leave the cell blank so the user can spot
    # uncategorised rows at a glance.
    status_fr = {
        "discontinued": "Produit n'existe plus",
        "in_progress":  "Packshot en cours",
        "other":        "Autre",
    }
    headers_fr = [
        "Marque (groupe)", "Sous-marque", "SKU", "Code SAP",
        "Packshot actuel (vide / introuvable)", "Catégorie",
        "Prix gros", "Prix gros net",
        "Colisage", "Promo ?", "Type promo",
    ]

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sans packshot"

    # Header row — bold + frozen so the user can scroll the list while the
    # column titles stay pinned. Matches the look of the other exports.
    ws.append(headers_fr)
    for cell in ws[1]:
        cell.font = openpyxl.styles.Font(bold=True, color="FFFFFF")
        cell.fill = openpyxl.styles.PatternFill(
            start_color="DC2626", end_color="DC2626", fill_type="solid",
        )
        cell.alignment = openpyxl.styles.Alignment(
            horizontal="left", vertical="center",
        )
    ws.freeze_panes = "A2"

    n = 0
    for row in s.products:
        packshot = (row.get("packshot") or "").strip()
        if packshot and image_assets.find_relative_path(IMAGE_DIR, packshot):
            continue  # File exists on disk → not missing
        n += 1
        values = []
        for c in cols:
            v = row.get(c, "")
            if c == "packshot_status":
                # Translate the machine code to the French label that's
                # already in the headers — the Excel becomes self-describing.
                v = status_fr.get(str(v).strip(), "")
            values.append(v)
        ws.append(values)

    # Auto-fit column widths to header text + a generous floor. python-pptx
    # doesn't auto-fit; openpyxl needs this manual sweep.
    for i, header in enumerate(headers_fr, start=1):
        col = openpyxl.utils.get_column_letter(i)
        ws.column_dimensions[col].width = max(14, min(40, len(header) + 4))

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    title_slug = (s.titre or "plan").replace(" ", "_")
    mois_slug  = (s.mois  or "").replace(" ", "_")
    fname = f"sans_packshot_{title_slug}_{mois_slug}.xlsx" if mois_slug \
            else f"sans_packshot_{title_slug}.xlsx"
    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            # Useful for clients that want to show the count before opening.
            "X-Missing-Count": str(n),
        },
    )


@router.post("/default-order")
def apply_default_order(s: Session = Depends(with_session)):
    """Reorder the whole session by the deck's default family order — the
    catalogue-wide Gros list, or the marque's list in Détail. The resulting
    order is mirrored into sku/brand priority, so it becomes the remembered
    order for future imports too."""
    key = order_presets.preset_key(s.canal, s.marque)
    if order_presets.get_preset(key) is None:
        raise HTTPException(
            400,
            f"La liste d'ordre par défaut pour «{key}» n'est pas encore "
            "définie — envoyez la liste de familles pour l'ajouter.",
        )
    ordered, matched = order_presets.apply_family_order(s.products, s.canal, s.marque)
    s.products = ordered
    return {"ok": True, "matched": matched, "total": len(ordered), "marque": key}


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

    create_snapshot(f"Avant import Excel ({file.filename or 'fichier'})")

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
        # Seed the deck's default family order first; the user's remembered
        # manual order (sku/brand priority) still wins where it exists.
        rows, _ = order_presets.apply_family_order(rows, s.canal, s.marque)
        enriched = apply_product_memory(rows)
        s.products = apply_stored_priority(rows)
        return {"ok": True, "loaded": len(rows), "kind": "BySKU", "enriched": enriched}

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
                        "item_code": p.item_code,
                        "packshot": p.packshot_path or "",
                        "nom_image": p.nom_image_path or "",
                        "prix_gros": p.prix_gros, "prix_gros_net": p.prix_gros_net,
                        "prix_detail": p.prix_detail, "prix_detail_net": p.prix_detail_net,
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
        # canal comes from the workbook's Meta sheet — use it (not the
        # pre-import session value) to decide on the family ordering.
        rows, _ = order_presets.apply_family_order(rows, deck.canal, s.marque)
        enriched = apply_product_memory(rows)
        s.products = apply_stored_priority(rows)
        s.titre, s.canal, s.mois = deck.titre, deck.canal, deck.mois
        return {"ok": True, "loaded": len(rows), "kind": "Meta+Produits", "enriched": enriched}

    raise HTTPException(
        400,
        f"Unrecognized workbook. Expected `BySKU` or `Meta`+`Produits`, got {sheet_names}.",
    )


# ── Master price list (all projects) ────────────────────────────────────────

def _canal_kind(canal: str) -> str:
    c = (canal or "").lower()
    if "detail" in c or "détail" in c:
        return "detail"
    if "gros" in c:
        return "gros"
    return "other"


def _num_or_none(v) -> Optional[float]:
    try:
        f = float(v or 0)
    except (TypeError, ValueError):
        return None
    return f if f else None


@router.get("/price-list.xlsx")
def export_price_list():
    """Master price list across ALL projects, one row per item.

    - Aggregates every project; dedup by Item Code (→ name when no code).
    - Détail BP/Net comes from the latest **Détail**-canal project; Gros BP
      from the latest **Gros**-canal project (détail projects store a
      placeholder gros, so we ignore that). Falls back to any canal for détail
      when an item never appears in a détail project.
    - Deleted products simply don't appear (we read live project data).
    Layout mirrors the FPC price-list sheet; SKU / SKUn / Demi-Gros are left
    blank (the app doesn't hold that SAP/FPC data)."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    agg: Dict[str, Dict[str, Any]] = {}
    for proj in all_project_prices():
        kind = _canal_kind(proj["canal"])
        ts = proj["updated_at"]
        for p in proj["products"]:
            code = str(p.get("item_code") or "").strip()
            nom = str(p.get("nom") or "").strip()
            if not (code or nom):
                continue
            key = code or ("~" + nom.lower())
            rec = agg.get(key)
            if rec is None:
                rec = agg[key] = {
                    "code": code, "nom": nom, "colisage": "", "status": "",
                    "det_bp": None, "det_net": None, "gros_bp": None, "gros_net": None,
                    "det_ts": "", "gros_ts": "", "meta_ts": "",
                    "any_bp": None, "any_net": None, "any_ts": "",
                }
            if ts >= rec["meta_ts"]:
                rec["meta_ts"] = ts
                rec["nom"] = nom or rec["nom"]
                if code:
                    rec["code"] = code
                if p.get("colisage"):
                    rec["colisage"] = p.get("colisage")
                rec["status"] = p.get("packshot_status") or rec["status"]
            db_, dn_ = _num_or_none(p.get("prix_detail")), _num_or_none(p.get("prix_detail_net"))
            gb_, gn_ = _num_or_none(p.get("prix_gros")), _num_or_none(p.get("prix_gros_net"))
            if kind == "detail" and (rec["det_ts"] == "" or ts >= rec["det_ts"]):
                rec["det_ts"], rec["det_bp"], rec["det_net"] = ts, db_, dn_
            if kind == "gros" and (rec["gros_ts"] == "" or ts >= rec["gros_ts"]):
                rec["gros_ts"], rec["gros_bp"], rec["gros_net"] = ts, gb_, gn_
            if rec["any_ts"] == "" or ts >= rec["any_ts"]:
                rec["any_ts"], rec["any_bp"], rec["any_net"] = ts, db_, dn_

    for rec in agg.values():
        if rec["det_bp"] is None:
            rec["det_bp"], rec["det_net"] = rec["any_bp"], rec["any_net"]

    records = sorted(
        agg.values(),
        key=lambda r: (0, r["code"]) if r["code"] else (1, r["nom"].lower()),
    )

    wb = Workbook()
    ws = wb.active
    ws.title = "Liste de prix"
    red = PatternFill("solid", fgColor="C00000")
    white = Font(bold=True, color="FFFFFF")
    ws["A1"] = "Liste de prix"
    ws["A1"].font = Font(bold=True)
    for col, lbl in {8: "Détail", 12: "Demi Gros", 14: "Gros"}.items():
        ws.cell(1, col, lbl).font = Font(bold=True)
    for col, h in {1: "Item Code", 2: "Item Description", 3: "Status", 4: "SKU",
                   5: "SKUn", 6: "UoM", 8: "Détail_BP", 9: "Promo-txt",
                   10: "Détail_Net", 12: "DG_BP", 14: "Gros_BP", 15: "Promo_Txt",
                   16: "Gros_Net"}.items():
        cc = ws.cell(2, col, h)
        cc.font, cc.fill = white, red
    r = 3
    for rec in records:
        code = rec["code"]
        ws.cell(r, 1, int(code) if code.isdigit() else code)
        ws.cell(r, 2, rec["nom"])
        ws.cell(r, 3, "N'existe plus" if rec["status"] == "discontinued" else "Actif")
        ws.cell(r, 6, rec["colisage"])
        ws.cell(r, 8, rec["det_bp"])
        ws.cell(r, 10, rec["det_net"])
        ws.cell(r, 14, rec["gros_bp"])
        ws.cell(r, 16, rec["gros_net"])
        r += 1
    for col, w in {1: 12, 2: 46, 3: 14, 4: 14, 5: 22, 6: 20, 8: 12, 9: 12,
                   10: 12, 12: 10, 14: 12, 15: 12, 16: 12}.items():
        ws.column_dimensions[chr(64 + col)].width = w

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    from datetime import datetime
    fname = f"Liste_de_prix_{datetime.now():%Y%m%d}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


# ── PPTX image import ───────────────────────────────────────────────────────

_WEB_EXTS = {"png", "jpg", "jpeg", "webp"}


def _free_name(stem: str, ext: str = "png") -> str:
    """A library-relative `<stem>.<ext>` that does NOT already exist on disk.

    Imports must never overwrite an existing library image (a different
    product or an earlier version may rely on it). If it's taken we fall back
    to `<stem>_ppt.<ext>`, `<stem>_ppt2.<ext>`, … until one is free."""
    cand = f"{stem}.{ext}"
    if not (IMAGE_DIR / cand).exists():
        return cand
    for i in range(1, 1000):
        suffix = "_ppt" if i == 1 else f"_ppt{i}"
        cand = f"{stem}{suffix}.{ext}"
        if not (IMAGE_DIR / cand).exists():
            return cand
    return f"{stem}_ppt_{__import__('uuid').uuid4().hex[:8]}.{ext}"


def _save_bytes(blob: bytes, ext: str, stem: str, *, brand: Optional[str] = None,
                type_: str = "other") -> Optional[str]:
    """Add a slide image to the library under a fresh, non-colliding name.

    Fast path: web-renderable formats (png/jpg/webp) are written **as-is** —
    no decode/re-encode, which is what made large imports slow (PNG-compressing
    hundreds of photos). Only exotic formats (emf/wmf/bmp/tiff/gif) are
    converted to PNG. Returns the relative filename, or None if undecodable."""
    ext = (ext or "png").lower()
    if ext == "jpe":
        ext = "jpg"
    if ext in _WEB_EXTS:
        data = blob
    else:
        try:
            from PIL import Image as _I
            im = _I.open(BytesIO(blob))
            im.load()
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA")
            out = BytesIO()
            im.save(out, format="PNG")
            data, ext = out.getvalue(), "png"
        except Exception:
            return None
    fname = _free_name(stem, ext)
    image_assets.register_upload(
        IMAGE_DIR, fname, data, brand=(brand or None), type_=type_,
    )
    return fname


@router.post("/import-pptx")
async def import_pptx(
    file: UploadFile = File(...),
    s: Session = Depends(with_session),
):
    """Pull packshots (with exact position + size), brand logos, and every
    other image out of a PowerPoint deck, matching each slide to an existing
    product by name. Streams newline-delimited JSON progress events so the UI
    can show live per-slide status, ending with a `done` event carrying the
    full report.

    - main packshot   → matched product's packshot + packshot_left/top/width/height
    - brand logo      → matched product's logo (only if it had none)
    - every other img → saved to the library and reported per slide.
    Nothing is created, deleted, or silently mis-placed. Chrome (background,
    banner) is classified purely by geometry and never even read from the
    file, which keeps big decks fast."""
    import hashlib
    import json as _json

    from pptx import Presentation
    from pptx.util import Emu

    data = await file.read()
    filename = file.filename or "deck"

    def stream():
        try:
            prs = Presentation(BytesIO(data))
        except Exception as exc:
            yield _json.dumps({"type": "error",
                               "message": f"Impossible de lire le PPTX : {exc}"}) + "\n"
            return

        sw = Emu(prs.slide_width or Emu.from_inches(_pptx.SLIDE_W_IN)).inches
        sh = Emu(prs.slide_height or Emu.from_inches(_pptx.SLIDE_H_IN)).inches
        slides = list(prs.slides)
        total = len(slides)
        names = [str(p.get("nom") or "") for p in s.products]

        create_snapshot(f"Avant import PPT ({filename})")
        yield _json.dumps({"type": "start", "total": total}) + "\n"

        matched = packshots = logos = gratuites = saved = 0
        unmatched: List[str] = []
        extras: List[Dict[str, Any]] = []
        media_cache: Dict[str, str] = {}   # content sha → saved filename

        def read(shp):
            img = shp.image
            return img.blob, (img.ext or "png")

        def save_media(blob, ext, stem, *, brand=None, type_="other"):
            """Save, or reuse an already-saved identical image. Returns
            (filename, is_new). Content-dedup keeps the library small when the
            same image (e.g. a shared gratuite item) repeats across slides."""
            h = hashlib.sha1(blob).hexdigest()
            cached = media_cache.get(h)
            if cached:
                return cached, False
            fn = _save_bytes(blob, ext, stem, brand=brand, type_=type_)
            if fn:
                media_cache[h] = fn
            return fn, True

        gratuite_slots = ["promo_gratuite_image", "promo_gratuite_image_2",
                          "promo_gratuite_image_3", "promo_gratuite_image_4"]

        for si, slide in enumerate(slides, 1):
            title = _pptx._guess_title(slide)
            pics = [(shp, _pptx._shape_rect(shp)) for shp in slide.shapes
                    if shp.shape_type == _pptx._PICTURE]
            mi = _pptx.match_title(title, names)
            is_promo = bool(mi is not None and s.products[mi].get("is_promo"))
            roles = _pptx.assign_slide_roles(pics, sw, sh, is_promo)
            pack = roles["packshot"]
            pack_rect = roles["packshot_rect"]

            if mi is None:
                # Unmatched — save whatever we found to imported/ and report it.
                extra_files: List[str] = []
                if pack:
                    blob, ext = read(pack)
                    fn, new = save_media(blob, ext, f"imported/slide{si}_packshot")
                    if fn and new:
                        extra_files.append(fn)
                        saved += 1
                for i, shp in enumerate(roles["extras"]):
                    blob, ext = read(shp)
                    fn, new = save_media(blob, ext, f"imported/slide{si}_extra{i + 1}")
                    if fn and new:
                        extra_files.append(fn)
                        saved += 1
                if title.strip() and (pack or roles["extras"]):
                    unmatched.append(title.strip())
                if extra_files:
                    extras.append({"slide": si, "title": title, "files": extra_files})
                yield _json.dumps({
                    "type": "progress", "slide": si, "total": total,
                    "title": title[:44], "matched": matched,
                    "packshots": packshots, "saved": saved,
                }) + "\n"
                continue

            prod = s.products[mi]
            brand = (prod.get("sous_groupe") or prod.get("groupe") or "").strip()
            slug = _pptx._slug(prod.get("nom") or f"slide{si}")

            # Packshot — the bought product (LEFT on a promo slide).
            if pack:
                blob, ext = read(pack)
                stem = f"{brand}/{slug}" if brand else f"imported/{slug}"
                fn, new = save_media(blob, ext, stem, brand=brand, type_="packshot")
                if fn:
                    prod["packshot"] = fn
                    if is_promo:
                        # Promo bags use the fixed promo layout — clear any
                        # free-form position so the renderer places them right.
                        prod["packshot_left"] = prod["packshot_top"] = 0.0
                        prod["packshot_width"] = prod["packshot_height"] = 0.0
                    else:
                        prod["packshot_left"] = round(pack_rect[0], 3)
                        prod["packshot_top"] = round(pack_rect[1], 3)
                        prod["packshot_width"] = round(pack_rect[2], 3)
                        prod["packshot_height"] = round(pack_rect[3], 3)
                    packshots += 1
                    saved += 1 if new else 0

            # Gratuite item(s) — the free product(s) on the RIGHT of a promo.
            if is_promo:
                for gi, shp in enumerate(roles["gratuite"][:4]):
                    blob, ext = read(shp)
                    gstem = (f"{brand}/{slug}_gratuite{gi + 1}" if brand
                             else f"imported/{slug}_gratuite{gi + 1}")
                    fn, new = save_media(blob, ext, gstem, brand=brand, type_="packshot")
                    if fn:
                        prod[gratuite_slots[gi]] = fn
                        gratuites += 1
                        saved += 1 if new else 0

            # Brand logo (only fill when the product had none).
            if roles["logo"]:
                blob, ext = read(roles["logo"])
                stem = (f"{brand}/logo_{_pptx._slug(brand or 'logo')}"
                        if brand else f"imported/logo_slide{si}")
                fn, new = save_media(blob, ext, stem, brand=brand, type_="logo")
                if fn:
                    saved += 1 if new else 0
                    if not (prod.get("logo_groupe") or "").strip():
                        prod["logo_groupe"] = fn
                        logos += 1

            # Genuine leftovers (non-promo second images) → library + report.
            extra_files = []
            for i, shp in enumerate(roles["extras"]):
                blob, ext = read(shp)
                fn, new = save_media(blob, ext, f"imported/slide{si}_extra{i + 1}")
                if fn and new:
                    extra_files.append(fn)
                    saved += 1

            s.products[mi] = normalize_product(prod)
            matched += 1
            if extra_files:
                extras.append({"slide": si, "title": title, "files": extra_files})

            yield _json.dumps({
                "type": "progress", "slide": si, "total": total,
                "title": title[:44], "matched": matched,
                "packshots": packshots, "saved": saved,
            }) + "\n"

        save_session()
        yield _json.dumps({
            "type": "done",
            "report": {
                "ok": True, "slides": total, "matched": matched,
                "packshots_set": packshots, "gratuites_set": gratuites,
                "logos_set": logos, "saved_images": saved,
                "unmatched": unmatched, "extras": extras,
            },
        }) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")
