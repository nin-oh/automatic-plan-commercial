"""Build the .pptx, archive it, and return a download URL."""
from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..deps import build_deck
from ..session import (
    ARCHIVE_DIR, PRODUCT_FIELDS, Session, with_session,
)
from plan_commercial import build_pptx

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/generate", tags=["generate"])

_FR_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
}


def _archive_month(mois: str) -> str:
    parts = (mois or "").lower().split()
    month = next((_FR_MONTHS[p] for p in parts if p in _FR_MONTHS), None)
    year = next((int(p) for p in parts if p.isdigit() and len(p) == 4), None)
    if month and year:
        return f"{year}-{month:02d}"
    return datetime.now().strftime("%Y-%m")


def _slug(s: str) -> str:
    """ASCII slug. Strips accents so filenames stay URL-safe — `é` in a path
    survives the browser's UTF-8 encoding round-trip but trips up Windows
    filesystem matching, producing the "File wasn't available on site" download
    error."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", (s or "").strip())
    ascii_only = "".join(c for c in nfkd if not unicodedata.combining(c))
    keep = [c if c.isascii() and c.isalnum() else "_" for c in ascii_only]
    return "".join(keep).strip("_") or "plan"


def _archive(pptx_bytes: bytes, s: Session) -> Path:
    """Write the .pptx + a sidecar .xlsx to archive/<YYYY-MM>/.

    Order matters: the Home page polls the archive folder and lists every
    `*.pptx` it sees. We write the sidecar first, then the pptx to a `.tmp`
    path, then atomically rename — so the deck only becomes "visible" once
    both files exist on disk and the rename is complete.
    """
    from openpyxl import Workbook
    folder = ARCHIVE_DIR / _archive_month(s.mois)
    folder.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = f"{_slug(s.titre)}_{_slug(s.canal)}_{_slug(s.mois)}_{ts}"
    pptx_path = folder / f"{stem}.pptx"
    pptx_tmp  = folder / f"{stem}.pptx.partial"
    xlsx_path = folder / f"{stem}.xlsx"

    # 1) Sidecar first — small + not listed by the archive endpoint
    wb = Workbook()
    ws = wb.active
    ws.title = "Meta"
    ws.append(["cle", "valeur"])
    for k, v in {"titre": s.titre, "canal": s.canal, "mois": s.mois}.items():
        ws.append([k, v])
    wp = wb.create_sheet("Produits")
    wp.append(PRODUCT_FIELDS)
    for row in s.products:
        wp.append([row.get(c) for c in PRODUCT_FIELDS])
    wb.save(xlsx_path)

    # 2) Big pptx — write to .partial, then atomic rename to its final name.
    # The archive listing only matches `*.pptx`, not `*.pptx.partial`, so
    # the deck appears only when the rename completes.
    pptx_tmp.write_bytes(pptx_bytes)
    pptx_tmp.replace(pptx_path)

    return pptx_path


class GenerateOut(BaseModel):
    archive_name: str       # filename in archive/<YYYY-MM>/
    archive_month: str      # "YYYY-MM"
    pptx_url: str
    pdf_url: str            # served lazily — PDF is rendered on first request
    n_groups: int
    n_subgroups: int
    n_products: int


@router.post("", response_model=GenerateOut)
def generate(
    with_dividers: bool = Query(True),
    s: Session = Depends(with_session),
):
    if not s.products:
        raise HTTPException(400, "no products to generate")
    deck = build_deck(s)
    data = build_pptx(deck, with_subgroup_dividers=with_dividers)
    archived = _archive(data, s)
    rel_month = archived.parent.name
    return GenerateOut(
        archive_name=archived.name,
        archive_month=rel_month,
        pptx_url=f"/api/archive/{rel_month}/{archived.name}/download",
        pdf_url=f"/api/archive/{rel_month}/{archived.stem}/download.pdf",
        n_groups=len(deck.groupes),
        n_subgroups=sum(len(g.sous_groupes) for g in deck.groupes),
        n_products=sum(1 for _ in deck.iter_products()),
    )
