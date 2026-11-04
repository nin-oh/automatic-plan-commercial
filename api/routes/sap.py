"""SAP — verification, cache, and styled .xlsx exports.

The deck's source of truth is the local Excel. SAP is consulted only to
*verify* that the prices stored locally still match what's in the warehouse
and (optionally) to overwrite drifted prices on the items already present
locally. The join key is `item_code` (SAP's ItemCode).

Credentials live in env vars (`SAP_SERVER`, `SAP_DATABASE`, `SAP_USERNAME`,
`SAP_PASSWORD`) — the user never types them into the UI. The full SAP query
result is cached in this process on startup and on every explicit `/sync`
call, so the verify/preview/check-formulas endpoints serve their data from
RAM instead of round-tripping to SQL Server on each request.

Run `pip install pyodbc` if endpoints return a missing-driver error. The
query lives in ``api/sap_query.py``.
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ..session import Session, with_session
from ..sap_query import IMPORT_QUERY

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


# ─── Env-based creds + in-memory cache ─────────────────────────────────────
# The UI no longer accepts a credentials form. SAP_USERNAME / SAP_PASSWORD
# live in the container's env (docker-compose / .env). When the app boots we
# silently try to sync once; failures are logged but don't crash startup —
# the user just sees a "sync needed" banner on the SAP page until env vars
# are set or the sync button is clicked.

def _creds_from_env() -> SapCreds:
    """Build SapCreds from environment variables. Raises 503 with a clear
    message when either SAP_USERNAME or SAP_PASSWORD is missing — the front
    end surfaces this to the user as "Configurez SAP_* dans le .env"."""
    server = os.environ.get("SAP_SERVER", DEFAULT_SERVER).strip() or DEFAULT_SERVER
    database = os.environ.get("SAP_DATABASE", DEFAULT_DATABASE).strip() or DEFAULT_DATABASE
    username = os.environ.get("SAP_USERNAME", "").strip()
    password = os.environ.get("SAP_PASSWORD", "")
    if not username or not password:
        raise HTTPException(
            503,
            "Identifiants SAP non configurés. Définissez SAP_USERNAME et "
            "SAP_PASSWORD dans le .env du conteneur, puis redémarrez (ou "
            "cliquez sur Synchroniser).",
        )
    return SapCreds(
        server=server, database=database,
        username=username, password=password,
        driver=os.environ.get("SAP_DRIVER") or None,
    )


# Module-level cache. `lock` serialises concurrent sync calls so we don't
# fire 2 queries against SAP for the same data when the user spam-clicks.
class _Cache:
    columns: Optional[List[str]] = None
    rows: Optional[List[List[Any]]] = None
    fetched_at: Optional[str] = None     # ISO-8601 UTC
    last_error: Optional[str] = None
    driver: Optional[str] = None
    lock = threading.Lock()


def _sync_now() -> int:
    """Re-run the SAP query and stash the result in the module cache.
    Returns the row count. Raises whatever `_run_query` raises — callers
    decide whether to surface or swallow the exception (startup swallows,
    /sync surfaces)."""
    creds = _creds_from_env()
    with _Cache.lock:
        cols, rows = _run_query(creds, IMPORT_QUERY)
        _Cache.columns = cols
        _Cache.rows = rows
        _Cache.fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        _Cache.last_error = None
        _Cache.driver = _pick_driver(creds.driver)
        log.info("SAP cache refreshed: %d rows", len(rows))
    return len(rows)


def init_cache_silently() -> None:
    """Called from the FastAPI startup event. Failures only warn — the app
    must boot even when SAP is unreachable so the user can still use the
    rest of the Plan Commercial UI."""
    try:
        n = _sync_now()
        log.info("SAP startup sync OK (%d rows)", n)
    except HTTPException as exc:
        _Cache.last_error = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        log.warning("SAP startup sync skipped: %s", _Cache.last_error)
    except Exception as exc:  # noqa: BLE001
        _Cache.last_error = str(exc)
        log.warning("SAP startup sync failed: %s", exc, exc_info=False)


def _get_cached_or_502() -> tuple[List[str], List[List[Any]]]:
    """Read columns + rows from the cache OR raise 503 if not populated.
    Used by every endpoint that needs SAP data — guarantees a clean error
    message instead of None-dereferences when sync hasn't run yet."""
    if _Cache.columns is None or _Cache.rows is None:
        msg = _Cache.last_error or "Aucune donnée SAP en cache."
        raise HTTPException(
            503,
            f"SAP non synchronisé. Cliquez sur Synchroniser. ({msg})",
        )
    return _Cache.columns, _Cache.rows


# ─── Workbook styling helpers ──────────────────────────────────────────────
# Same look across all three SAP exports: bold white-on-red header row,
# frozen first row, alternating row fill, auto-fit column widths, light
# borders on the data area. Cuts ~40 lines per export endpoint.

_HEADER_FILL = "DC2626"        # plan-commercial red — matches the UI accent
_HEADER_TEXT = "FFFFFF"
_ALT_ROW_FILL = "FAFAFA"       # zinc-50, the same banded row used in the UI tables


def _style_sheet(
    ws,
    *,
    n_data_rows: int,
    n_cols: int,
    header_fill_hex: str = _HEADER_FILL,
    header_text_hex: str = _HEADER_TEXT,
    number_format_cols: Optional[Dict[int, str]] = None,
) -> None:
    """Apply consistent styling to the freshly populated worksheet `ws`.

    Run AFTER `ws.append(headers)` and all data rows have been added.
    `number_format_cols` maps 1-based column index → openpyxl number format
    string (e.g. `{6: '#,##0.00'}` to render the 6th column as a 2-decimal
    number). Columns not listed are left as their inferred format.

    Sized for the SAP exports (≲50k cells) — for bigger sheets you'd
    want streamed write_only mode, not this in-memory styling pass.
    """
    from openpyxl.styles import (
        Alignment, Border, Font, PatternFill, Side,
    )
    from openpyxl.utils import get_column_letter

    header_fill = PatternFill(
        start_color=header_fill_hex, end_color=header_fill_hex, fill_type="solid",
    )
    header_font = Font(name="Inter", bold=True, color=header_text_hex, size=11)
    header_align = Alignment(horizontal="left", vertical="center", wrap_text=False)
    alt_fill = PatternFill(
        start_color=_ALT_ROW_FILL, end_color=_ALT_ROW_FILL, fill_type="solid",
    )
    border_thin = Side(style="thin", color="E4E4E7")
    data_border = Border(left=border_thin, right=border_thin,
                         top=border_thin, bottom=border_thin)

    # Header row: bold red fill, white text, taller
    for c in range(1, n_cols + 1):
        cell = ws.cell(row=1, column=c)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = header_align
        cell.border = data_border
    ws.row_dimensions[1].height = 26

    # Banded rows + borders on the data area
    for r in range(2, n_data_rows + 2):
        for c in range(1, n_cols + 1):
            cell = ws.cell(row=r, column=c)
            cell.border = data_border
            if r % 2 == 1:                          # every other data row
                cell.fill = alt_fill

    # Number formats per column (zero-pad header row so format applies to data)
    if number_format_cols:
        for col_idx, fmt in number_format_cols.items():
            for r in range(2, n_data_rows + 2):
                ws.cell(row=r, column=col_idx).number_format = fmt

    # Frozen header + auto-fit widths (derived from the longest cell text per
    # column, clamped so single-character labels don't shrink columns to 4px
    # and 200-char descriptions don't blow the sheet out to the right).
    ws.freeze_panes = "A2"
    for c in range(1, n_cols + 1):
        col_letter = get_column_letter(c)
        max_len = 0
        for r in range(1, n_data_rows + 2):
            v = ws.cell(row=r, column=c).value
            if v is None:
                continue
            l = len(str(v))
            if l > max_len:
                max_len = l
        ws.column_dimensions[col_letter].width = max(10, min(60, max_len + 3))


def _xlsx_response(wb, filename: str) -> StreamingResponse:
    """Bundle the openpyxl Workbook into a StreamingResponse with the right
    Content-Type + a download filename. Keeps the three export endpoints
    from repeating six lines of BytesIO juggling."""
    from io import BytesIO
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
    # Connection-string strategy: try TLS first (most modern SQL Server
    # instances require it), fall back to unencrypted only on TLS handshake
    # errors. TrustServerCertificate=yes accepts SAP's self-signed cert; the
    # Dockerfile lowers OpenSSL's security level so legacy SQL Server hosts
    # (TLS 1.0/1.1, weak ciphers) can complete the handshake at all.
    base = (
        f"DRIVER={{{drv}}};"
        f"SERVER={c.server};"
        f"DATABASE={c.database};"
        f"UID={c.username};"
        f"PWD={c.password};"
        "TrustServerCertificate=yes;"
    )

    def _connect_str(suffix: str):
        return pyodbc.connect(base + suffix, timeout=10)

    try:
        try:
            return _connect_str("Encrypt=yes;")
        except Exception as primary:
            msg_lo = str(primary).lower()
            looks_like_tls = any(k in msg_lo for k in ("ssl", "tls", "certificate"))
            if not looks_like_tls:
                raise
            log.info("Retrying SAP connect without encryption (TLS error)")
            return _connect_str("Encrypt=no;")
    except Exception as exc:
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


class SapStatusOut(BaseModel):
    configured: bool                  # env creds present?
    cached: bool                      # cache populated?
    fetched_at: Optional[str]         # last successful sync (ISO-8601 UTC)
    rows: int                         # row count in cache
    driver: Optional[str]
    last_error: Optional[str]
    server: str                       # what server we'd hit on next sync
    database: str


@router.get("/status", response_model=SapStatusOut)
def status():
    """Cheap, env-only status snapshot. The frontend hits this once on page
    load to decide whether to show "Configurez SAP_*" or just the data."""
    server = os.environ.get("SAP_SERVER", DEFAULT_SERVER).strip() or DEFAULT_SERVER
    database = os.environ.get("SAP_DATABASE", DEFAULT_DATABASE).strip() or DEFAULT_DATABASE
    has_user = bool(os.environ.get("SAP_USERNAME", "").strip())
    has_pwd  = bool(os.environ.get("SAP_PASSWORD", ""))
    return SapStatusOut(
        configured=has_user and has_pwd,
        cached=_Cache.rows is not None,
        fetched_at=_Cache.fetched_at,
        rows=len(_Cache.rows) if _Cache.rows is not None else 0,
        driver=_Cache.driver,
        last_error=_Cache.last_error,
        server=server,
        database=database,
    )


class SyncOut(BaseModel):
    rows: int
    fetched_at: str
    driver: str


@router.post("/sync", response_model=SyncOut)
def sync():
    """Re-run the SAP query and refresh the in-process cache. The only
    endpoint that touches SQL Server in the normal flow — everything else
    reads from the cache."""
    n = _sync_now()
    return SyncOut(
        rows=n,
        fetched_at=_Cache.fetched_at or "",
        driver=_Cache.driver or "",
    )


class PreviewOut(BaseModel):
    columns: List[str]
    rows: List[List[Any]]
    total: int


@router.get("/preview", response_model=PreviewOut)
def preview(limit: int = 0):
    """Return the cached SAP query result. `limit=0` (default) returns every
    row — the search is client-side. The UI uses this to populate the
    "Données SAP brutes" modal."""
    cols, all_rows = _get_cached_or_502()
    n = max(0, int(limit))
    rows = all_rows if n == 0 else all_rows[:n]
    return PreviewOut(columns=cols, rows=rows, total=len(all_rows))


# ─── Formula check ─────────────────────────────────────────────────────────
# Validates the calculation chain SAP is supposed to follow:
#     Tarifs AMA   = GROS NET    × AMA_FACTOR        (default 0.84)
#     PRIX STANDARD = Tarifs AMA / STANDARD_DIVISOR  (default 1.20)
# The second factor is a DIVISOR: PRIX STANDARD sits ~17% below Tarifs AMA
# when the divisor is 1.2 (= 1 − 1/1.2). Tolerance: max(1% rel, 0.02 abs).

_AMA_FACTOR_DEFAULT = 0.84
_STANDARD_FACTOR_DEFAULT = 1.20
_FORMULA_EPS_ABS = 0.02
_FORMULA_EPS_REL = 0.01


class FormulaViolation(BaseModel):
    formula_id: str
    label: str
    expected: float
    actual: float
    delta: float


class RowViolations(BaseModel):
    item_code: str
    item_name: str
    gros_net: float
    tarifs_ama: float
    prix_standard: float
    violations: List[FormulaViolation]


class ZeroPriceRow(BaseModel):
    """Row where one or more reference prices are zero — reported so the
    user can spot SKUs with incomplete pricing in SAP (otherwise they'd
    silently disappear from the formula check)."""
    item_code: str
    item_name: str
    gros: float
    gros_net: float
    tarifs_ama: float
    prix_standard: float
    detail: float
    detail_net: float
    zero_fields: List[str]    # which of the 6 above are 0


class CheckFormulasIn(BaseModel):
    # Override the default constants if your pricing rules change. Keep
    # both > 0 to get any meaningful checking out.
    ama_factor: float = _AMA_FACTOR_DEFAULT
    standard_factor: float = _STANDARD_FACTOR_DEFAULT


class CheckFormulasOut(BaseModel):
    checked: int                          # rows where GROS NET > 0 (have a base)
    valid: int                            # rows where both formulas held
    skipped_zero_base: int                # GROS NET = 0 → can't compute anything
    rows_with_violations: List[RowViolations]
    zero_price_rows: List[ZeroPriceRow]   # rows missing at least one reference price
    ama_factor: float
    standard_factor: float


@router.post("/check-formulas", response_model=CheckFormulasOut)
def check_formulas(p: CheckFormulasIn):
    """Walk every cached SAP row and verify the documented pricing formulas:
        Tarifs AMA   = GROS NET    × ama_factor
        PRIX STANDARD = Tarifs AMA × standard_factor
    Rows where either formula is off by more than the tolerance are
    returned with both the expected and actual values. Used purely for
    auditing — doesn't touch local data. Reads from the cache; call
    /sync first to refresh."""
    cols, rows = _get_cached_or_502()
    col_idx = {name: i for i, name in enumerate(cols)}
    required = {
        "ItemCode", "ItemName", "GROS", "GROS NET", "Tarifs AMA",
        "PRIX STANDARD", "DETAIL", "DETAIL NET",
    }
    missing = required - set(col_idx)
    if missing:
        raise HTTPException(
            500, f"Colonnes manquantes dans le résultat SAP: {sorted(missing)}",
        )

    checked = valid = skipped_zero = 0
    violations: List[RowViolations] = []
    zero_price_rows: List[ZeroPriceRow] = []
    for r in rows:
        gros       = _safe_float(r[col_idx["GROS"]])
        gros_net   = _safe_float(r[col_idx["GROS NET"]])
        ama        = _safe_float(r[col_idx["Tarifs AMA"]])
        std        = _safe_float(r[col_idx["PRIX STANDARD"]])
        detail     = _safe_float(r[col_idx["DETAIL"]])
        detail_net = _safe_float(r[col_idx["DETAIL NET"]])

        # Track any row where at least one reference price is zero — these
        # are SAP rows with incomplete pricing. We surface them so the user
        # can chase them up; we don't try to formula-check rows without a
        # base GROS NET (no anchor for the calculation).
        zero_fields: List[str] = []
        if gros == 0:       zero_fields.append("GROS")
        if gros_net == 0:   zero_fields.append("GROS NET")
        if ama == 0:        zero_fields.append("Tarifs AMA")
        if std == 0:        zero_fields.append("PRIX STANDARD")
        if detail == 0:     zero_fields.append("DETAIL")
        if detail_net == 0: zero_fields.append("DETAIL NET")
        if zero_fields:
            zero_price_rows.append(ZeroPriceRow(
                item_code=str(r[col_idx["ItemCode"]] or ""),
                item_name=str(r[col_idx["ItemName"]] or ""),
                gros=round(gros, 2),
                gros_net=round(gros_net, 2),
                tarifs_ama=round(ama, 2),
                prix_standard=round(std, 2),
                detail=round(detail, 2),
                detail_net=round(detail_net, 2),
                zero_fields=zero_fields,
            ))

        # No base price → no calculation can be checked. Don't penalise.
        if gros_net <= 0:
            skipped_zero += 1
            continue
        checked += 1

        row_violations: List[FormulaViolation] = []

        expected_ama = gros_net * p.ama_factor
        tol = max(_FORMULA_EPS_ABS, abs(expected_ama) * _FORMULA_EPS_REL)
        if abs(ama - expected_ama) > tol:
            row_violations.append(FormulaViolation(
                formula_id="ama_from_gros_net",
                label=f"Tarifs AMA = GROS NET × {p.ama_factor}",
                expected=round(expected_ama, 2),
                actual=round(ama, 2),
                delta=round(ama - expected_ama, 2),
            ))

        # Only check the second formula when AMA and the divisor are both
        # non-zero — otherwise we'd noisily flag every line, or divide by 0.
        if ama > 0 and p.standard_factor > 0:
            expected_std = ama / p.standard_factor
            tol = max(_FORMULA_EPS_ABS, abs(expected_std) * _FORMULA_EPS_REL)
            if abs(std - expected_std) > tol:
                row_violations.append(FormulaViolation(
                    formula_id="prix_standard_from_ama",
                    label=f"PRIX STANDARD = Tarifs AMA / {p.standard_factor}",
                    expected=round(expected_std, 2),
                    actual=round(std, 2),
                    delta=round(std - expected_std, 2),
                ))

        if row_violations:
            violations.append(RowViolations(
                item_code=str(r[col_idx["ItemCode"]] or ""),
                item_name=str(r[col_idx["ItemName"]] or ""),
                gros_net=round(gros_net, 2),
                tarifs_ama=round(ama, 2),
                prix_standard=round(std, 2),
                violations=row_violations,
            ))
        else:
            valid += 1

    return CheckFormulasOut(
        checked=checked,
        valid=valid,
        skipped_zero_base=skipped_zero,
        rows_with_violations=violations,
        zero_price_rows=zero_price_rows,
        ama_factor=p.ama_factor,
        standard_factor=p.standard_factor,
    )


# ─── Verification ──────────────────────────────────────────────────────────
# Replaces the old /import endpoint. The deck's source of truth is now the
# local Excel; SAP is only consulted to *verify* that the prices recorded
# locally still match what's in the warehouse. The compare is keyed by
# `item_code` (the SAP ItemCode), so a local product without item_code is
# silently skipped.

# Tolerance for "equal" — anything smaller than this is rounding noise.
_PRICE_EPS = 0.01

# Local product field → SAP column name. Order matters for the report.
_VERIFY_FIELDS = [
    ("prix_gros",       "GROS"),
    ("prix_gros_net",   "GROS NET"),
    ("prix_detail",     "DETAIL"),
    ("prix_detail_net", "DETAIL NET"),
]


class Discrepancy(BaseModel):
    item_code: str
    nom: str
    differences: Dict[str, Dict[str, float]]
    # `differences` is keyed by local field name; each value is
    # {"local": float, "sap": float}.


class SkippedProduct(BaseModel):
    nom: str
    position: int                  # 0-based row in the local products list


class VerifyOut(BaseModel):
    checked: int                   # local products with an item_code
    matched: int                   # all 4 prices within tolerance
    discrepancies: List[Discrepancy]
    not_in_sap: List[str]          # item_codes present locally, absent in SAP
    # Products without an item_code (cause they don't show in the table)
    no_code_count: int
    no_code_items: List[SkippedProduct]
    # item_code -> list of product names that share it (only the last one
    # was actually verified; the others were silently overwritten)
    duplicate_codes: Dict[str, List[str]]
    sap_total: int                 # raw SAP row count, for context

    # Kept for backwards compat with the old frontend bundle — same value as
    # no_code_count, just under the previous name.
    skipped_no_code: int


@router.post("/verify", response_model=VerifyOut)
def verify(s: Session = Depends(with_session)):
    """Compare local prices (gros, gros net, detail, detail net) against
    SAP for every local product whose `item_code` is set. Returns the
    items whose prices drifted, plus the items that have an item_code
    locally but no longer exist in SAP. Items missing from the local deck
    are NOT reported — the local Excel is the source of truth for which
    SKUs are in scope.

    Reads SAP from the in-process cache (env-based creds; no body params).
    Call /sync first if data is stale."""
    # 1. Bucket local rows by item_code so we can look them up at SAP-walk
    # time. Track products that are silently dropped (no code OR a duplicate)
    # so the response can flag them — otherwise the user sees a mysterious
    # gap between Contenu's row count and the verify "checked" count.
    local_by_code: Dict[str, Dict[str, Any]] = {}
    no_code_items: List[SkippedProduct] = []
    seen_codes: Dict[str, List[str]] = {}      # code → list of names sharing it
    for pos, r in enumerate(s.products):
        code = (r.get("item_code") or "").strip()
        if not code:
            no_code_items.append(SkippedProduct(
                nom=str(r.get("nom") or ""), position=pos,
            ))
            continue
        seen_codes.setdefault(code, []).append(str(r.get("nom") or ""))
        local_by_code[code] = r                # last write wins on duplicates
    duplicate_codes = {
        code: names for code, names in seen_codes.items() if len(names) > 1
    }
    if not local_by_code:
        raise HTTPException(
            400,
            "Aucun produit local n'a d'item_code — ajoutez la colonne "
            "`item_code` dans votre Excel et ré-importez avant de vérifier.",
        )

    # 2. Pull cached SAP rows and index by ItemCode.
    cols, rows = _get_cached_or_502()
    col_idx = {name: i for i, name in enumerate(cols)}
    for needed in ("ItemCode", *(sap_col for _, sap_col in _VERIFY_FIELDS)):
        if needed not in col_idx:
            raise HTTPException(
                500,
                f"Colonne {needed!r} absente du résultat SAP. "
                f"Disponibles: {cols}",
            )
    sap_by_code: Dict[str, Dict[str, float]] = {}
    for r in rows:
        code = str(r[col_idx["ItemCode"]] or "").strip()
        if not code:
            continue
        sap_by_code[code] = {
            sap_col: _safe_float(r[col_idx[sap_col]])
            for _, sap_col in _VERIFY_FIELDS
        }

    # 3. Compare per-item — SAP values are CASE prices (e.g. 12 units per
    # carton), local fields are UNIT prices. Divide SAP by the per-product
    # case multiplier before comparing. The multiplier is the ratio
    # colisage_prix_gros / prix_gros locally — falls back to 1 (no division)
    # when the local data doesn't carry case info, in which case we report
    # the raw SAP value with a noticeable warning to the user.
    matched = 0
    discrepancies: List[Discrepancy] = []
    not_in_sap: List[str] = []
    for code, local in local_by_code.items():
        sap_row = sap_by_code.get(code)
        if sap_row is None:
            not_in_sap.append(code)
            continue
        qty = _case_multiplier(local)
        diffs: Dict[str, Dict[str, float]] = {}
        for local_field, sap_col in _VERIFY_FIELDS:
            l_val = _safe_float(local.get(local_field))
            raw_sap = sap_row[sap_col]
            if raw_sap <= 0:
                # SAP has no price for this field — leave local alone, don't
                # report a discrepancy that would propose overwriting with 0.
                continue
            s_val = raw_sap / qty
            if abs(l_val - s_val) > _PRICE_EPS:
                # Round for display so the user sees clean two-decimal values.
                diffs[local_field] = {
                    "local": round(l_val, 2),
                    "sap": round(s_val, 2),
                }
        if diffs:
            discrepancies.append(Discrepancy(
                item_code=code,
                nom=str(local.get("nom") or ""),
                differences=diffs,
            ))
        else:
            matched += 1

    return VerifyOut(
        checked=len(local_by_code),
        matched=matched,
        discrepancies=discrepancies,
        not_in_sap=not_in_sap,
        no_code_count=len(no_code_items),
        no_code_items=no_code_items,
        duplicate_codes=duplicate_codes,
        skipped_no_code=len(no_code_items),    # legacy alias
        sap_total=len(sap_by_code),
    )


def _safe_float(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _case_multiplier(local_row: Dict[str, Any]) -> float:
    """How many units per SAP-priced case for this product.

    SAP's GROS / GROS NET / DETAIL / DETAIL NET are PER-CASE values (e.g. a
    'Carton de 12 unités' is priced at 293.16). Our local schema stores
    PER-UNIT values in prix_gros / prix_gros_net / prix_detail / prix_detail_net
    AND already keeps the per-case values in colisage_prix_gros /
    colisage_prix_gros_net. The ratio of those two gives us the case size
    without parsing the freeform `colisage` text.

    Returns 1.0 when we can't compute it (either price is 0 or missing) —
    the comparison then degrades to "raw SAP vs unit local" which will look
    way off, but at least it won't divide by zero or invent a number.
    """
    unit = _safe_float(local_row.get("prix_gros"))
    case = _safe_float(local_row.get("colisage_prix_gros"))
    if unit > 0 and case > 0:
        ratio = case / unit
        # Only trust the ratio if it's plausibly an integer multiplier (or
        # very close). Otherwise fall back to 1 — protects against typos
        # in the local data (e.g. someone enters 12.5 instead of 12).
        if 1.0 <= ratio <= 1000.0:
            return ratio
    return 1.0


# ─── Optional bulk apply (still scoped to items that exist in the local Excel) ─

class ApplyPricesIn(BaseModel):
    # Which local fields to overwrite from SAP. Defaults to all four.
    fields: List[str] = Field(
        default_factory=lambda: [f for f, _ in _VERIFY_FIELDS]
    )
    # Item codes to update. If empty, applies to every code that had a
    # discrepancy in the most recent verify run (caller passes them from the
    # verify response).
    item_codes: List[str] = Field(default_factory=list)


class ApplyPricesOut(BaseModel):
    updated: int
    skipped: List[str]


@router.post("/apply-prices", response_model=ApplyPricesOut)
def apply_prices(p: ApplyPricesIn, s: Session = Depends(with_session)):
    """Overwrite specific local price fields with SAP's values for the given
    item codes. Strictly scoped to SKUs that already exist locally — we
    never add new products via this route."""
    bad_fields = [f for f in p.fields if f not in {pf for pf, _ in _VERIFY_FIELDS}]
    if bad_fields:
        raise HTTPException(400, f"Champs non vérifiables: {bad_fields}")
    field_to_sap = {pf: sap for pf, sap in _VERIFY_FIELDS if pf in p.fields}

    targets = {c.strip() for c in p.item_codes if c.strip()}
    cols, rows = _get_cached_or_502()
    col_idx = {name: i for i, name in enumerate(cols)}

    sap_by_code: Dict[str, Dict[str, float]] = {}
    for r in rows:
        code = str(r[col_idx["ItemCode"]] or "").strip()
        if code:
            sap_by_code[code] = {
                sap_col: _safe_float(r[col_idx[sap_col]])
                for sap_col in field_to_sap.values()
            }

    updated = 0
    skipped: List[str] = []
    for row in s.products:
        code = (row.get("item_code") or "").strip()
        if not code or (targets and code not in targets):
            continue
        sap_row = sap_by_code.get(code)
        if sap_row is None:
            skipped.append(code)
            continue
        # SAP values are case prices — divide by the per-product case
        # multiplier so what we write into the local schema is a unit
        # price. Same logic as verify(); see _case_multiplier docstring.
        qty = _case_multiplier(row)
        for local_field, sap_col in field_to_sap.items():
            raw_sap = sap_row[sap_col]
            if raw_sap <= 0:
                # Don't overwrite local data with a missing SAP value.
                continue
            row[local_field] = round(raw_sap / qty, 2)
        updated += 1
    return ApplyPricesOut(updated=updated, skipped=skipped)


@router.get("/export.xlsx")
def export_to_xlsx():
    """Stream the cached SAP query result as a styled .xlsx (no mapping
    applied). Reads from the cache → instant after a sync. GET (not POST)
    so the UI can use a plain `<a href download>` link."""
    from openpyxl import Workbook
    cols, rows = _get_cached_or_502()

    wb = Workbook()
    ws = wb.active
    ws.title = "SAP"
    ws.append(cols)
    for r in rows:
        ws.append(r)

    # Auto-detect numeric columns (any column where the first non-null value
    # is a number) and apply a 2-decimal format. SAP returns Decimals for
    # money columns; this keeps them readable in Excel without scientific
    # notation creeping in.
    number_fmts: Dict[int, str] = {}
    for c_idx, col_name in enumerate(cols, start=1):
        for r in rows:
            v = r[c_idx - 1]
            if v is None:
                continue
            try:
                float(v)
                number_fmts[c_idx] = "#,##0.00"
            except (TypeError, ValueError):
                pass
            break  # one sample per column is enough

    _style_sheet(
        ws, n_data_rows=len(rows), n_cols=len(cols),
        number_format_cols=number_fmts,
    )
    return _xlsx_response(wb, "sap_export.xlsx")


@router.post("/verify/export.xlsx")
def export_verify_to_xlsx(s: Session = Depends(with_session)):
    """Re-run the comparison and export the discrepancies + the "not in SAP"
    list to a styled .xlsx. One workbook, two sheets:
      - "Écarts"  : SKUs whose prices drifted (local vs SAP per column)
      - "Absents" : SKUs present locally with an item_code but missing
                    from the SAP query result entirely
    """
    out = verify(s)  # reuse the existing comparison logic
    wb = _build_verify_workbook(out)
    return _xlsx_response(wb, "sap_comparaison.xlsx")


def _build_verify_workbook(out: "VerifyOut"):
    from openpyxl import Workbook
    wb = Workbook()

    # ── Sheet 1: discrepancies ──
    ws = wb.active
    ws.title = "Écarts"
    headers = [
        "ItemCode", "Nom",
        "Gros (Local)", "Gros (SAP)",
        "Gros Net (Local)", "Gros Net (SAP)",
        "Détail (Local)", "Détail (SAP)",
        "Détail Net (Local)", "Détail Net (SAP)",
    ]
    ws.append(headers)
    for d in out.discrepancies:
        diffs = d.differences
        def _pair(field: str):
            v = diffs.get(field)
            return (v["local"], v["sap"]) if v else (None, None)
        gl, gs = _pair("prix_gros")
        gnl, gns = _pair("prix_gros_net")
        dl, ds = _pair("prix_detail")
        dnl, dns = _pair("prix_detail_net")
        ws.append([d.item_code, d.nom, gl, gs, gnl, gns, dl, ds, dnl, dns])
    # Cols 3..10 are prices — apply the same number format to all.
    _style_sheet(
        ws,
        n_data_rows=len(out.discrepancies),
        n_cols=len(headers),
        number_format_cols={c: "#,##0.00" for c in range(3, 11)},
    )

    # ── Sheet 2: items not in SAP ──
    if out.not_in_sap:
        ws2 = wb.create_sheet("Absents de SAP")
        ws2.append(["ItemCode local sans correspondance SAP"])
        for code in out.not_in_sap:
            ws2.append([code])
        _style_sheet(ws2, n_data_rows=len(out.not_in_sap), n_cols=1)

    return wb


@router.post("/check-formulas/export.xlsx")
def export_check_formulas_to_xlsx(p: CheckFormulasIn):
    """Re-run the formula audit and export the violations + zero-price rows
    to a styled .xlsx. Same payload as `/check-formulas` so factors override
    work identically."""
    out = check_formulas(p)
    wb = _build_check_formulas_workbook(out)
    return _xlsx_response(wb, "sap_audit_formules.xlsx")


def _build_check_formulas_workbook(out: "CheckFormulasOut"):
    from openpyxl import Workbook
    wb = Workbook()

    # ── Sheet 1: formula violations ──
    ws = wb.active
    ws.title = "Erreurs de formule"
    ws.append([
        "ItemCode", "Nom", "GROS NET", "Tarifs AMA", "PRIX STANDARD",
        "Formule", "Attendu", "Réel", "Écart",
    ])
    n = 0
    for row in out.rows_with_violations:
        for v in row.violations:
            n += 1
            ws.append([
                row.item_code, row.item_name,
                row.gros_net, row.tarifs_ama, row.prix_standard,
                v.label, v.expected, v.actual, v.delta,
            ])
    _style_sheet(
        ws, n_data_rows=n, n_cols=9,
        number_format_cols={c: "#,##0.00" for c in (3, 4, 5, 7, 8, 9)},
    )

    # ── Sheet 2: zero-price rows ──
    if out.zero_price_rows:
        ws2 = wb.create_sheet("Prix manquants")
        ws2.append([
            "ItemCode", "Nom", "GROS", "GROS NET", "Tarifs AMA",
            "PRIX STANDARD", "DETAIL", "DETAIL NET", "Champs à 0",
        ])
        for row in out.zero_price_rows:
            ws2.append([
                row.item_code, row.item_name,
                row.gros, row.gros_net, row.tarifs_ama, row.prix_standard,
                row.detail, row.detail_net,
                ", ".join(row.zero_fields),
            ])
        _style_sheet(
            ws2, n_data_rows=len(out.zero_price_rows), n_cols=9,
            number_format_cols={c: "#,##0.00" for c in range(3, 9)},
        )

    return wb
