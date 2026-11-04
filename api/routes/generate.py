"""Build the .pptx, archive it, and return a download URL."""
from __future__ import annotations

import logging
import threading
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..deps import build_deck, row_has_resolvable_packshot
from ..session import (
    ARCHIVE_DIR, PRODUCT_FIELDS, Session, with_session,
)
from plan_commercial import build_pptx

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/generate", tags=["generate"])


# ─── Progress tracker ─────────────────────────────────────────────────────
# Module-level — the app runs single-user single-process so two generate
# calls overlapping is unlikely; if it ever happens, the second one
# overwrites the first's progress (the UI re-polls its own running job).
# Reads from the GET /progress endpoint don't block the writer because
# both sides snapshot under the same lock.

class _Progress:
    lock = threading.Lock()
    running: bool = False
    current: int = 0
    total: int = 0
    phase: str = ""
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None


def _progress_snapshot() -> dict:
    with _Progress.lock:
        return {
            "running": _Progress.running,
            "current": _Progress.current,
            "total": _Progress.total,
            "phase": _Progress.phase,
            "percent": (
                round(100 * _Progress.current / _Progress.total, 1)
                if _Progress.total > 0 else 0.0
            ),
            "started_at": _Progress.started_at,
            "finished_at": _Progress.finished_at,
            "error": _Progress.error,
        }


def _progress_reset_running(running: bool, error: Optional[str] = None) -> None:
    with _Progress.lock:
        _Progress.running = running
        if running:
            _Progress.started_at = datetime.now().isoformat(timespec="seconds")
            _Progress.finished_at = None
            _Progress.error = None
            _Progress.current = 0
            _Progress.total = 0
            _Progress.phase = "Préparation…"
        else:
            _Progress.finished_at = datetime.now().isoformat(timespec="seconds")
            _Progress.error = error


def _progress_callback(current: int, total: int, phase: str) -> None:
    with _Progress.lock:
        _Progress.current = current
        _Progress.total = total
        _Progress.phase = phase


@router.get("/progress")
def get_progress():
    """Poll-friendly progress snapshot. Returns instantly — no blocking on
    the running build. The frontend polls this every ~500ms while its
    POST /generate request is in flight."""
    return _progress_snapshot()

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


def _archive(pptx_bytes: bytes, s: Session, *, stem_suffix: str = "") -> Path:
    """Write the .pptx + a sidecar .xlsx to archive/<YYYY-MM>/.

    Order matters: the Home page polls the archive folder and lists every
    `*.pptx` it sees. We write the sidecar first, then the pptx to a `.tmp`
    path, then atomically rename — so the deck only becomes "visible" once
    both files exist on disk and the rename is complete.

    `stem_suffix` is appended to the filename stem after the canal/mois
    slug, so e.g. the "with packshot only" export becomes
    `..._gros_juin_2026_with_packshot_20260608_141500.pptx` and doesn't
    clobber the full export of the same session.
    """
    from openpyxl import Workbook
    folder = ARCHIVE_DIR / _archive_month(s.mois)
    folder.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = f"{_slug(s.titre)}_{_slug(s.canal)}_{_slug(s.mois)}{stem_suffix}_{ts}"
    pptx_path = folder / f"{stem}.pptx"
    pptx_tmp  = folder / f"{stem}.pptx.partial"
    xlsx_path = folder / f"{stem}.xlsx"

    # 1) Sidecar first — small + not listed by the archive endpoint
    wb = Workbook()
    ws = wb.active
    ws.title = "Meta"
    ws.append(["cle", "valeur"])
    for k, v in {
        "titre": s.titre, "canal": s.canal, "mois": s.mois,
        "marque": s.marque or "MIO",
        "nouveau_lancement": "1" if getattr(s, "nouveau_lancement", False) else "0",
    }.items():
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
    with_packshot_only: bool = Query(
        False,
        description=(
            "When true, only emit slides for SKUs whose packshot resolves "
            "to a file on disk. Rows missing a packshot (or pointing at a "
            "deleted file) are silently dropped. Archive filename is "
            "suffixed with `_with_packshot` so the two exports coexist."
        ),
    ),
    s: Session = Depends(with_session),
):
    if not s.products:
        raise HTTPException(400, "no products to generate")

    _progress_reset_running(True)
    try:
        if with_packshot_only:
            deck = build_deck(s, row_filter=row_has_resolvable_packshot)
            if not any(deck.iter_products()):
                raise HTTPException(
                    400,
                    "no products with a resolvable packshot — upload images first",
                )
        else:
            deck = build_deck(s)

        data = build_pptx(
            deck,
            with_subgroup_dividers=with_dividers,
            progress_callback=_progress_callback,
        )
        archived = _archive(
            data, s,
            stem_suffix="_with_packshot" if with_packshot_only else "",
        )
    except HTTPException:
        _progress_reset_running(False, error="invalid_state")
        raise
    except Exception as exc:                 # noqa: BLE001
        _progress_reset_running(False, error=str(exc)[:200])
        raise
    else:
        _progress_reset_running(False)
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
