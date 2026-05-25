"""SAP import — pulls product data from the SQL Server warehouse via ODBC.

The credentials and server/database are passed in the request body. Nothing
is persisted server-side; the frontend may cache server/database/username in
the user's browser for convenience but never stores the password.

Run `pip install pyodbc` if the import endpoint returns the missing-driver
error. The query lives in ``api/sap_query.py`` — edit only that file when
you change which columns/joins you need.
"""
from __future__ import annotations

import logging
import mimetypes
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

import image_assets
from ..session import IMAGE_DIR, PRODUCT_FIELDS, Session, normalize_product, with_session
from ..sap_query import DEFAULT_MAPPING, IMPORT_QUERY

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sap", tags=["sap"])

DEFAULT_SERVER = "192.168.1.240"
DEFAULT_DATABASE = "DATAWAREHOUSE"


class SapCreds(BaseModel):
    server: str = Field(default=DEFAULT_SERVER)
    database: str = Field(default=DEFAULT_DATABASE)
    username: str
    password: str
    # Optional driver override; otherwise we pick the most recent SQL Server
    # ODBC driver installed on the machine.
    driver: Optional[str] = None


def _pick_driver(explicit: Optional[str] = None) -> str:
    import pyodbc
    if explicit:
        return explicit
    candidates = [d for d in pyodbc.drivers() if "SQL Server" in d]
    if not candidates:
        raise HTTPException(
            500,
            "No SQL Server ODBC driver found. Install 'ODBC Driver 17 for "
            "SQL Server' (or 18) from Microsoft.",
        )
    # Prefer the newest; rough sort by the embedded version number.
    def _rank(name: str) -> int:
        for tok in name.split():
            if tok.isdigit():
                return int(tok)
        return 0
    return sorted(candidates, key=_rank, reverse=True)[0]


def _connect(c: SapCreds):
    """Open a pyodbc connection or raise an HTTPException with a clean message."""
    try:
        import pyodbc
    except ImportError as exc:
        raise HTTPException(
            500, "pyodbc is not installed on the server (pip install pyodbc).",
        ) from exc

    drv = _pick_driver(c.driver)
    conn_str = (
        f"DRIVER={{{drv}}};"
        f"SERVER={c.server};"
        f"DATABASE={c.database};"
        f"UID={c.username};"
        f"PWD={c.password};"
        "TrustServerCertificate=yes;"
        "Encrypt=no;"
    )
    try:
        return pyodbc.connect(conn_str, timeout=10)
    except Exception as exc:
        # pyodbc errors are not safe to expose verbatim (they include the
        # connection string). Keep the message short and log the rest.
        log.warning("SAP connect failed: %s", exc)
        msg = str(exc)
        if "Login failed" in msg:
            raise HTTPException(401, "Identifiants SAP refusés.") from exc
        if "server was not found" in msg.lower() or "08001" in msg:
            raise HTTPException(502, f"Impossible de joindre {c.server!r}.") from exc
        raise HTTPException(500, f"Connexion SAP échouée: {msg[:200]}") from exc


def _run_query(c: SapCreds, sql: str) -> tuple[List[str], List[List[Any]]]:
    conn = _connect(c)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        cols = [d[0] for d in cur.description] if cur.description else []
        rows = [list(r) for r in cur.fetchall()]
        return cols, rows
    finally:
        conn.close()


# ---- Endpoints --------------------------------------------------------------

@router.post("/test")
def test_connection(c: SapCreds):
    """Verify the credentials by opening a connection and running SELECT 1.
    Returns the resolved ODBC driver name on success so the user knows which
    one was picked."""
    conn = _connect(c)
    try:
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
    finally:
        conn.close()
    return {"ok": True, "driver": _pick_driver(c.driver)}


class PreviewIn(SapCreds):
    limit: int = 25


class PreviewOut(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    total: int


@router.post("/preview", response_model=PreviewOut)
def preview(p: PreviewIn):
    """Run the warehouse query and return the column list, the total row
    count, plus the first `limit` rows for the UI table."""
    cols, all_rows = _run_query(p, IMPORT_QUERY)
    return PreviewOut(
        columns=cols,
        rows=all_rows[: max(0, int(p.limit))],
        total=len(all_rows),
    )


class ImportIn(SapCreds):
    # Override the default field→column mapping. Missing keys fall back to
    # `DEFAULT_MAPPING`. Keys must be one of `PRODUCT_FIELDS`.
    mapping: Optional[Dict[str, str]] = None
    # If True, replace the session's products list. If False, append.
    replace: bool = True


class ImportOut(BaseModel):
    loaded: int
    columns: List[str]


@router.post("/import", response_model=ImportOut)
def do_import(p: ImportIn, s: Session = Depends(with_session)):
    """Run the warehouse query and convert each row to a product dict using
    `mapping` (falling back to `DEFAULT_MAPPING`)."""
    mapping = {**DEFAULT_MAPPING, **(p.mapping or {})}
    # Reject mapping keys that aren't product fields — we'd write them and the
    # session normalizer would silently drop them, which is confusing.
    unknown = [k for k in mapping if k not in PRODUCT_FIELDS]
    if unknown:
        raise HTTPException(400, f"Champs inconnus dans mapping: {unknown}")

    cols, rows = _run_query(p, IMPORT_QUERY)
    col_idx = {name: i for i, name in enumerate(cols)}
    missing = [v for v in mapping.values() if v not in col_idx]
    if missing:
        raise HTTPException(
            400, f"Colonnes SAP absentes du résultat: {missing}. Disponibles: {cols}",
        )

    new_rows: List[Dict[str, Any]] = []
    for r in rows:
        row: Dict[str, Any] = {}
        for field, sap_col in mapping.items():
            row[field] = r[col_idx[sap_col]]
        new_rows.append(normalize_product(row))

    if p.replace:
        s.products = new_rows
    else:
        s.products.extend(new_rows)
    return ImportOut(loaded=len(new_rows), columns=cols)


@router.post("/export.xlsx")
def export_to_xlsx(p: SapCreds):
    """Run the query and stream the raw result as an .xlsx (no mapping
    applied) — useful when you want to inspect the data before importing."""
    from io import BytesIO
    from openpyxl import Workbook
    cols, rows = _run_query(p, IMPORT_QUERY)
    wb = Workbook()
    ws = wb.active
    ws.title = "SAP"
    ws.append(cols)
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return StreamingResponse(
        BytesIO(buf.getvalue()),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": 'attachment; filename="sap_export.xlsx"'},
    )
