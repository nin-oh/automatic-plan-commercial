"""Single-user session for the Plan Commercial backend, persisted in SQLite.

The session is the live "deck-being-edited" state: deck meta (titre / canal /
mois / banner / …), the products list, and the global image filenames. It is
loaded into a `Session` dataclass on first access and flushed back to disk
after every API call that mutates it.

Storage layout (controlled by the ``PC_DATA_DIR`` environment variable):

    $PC_DATA_DIR/                   ← single mountable volume
    ├── images/                     ← user-uploaded packshots & logos
    ├── archive/                    ← generated .pptx / .pdf / sidecar .xlsx
    └── state.db                    ← SQLite with deck_meta + products tables

When ``PC_DATA_DIR`` is unset (typical for local `run_dev.bat` use), we fall
back to the project-relative layout that pre-dated this refactor so existing
installs keep working without manual file moves.

On first start with a fresh DB, if the legacy ``session.json`` is found next
to where the DB now lives, its contents are imported into the new schema and
the JSON file is renamed to ``session.json.bak`` so the migration is
reversible.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

log = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve_data_dir() -> Path:
    """Pick the on-disk root for everything mutable.

    - ``PC_DATA_DIR`` set      → use that path as-is. Production / Docker path.
    - ``PC_DATA_DIR`` unset    → keep the original project-relative layout so
      existing dev machines don't lose access to their images/ + archive/.
    """
    env = os.environ.get("PC_DATA_DIR")
    if env:
        return Path(env).resolve()
    # Legacy: data scattered under the project root. Images and the session
    # both live under assets/, archive under the project root.
    return PROJECT_ROOT


DATA_DIR = _resolve_data_dir()
_USE_ENV_LAYOUT = bool(os.environ.get("PC_DATA_DIR"))

if _USE_ENV_LAYOUT:
    IMAGE_DIR    = DATA_DIR / "images"
    ARCHIVE_DIR  = DATA_DIR / "archive"
    DB_FILE      = DATA_DIR / "state.db"
    # Legacy JSON lives next to the new DB so a one-time migration picks it up
    # if the user populated $PC_DATA_DIR by hand-copying the old layout.
    LEGACY_SESSION_JSON = DATA_DIR / "session.json"
else:
    IMAGE_DIR    = PROJECT_ROOT / "assets" / "images"
    ARCHIVE_DIR  = PROJECT_ROOT / "archive"
    DB_FILE      = PROJECT_ROOT / "assets" / "state.db"
    LEGACY_SESSION_JSON = PROJECT_ROOT / "assets" / "session.json"

# Kept for callers that imported the old constant — points at the DB now.
SESSION_FILE = DB_FILE

# Make sure the writable dirs exist before any route tries to read from them.
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
DB_FILE.parent.mkdir(parents=True, exist_ok=True)

# Print the resolved layout on startup so the user can confirm at a glance
# whether PC_DATA_DIR took effect (or whether the slow path under OneDrive
# is still in use).
print(
    f"[session] PC_DATA_DIR={'<unset>' if not _USE_ENV_LAYOUT else os.environ['PC_DATA_DIR']}"
    f"\n[session] DB_FILE     = {DB_FILE}"
    f"\n[session] IMAGE_DIR   = {IMAGE_DIR}"
    f"\n[session] ARCHIVE_DIR = {ARCHIVE_DIR}",
    flush=True,
)


# ─── Product schema ────────────────────────────────────────────────────────
# Same column order as PRODUIT_COLS — we keep the products list as plain dicts
# so the wire format == the storage format == what the frontend SmartTable wants.
PRODUCT_FIELDS = [
    "groupe", "sous_groupe", "nom",
    "packshot", "nom_image",
    "prix_gros", "prix_gros_net",
    "colisage", "colisage_prix_gros", "colisage_prix_gros_net",
    "logo_groupe",
    "is_promo", "type_promo",
    "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct",
    "promo_texte",
    "promo_carton_left", "promo_carton_right",
    "promo_ribbon_left", "promo_ribbon_right",
    "promo_carton_image", "promo_ribbon_image",
    "promo_remise_image", "promo_gratuite_image",
    "packshot_left", "packshot_top", "packshot_width", "packshot_height",
]

NUMERIC_FLOAT = {
    "prix_gros", "prix_gros_net",
    "colisage_prix_gros", "colisage_prix_gros_net",
    "promo_remise_pct",
    "packshot_left", "packshot_top",
    "packshot_width", "packshot_height",
}
NUMERIC_INT = {"promo_achat_qte", "promo_gratuit_qte"}
BOOL_FIELDS = {
    "is_promo",
    "promo_carton_left", "promo_carton_right",
    "promo_ribbon_left", "promo_ribbon_right",
}
STRING_FIELDS = [
    f for f in PRODUCT_FIELDS
    if f not in NUMERIC_FLOAT and f not in NUMERIC_INT and f not in BOOL_FIELDS
]


def blank_product() -> Dict[str, Any]:
    out: Dict[str, Any] = {f: "" for f in PRODUCT_FIELDS}
    for f in NUMERIC_FLOAT:
        out[f] = 0.0
    for f in NUMERIC_INT:
        out[f] = 0
    for f in BOOL_FIELDS:
        out[f] = False
    return out


def normalize_product(row: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce types so every product dict has stable keys/types."""
    out = blank_product()
    out.update({k: v for k, v in row.items() if k in PRODUCT_FIELDS})
    for f in NUMERIC_FLOAT:
        try:
            out[f] = float(out.get(f) or 0)
        except (TypeError, ValueError):
            out[f] = 0.0
    for f in NUMERIC_INT:
        try:
            out[f] = int(out.get(f) or 0)
        except (TypeError, ValueError):
            out[f] = 0
    for f in BOOL_FIELDS:
        out[f] = bool(out.get(f) or False)
    for f in STRING_FIELDS:
        out[f] = "" if out.get(f) is None else str(out.get(f))
    return out


@dataclass
class Session:
    titre: str = "Plan Commercial"
    canal: str = "Canal Gros"
    mois: str = "Avril 2026"
    banner: Optional[str] = None       # filename in IMAGE_DIR (None = built-in)
    background: Optional[str] = None
    cover_photo: Optional[str] = None
    products: List[Dict[str, Any]] = field(default_factory=list)

    # to_dict / from_dict are kept around because the SAP import + Excel
    # roundtrip code already speak that vocabulary. They're now thin shims
    # over the dataclass fields; storage lives in SQLite.
    def to_dict(self) -> Dict[str, Any]:
        return {
            "titre": self.titre,
            "canal": self.canal,
            "mois": self.mois,
            "banner": self.banner,
            "background": self.background,
            "cover_photo": self.cover_photo,
            "products": [normalize_product(p) for p in self.products],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Session":
        return cls(
            titre=str(data.get("titre") or "Plan Commercial"),
            canal=str(data.get("canal") or "Canal Gros"),
            mois=str(data.get("mois") or "Avril 2026"),
            banner=data.get("banner") or None,
            background=data.get("background") or None,
            cover_photo=data.get("cover_photo") or None,
            products=[normalize_product(p) for p in (data.get("products") or [])],
        )


# ─── SQLite backend ────────────────────────────────────────────────────────

_META_KEYS = ("titre", "canal", "mois", "banner", "background", "cover_photo")

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS deck_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS products (
    position                INTEGER PRIMARY KEY,
    groupe                  TEXT    DEFAULT '',
    sous_groupe             TEXT    DEFAULT '',
    nom                     TEXT    DEFAULT '',
    packshot                TEXT    DEFAULT '',
    nom_image               TEXT    DEFAULT '',
    prix_gros               REAL    DEFAULT 0,
    prix_gros_net           REAL    DEFAULT 0,
    colisage                TEXT    DEFAULT '',
    colisage_prix_gros      REAL    DEFAULT 0,
    colisage_prix_gros_net  REAL    DEFAULT 0,
    logo_groupe             TEXT    DEFAULT '',
    is_promo                INTEGER DEFAULT 0,
    type_promo              TEXT    DEFAULT '',
    promo_achat_qte         INTEGER DEFAULT 0,
    promo_gratuit_qte       INTEGER DEFAULT 0,
    promo_remise_pct        REAL    DEFAULT 0,
    promo_texte             TEXT    DEFAULT '',
    promo_carton_left       INTEGER DEFAULT 0,
    promo_carton_right      INTEGER DEFAULT 0,
    promo_ribbon_left       INTEGER DEFAULT 0,
    promo_ribbon_right      INTEGER DEFAULT 0,
    promo_carton_image      TEXT    DEFAULT '',
    promo_ribbon_image      TEXT    DEFAULT '',
    promo_remise_image      TEXT    DEFAULT '',
    promo_gratuite_image    TEXT    DEFAULT '',
    packshot_left           REAL    DEFAULT 0,
    packshot_top            REAL    DEFAULT 0,
    packshot_width          REAL    DEFAULT 0,
    packshot_height         REAL    DEFAULT 0
);
"""

_lock = threading.RLock()
_db: Optional[sqlite3.Connection] = None
_session: Optional[Session] = None


def _connect() -> sqlite3.Connection:
    """Open the DB with crash-safe defaults. `check_same_thread=False` lets
    us share one connection across uvicorn's thread pool — all DB calls are
    serialised through `_lock` so the connection isn't accessed concurrently."""
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # WAL = readers don't block writers; survives crashes mid-write.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(_SCHEMA_SQL)
    return conn


def _get_db() -> sqlite3.Connection:
    global _db
    if _db is None:
        _db = _connect()
        _migrate_legacy_json(_db)
    return _db


def _migrate_legacy_json(conn: sqlite3.Connection) -> None:
    """One-time import: if `state.db` is fresh (no rows) and a pre-refactor
    ``session.json`` is sitting next to where the DB lives, lift its contents
    into the DB and rename the JSON to ``session.json.bak``."""
    count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
    meta_count = conn.execute("SELECT COUNT(*) FROM deck_meta").fetchone()[0]
    if count > 0 or meta_count > 0:
        return
    src = LEGACY_SESSION_JSON
    if not src.exists():
        return
    try:
        data = json.loads(src.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log.warning("Cannot read legacy %s: %s", src, exc)
        return
    legacy = Session.from_dict(data)
    _write_session(conn, legacy)
    # Move the file aside so the migration only runs once.
    try:
        backup = src.with_suffix(".json.bak")
        if backup.exists():
            backup.unlink()
        src.rename(backup)
        log.info("Migrated %s → %s (backup: %s)", src.name, DB_FILE.name, backup.name)
    except OSError as exc:
        log.warning("Migrated %s but could not rename: %s", src.name, exc)


def _read_session(conn: sqlite3.Connection) -> Session:
    meta_rows = conn.execute("SELECT key, value FROM deck_meta").fetchall()
    meta = {r["key"]: r["value"] for r in meta_rows}
    prod_rows = conn.execute(
        f"SELECT {', '.join(PRODUCT_FIELDS)} FROM products ORDER BY position"
    ).fetchall()
    products = [normalize_product(dict(r)) for r in prod_rows]
    return Session(
        titre=meta.get("titre") or "Plan Commercial",
        canal=meta.get("canal") or "Canal Gros",
        mois=meta.get("mois") or "Avril 2026",
        banner=(meta.get("banner") or None) or None,
        background=(meta.get("background") or None) or None,
        cover_photo=(meta.get("cover_photo") or None) or None,
        products=products,
    )


def _write_session(conn: sqlite3.Connection, s: Session) -> None:
    """Persist the whole session in one transaction. We DELETE + INSERT for
    simplicity — the products table tops out around ~100 rows for the deck
    sizes this app handles, so the per-call write is microseconds. Worth
    optimising later if it ever shows up in profiling."""
    cols = PRODUCT_FIELDS
    placeholders = ", ".join(["?"] * (len(cols) + 1))     # +1 for `position`
    insert_sql = (
        f"INSERT INTO products(position, {', '.join(cols)}) "
        f"VALUES ({placeholders})"
    )
    with conn:                                            # implicit transaction
        conn.execute("DELETE FROM products")
        conn.execute("DELETE FROM deck_meta")
        conn.executemany(
            "INSERT INTO deck_meta(key, value) VALUES (?, ?)",
            [
                ("titre", s.titre),
                ("canal", s.canal),
                ("mois", s.mois),
                ("banner", s.banner or ""),
                ("background", s.background or ""),
                ("cover_photo", s.cover_photo or ""),
            ],
        )
        if s.products:
            rows = []
            for i, raw in enumerate(s.products):
                p = normalize_product(raw)
                rows.append((i, *(_to_sqlite(p[c]) for c in cols)))
            conn.executemany(insert_sql, rows)


def _to_sqlite(v: Any) -> Any:
    """SQLite doesn't have a real bool — store as 0/1. Everything else passes
    through. None gets normalised to '' by normalize_product, so no NULLs."""
    return int(v) if isinstance(v, bool) else v


def _load() -> Session:
    with _lock:
        return _read_session(_get_db())


def _save(s: Session) -> None:
    with _lock:
        _write_session(_get_db(), s)


# ─── Public API (used by routes + deps) ────────────────────────────────────

def get_session() -> Session:
    """Return the shared session, loading it on first access."""
    global _session
    with _lock:
        if _session is None:
            _session = _load()
        return _session


def save_session() -> None:
    with _lock:
        if _session is not None:
            _save(_session)


def reset_session() -> Session:
    global _session
    with _lock:
        _session = Session()
        _save(_session)
        return _session


def with_session():
    """FastAPI dependency that yields the singleton + auto-saves on success."""
    s = get_session()
    yield s
    save_session()
