"""Archive browser — list months, download, edit/duplicate, delete."""
from __future__ import annotations

import unicodedata
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from ..deps import resolve_image
from ..session import (
    ARCHIVE_DIR, Session, apply_stored_priority, apply_product_memory,
    create_snapshot, normalize_product, with_session,
)
from plan_commercial import export_pdf, read_excel, render_cover, render_product

router = APIRouter(prefix="/api/archive", tags=["archive"])


class DeckSummary(BaseModel):
    name: str          # without .pptx
    pptx_name: str     # with .pptx
    size_kb: int
    has_xlsx: bool
    has_thumb: bool
    modified: str


class MonthGroup(BaseModel):
    month: str         # "YYYY-MM"
    decks: List[DeckSummary]
    total_size_kb: int


@router.get("", response_model=List[MonthGroup])
def list_archive():
    months: List[MonthGroup] = []
    for mdir in sorted(
        (p for p in ARCHIVE_DIR.iterdir() if p.is_dir()), reverse=True
    ):
        decks: List[DeckSummary] = []
        for ppt in sorted(mdir.glob("*.pptx"), reverse=True):
            xlsx = ppt.with_suffix(".xlsx")
            thumb = ppt.with_suffix(".thumb.png")
            decks.append(DeckSummary(
                name=ppt.stem, pptx_name=ppt.name,
                size_kb=int(ppt.stat().st_size / 1024),
                has_xlsx=xlsx.exists(),
                has_thumb=thumb.exists(),
                modified=datetime.fromtimestamp(ppt.stat().st_mtime).isoformat(timespec="seconds"),
            ))
        if decks:
            months.append(MonthGroup(
                month=mdir.name, decks=decks,
                total_size_kb=sum(d.size_kb for d in decks),
            ))
    return months


def _ascii_fold(s: str) -> str:
    """NFKD-fold + drop combining marks. Used for accent-insensitive filename
    matching when the URL's `é` doesn't byte-match the on-disk `é`."""
    nfkd = unicodedata.normalize("NFKD", s or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _find_in_folder(folder: Path, stem: str, suffix: str) -> Optional[Path]:
    """Locate `<stem><suffix>` inside `folder`, tolerating accent / Unicode
    normalization drift between the URL and the on-disk filename. Returns
    None when no match is found."""
    if not folder.is_dir():
        return None
    direct = folder / f"{stem}{suffix}"
    if direct.exists():
        return direct
    target = _ascii_fold(stem).casefold() + suffix.casefold()
    for p in folder.iterdir():
        if not p.is_file():
            continue
        if (_ascii_fold(p.stem).casefold() + p.suffix.casefold()) == target:
            return p
    return None


def _resolve_path(month: str, name: str, suffix: str) -> Path:
    target = _find_in_folder(ARCHIVE_DIR / month, name, suffix)
    if target is None:
        raise HTTPException(404, f"{name}{suffix} not found")
    return target


@router.get("/{month}/{pptx_name}/download")
def download_pptx(month: str, pptx_name: str):
    stem = pptx_name[:-5] if pptx_name.endswith(".pptx") else pptx_name
    p = _find_in_folder(ARCHIVE_DIR / month, stem, ".pptx")
    if p is None:
        raise HTTPException(404)
    return FileResponse(
        str(p),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=p.name,
    )


# A valid multi-page PDF is always at least a few KB; anything smaller is a
# truncated write (e.g. from a full disk) that must not be served or kept.
_MIN_VALID_PDF = 1024


@router.get("/{month}/{name}/download.pdf")
def download_pdf(month: str, name: str):
    """Lazy PDF: rendered on first request, cached on disk, served instantly
    on subsequent ones. We never block /api/generate on PDF rendering — the
    first download takes the hit instead, and only if the user actually
    asks for the PDF.

    A cached PDF is only trusted when it's non-trivially sized — a 0-byte or
    truncated file (which a full disk can leave behind) is discarded and
    re-rendered, so the user never gets served a broken/empty PDF."""
    folder = ARCHIVE_DIR / month
    pdf_path = _find_in_folder(folder, name, ".pdf")
    if pdf_path is not None:
        try:
            good = pdf_path.stat().st_size >= _MIN_VALID_PDF
        except OSError:
            good = False
        if good:
            return FileResponse(
                str(pdf_path), media_type="application/pdf", filename=pdf_path.name,
            )
        # Broken cache — drop it and fall through to a fresh render.
        try:
            pdf_path.unlink()
        except OSError:
            pass

    xlsx = _find_in_folder(folder, name, ".xlsx")
    if xlsx is None:
        raise HTTPException(404, "no sidecar xlsx for this archived deck")

    try:
        deck = read_excel(xlsx.read_bytes(), image_resolver=resolve_image)
        pdf_bytes = export_pdf(deck)            # uses preview.PDF_DPI (200) by default
    except Exception as exc:
        raise HTTPException(500, f"PDF render failed: {exc}") from exc

    out_path = xlsx.with_suffix(".pdf")
    try:
        out_path.write_bytes(pdf_bytes)         # cache for next time
    except OSError:
        # Partial write (disk full) — remove the stub so it isn't served as a
        # "cached" broken PDF on the next request.
        try:
            out_path.unlink(missing_ok=True)
        except OSError:
            pass

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{out_path.name}"'},
    )


@router.get("/{month}/{name}/thumbnail.png")
def thumbnail(month: str, name: str):
    folder = ARCHIVE_DIR / month
    pptx = _find_in_folder(folder, name, ".pptx")
    if pptx is None:
        raise HTTPException(404)
    thumb = pptx.with_suffix(".thumb.png")
    if thumb.exists():
        return FileResponse(str(thumb), media_type="image/png")
    xlsx = pptx.with_suffix(".xlsx")
    if not xlsx.exists():
        raise HTTPException(404, "no sidecar xlsx, can't render thumbnail")
    deck = read_excel(xlsx.read_bytes(), image_resolver=resolve_image)
    first = next(deck.iter_products(), None)
    png = render_product(deck, first[0], first[2]) if first else render_cover(deck)
    try:
        from PIL import Image as _Im
        im = _Im.open(BytesIO(png))
        ratio = 400 / im.width
        im = im.resize((400, int(im.height * ratio)), _Im.LANCZOS)
        buf = BytesIO()
        im.save(buf, format="PNG", optimize=True)
        thumb.write_bytes(buf.getvalue())
        return Response(content=buf.getvalue(), media_type="image/png")
    except Exception:
        return Response(content=png, media_type="image/png")


class LoadOut(BaseModel):
    loaded: int


@router.post("/{month}/{name}/load", response_model=LoadOut)
def load_archive(month: str, name: str, s: Session = Depends(with_session)):
    xlsx = _find_in_folder(ARCHIVE_DIR / month, name, ".xlsx")
    if xlsx is None:
        raise HTTPException(404, "no sidecar xlsx")
    create_snapshot(f"Avant chargement archive ({name})")
    deck = read_excel(xlsx.read_bytes(), image_resolver=lambda n: n)
    rows: List[Dict[str, Any]] = []
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
    apply_product_memory(rows)
    s.products = apply_stored_priority(rows)
    s.titre, s.canal, s.mois = deck.titre, deck.canal, deck.mois
    return LoadOut(loaded=len(rows))


class DuplicateOut(BaseModel):
    loaded: int
    new_mois: str


@router.post("/{month}/{name}/duplicate", response_model=DuplicateOut)
def duplicate_archive(month: str, name: str, s: Session = Depends(with_session)):
    out = load_archive(month, name, s)
    s.mois = datetime.now().strftime("%B %Y")
    return DuplicateOut(loaded=out.loaded, new_mois=s.mois)


@router.delete("/{month}/{pptx_name}")
def delete_archived(month: str, pptx_name: str):
    stem = pptx_name[:-5] if pptx_name.endswith(".pptx") else pptx_name
    base = _find_in_folder(ARCHIVE_DIR / month, stem, ".pptx")
    if base is None:
        return {"ok": True}
    base.unlink(missing_ok=True)
    base.with_suffix(".xlsx").unlink(missing_ok=True)
    base.with_suffix(".pdf").unlink(missing_ok=True)
    base.with_suffix(".thumb.png").unlink(missing_ok=True)
    return {"ok": True}
