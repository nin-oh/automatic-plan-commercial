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
    "item_code",                # SAP ItemCode — used as the JOIN key for SAP verification
    "packshot", "packshot2",
    # Scents 3-6 — see `Product.packshot3_path`. Three or more switches the
    # slide to the "hero + smaller row" layout.
    "packshot3", "packshot4", "packshot5", "packshot6",
    "nom_image",
    "prix_gros", "prix_gros_net",
    "prix_detail", "prix_detail_net",   # mirrored from SAP DETAIL / DETAIL NET
    "colisage", "colisage_prix_gros", "colisage_prix_gros_net",
    "logo_groupe",
    "is_promo", "type_promo",
    "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct",
    "promo_texte",
    # Per-row override for the promo container word ("sac" / "carton" /
    # "caisse" / "unité"). Empty falls back to the channel default.
    "promo_unit",
    "promo_carton_left", "promo_carton_right",
    "promo_ribbon_left", "promo_ribbon_right",
    "promo_carton_image", "promo_ribbon_image",
    "promo_remise_image", "promo_gratuite_image",
    # Extra gratuite slots — see `Product.promo_gratuite_image_2/3/4`.
    "promo_gratuite_image_2", "promo_gratuite_image_3", "promo_gratuite_image_4",
    # Name of the free SKU per gratuite slot — captioned under its image.
    "promo_gratuite_nom", "promo_gratuite_nom_2",
    "promo_gratuite_nom_3", "promo_gratuite_nom_4",
    # Inches to raise the free item above the floor line (0 = on the floor).
    "promo_gratuite_lift",
    # Draw the "جديد / Nouveau" ribbon on THIS slide only.
    "nouveau",
    "packshot_left", "packshot_top", "packshot_width", "packshot_height",
    # Free-text status for the "SKUs sans packshot" workflow. Values used
    # by the UI: 'discontinued' (produit n'existe plus), 'in_progress'
    # (packshot en cours), 'other', or empty ('' = not yet categorised).
    # Stored as a plain string so adding new categories later is just a
    # frontend change — no DB migration needed.
    "packshot_status",
]

NUMERIC_FLOAT = {
    "prix_gros", "prix_gros_net",
    "prix_detail", "prix_detail_net",
    "colisage_prix_gros", "colisage_prix_gros_net",
    "promo_remise_pct",
    "packshot_left", "packshot_top",
    "packshot_width", "packshot_height",
    "promo_gratuite_lift",
}
NUMERIC_INT = {"promo_achat_qte", "promo_gratuit_qte"}
BOOL_FIELDS = {
    "is_promo",
    "promo_carton_left", "promo_carton_right",
    "promo_ribbon_left", "promo_ribbon_right",
    "nouveau",
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
    # Catalogue brand for the Détail channel ("MIO" or "ZEN") — selects
    # which default product-family ordering applies. Ignored for Gros.
    marque: str = "MIO"
    banner: Optional[str] = None       # filename in IMAGE_DIR (None = built-in)
    background: Optional[str] = None
    cover_photo: Optional[str] = None
    # "Nouveau lancement" toggle — adds the "جديد / Nouveau" ribbon to every
    # product slide. Off by default.
    nouveau_lancement: bool = False
    products: List[Dict[str, Any]] = field(default_factory=list)

    # to_dict / from_dict are kept around because the SAP import + Excel
    # roundtrip code already speak that vocabulary. They're now thin shims
    # over the dataclass fields; storage lives in SQLite.
    def to_dict(self) -> Dict[str, Any]:
        return {
            "titre": self.titre,
            "canal": self.canal,
            "mois": self.mois,
            "marque": self.marque,
            "banner": self.banner,
            "background": self.background,
            "cover_photo": self.cover_photo,
            "nouveau_lancement": self.nouveau_lancement,
            "products": [normalize_product(p) for p in self.products],
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Session":
        return cls(
            titre=str(data.get("titre") or "Plan Commercial"),
            canal=str(data.get("canal") or "Canal Gros"),
            mois=str(data.get("mois") or "Avril 2026"),
            marque=str(data.get("marque") or "MIO"),
            banner=data.get("banner") or None,
            background=data.get("background") or None,
            cover_photo=data.get("cover_photo") or None,
            nouveau_lancement=bool(data.get("nouveau_lancement") or False),
            products=[normalize_product(p) for p in (data.get("products") or [])],
        )


# ─── SQLite backend ────────────────────────────────────────────────────────

_META_KEYS = ("titre", "canal", "mois", "marque", "banner", "background", "cover_photo")

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
    item_code               TEXT    DEFAULT '',
    packshot                TEXT    DEFAULT '',
    nom_image               TEXT    DEFAULT '',
    prix_gros               REAL    DEFAULT 0,
    prix_gros_net           REAL    DEFAULT 0,
    prix_detail             REAL    DEFAULT 0,
    prix_detail_net         REAL    DEFAULT 0,
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
    promo_unit              TEXT    DEFAULT '',
    promo_carton_left       INTEGER DEFAULT 0,
    promo_carton_right      INTEGER DEFAULT 0,
    promo_ribbon_left       INTEGER DEFAULT 0,
    promo_ribbon_right      INTEGER DEFAULT 0,
    promo_carton_image      TEXT    DEFAULT '',
    promo_ribbon_image      TEXT    DEFAULT '',
    promo_remise_image      TEXT    DEFAULT '',
    promo_gratuite_image    TEXT    DEFAULT '',
    promo_gratuite_image_2  TEXT    DEFAULT '',
    promo_gratuite_image_3  TEXT    DEFAULT '',
    promo_gratuite_image_4  TEXT    DEFAULT '',
    packshot_left           REAL    DEFAULT 0,
    packshot_top            REAL    DEFAULT 0,
    packshot_width          REAL    DEFAULT 0,
    packshot_height         REAL    DEFAULT 0,
    packshot_status         TEXT    DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sku_priority (
    -- Stable "where this SKU wants to live within its brand" — lookup
    -- key is the product name. Outlives a products table replacement,
    -- so importing fresh Excel/SAP data doesn't lose user-set ordering.
    nom      TEXT PRIMARY KEY,
    priority INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_priority (
    -- Outer ordering: which brand goes first in the deck. The "brand"
    -- of a product is `sous_groupe` (e.g. "MIO", "FIX", "IRIS").
    -- Combined with sku_priority for two-level sort.
    brand    TEXT PRIMARY KEY,
    priority INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    -- Multi-catalogue: each project is a complete saved session (deck meta
    -- + products) as a JSON blob. The live deck_meta/products tables are
    -- the working copy; when a project is "active" (app_state key
    -- `active_project`), every save also mirrors the session into its row,
    -- so switching projects never loses work.
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
    -- Tiny key/value store for app-level flags that must survive
    -- _write_session's DELETE of deck_meta (e.g. `active_project`).
    key   TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
    -- Automatic safety net: the whole session is dumped here right before
    -- destructive operations (Excel/SAP import, Effacer, archive load) and
    -- can be restored with one click. Trimmed to the most recent
    -- _SNAPSHOTS_MAX rows on every insert.
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_memory (
    -- "Never redo anything": every visual enrichment the user makes on a
    -- product (packshot, logo, promo settings + images, unité promo,
    -- packshot position, statut) is mirrored here, keyed by the product's
    -- stable identity (item_code, falling back to nom). Import routes call
    -- `apply_product_memory` so a fresh Excel/SAP price file gets all the
    -- previous visual work back automatically.
    -- `data` is a JSON blob so adding new remembered fields never needs a
    -- schema migration.
    key        TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
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
    _migrate_schema(conn)
    return conn


# Columns we've added since the original schema. Keyed by column name so we
# only emit ALTER TABLE statements for the ones genuinely missing from the
# user's existing state.db. SQLite-supported types only.
_PRODUCTS_NEW_COLUMNS = {
    "item_code":        "TEXT DEFAULT ''",
    "packshot2":        "TEXT DEFAULT ''",
    "prix_detail":      "REAL DEFAULT 0",
    "prix_detail_net":  "REAL DEFAULT 0",
    "packshot_status":  "TEXT DEFAULT ''",
    "promo_unit":       "TEXT DEFAULT ''",
    "promo_gratuite_image_2": "TEXT DEFAULT ''",
    "promo_gratuite_image_3": "TEXT DEFAULT ''",
    "promo_gratuite_image_4": "TEXT DEFAULT ''",
    "packshot3":        "TEXT DEFAULT ''",
    "packshot4":        "TEXT DEFAULT ''",
    "packshot5":        "TEXT DEFAULT ''",
    "packshot6":        "TEXT DEFAULT ''",
    "promo_gratuite_nom":   "TEXT DEFAULT ''",
    "promo_gratuite_nom_2": "TEXT DEFAULT ''",
    "promo_gratuite_nom_3": "TEXT DEFAULT ''",
    "promo_gratuite_nom_4": "TEXT DEFAULT ''",
    "promo_gratuite_lift":  "REAL DEFAULT 0",
    "nouveau":              "INTEGER DEFAULT 0",
}


def _migrate_schema(conn: sqlite3.Connection) -> None:
    """Idempotent column additions for users whose state.db pre-dates a
    field. CREATE TABLE IF NOT EXISTS handles fresh installs; this loop
    catches the upgrade case. Each ALTER TABLE is a no-op when the column
    already exists (we check first via PRAGMA table_info)."""
    cur = conn.execute("PRAGMA table_info(products)")
    have = {row[1] for row in cur.fetchall()}    # column names
    for name, decl in _PRODUCTS_NEW_COLUMNS.items():
        if name not in have:
            try:
                conn.execute(f"ALTER TABLE products ADD COLUMN {name} {decl}")
                log.info("Migrated state.db: added products.%s", name)
            except sqlite3.OperationalError as exc:
                log.warning("Could not add column products.%s: %s", name, exc)


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
        marque=meta.get("marque") or "MIO",
        banner=(meta.get("banner") or None) or None,
        background=(meta.get("background") or None) or None,
        cover_photo=(meta.get("cover_photo") or None) or None,
        nouveau_lancement=(meta.get("nouveau_lancement") == "1"),
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
                ("marque", s.marque or "MIO"),
                ("banner", s.banner or ""),
                ("background", s.background or ""),
                ("cover_photo", s.cover_photo or ""),
                ("nouveau_lancement", "1" if s.nouveau_lancement else "0"),
            ],
        )
        if s.products:
            rows = []
            for i, raw in enumerate(s.products):
                p = normalize_product(raw)
                rows.append((i, *(_to_sqlite(p[c]) for c in cols)))
            conn.executemany(insert_sql, rows)
        _sync_priority(conn, s.products)
        _sync_memory(conn, s.products)
        # Mirror into the active project (if any) so switching projects
        # later restores exactly this state.
        pid = _get_app_state(conn, "active_project")
        if pid:
            conn.execute(
                "UPDATE projects SET data = ?, updated_at = datetime('now') "
                "WHERE id = ?",
                (json.dumps(s.to_dict(), ensure_ascii=False), int(pid)),
            )


def _get_app_state(conn: sqlite3.Connection, key: str) -> Optional[str]:
    row = conn.execute(
        "SELECT value FROM app_state WHERE key = ?", (key,)
    ).fetchone()
    return row["value"] if row else None


def _set_app_state(conn: sqlite3.Connection, key: str, value: Optional[str]) -> None:
    if value is None:
        conn.execute("DELETE FROM app_state WHERE key = ?", (key,))
    else:
        conn.execute(
            "INSERT INTO app_state(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )


def _sync_priority(conn: sqlite3.Connection, products: List[Dict[str, Any]]) -> None:
    """Mirror current product positions into BOTH sku_priority (per SKU)
    AND brand_priority (per brand = sous_groupe).

    UPSERTs (no DELETE first) so brands/SKUs that disappear keep their
    remembered slot. When they reappear in a future import they land back
    in roughly the same place.

    The brand priority is the index of the brand's FIRST appearance in the
    current products list — so the order in which the brand sections show
    up in the deck IS the brand priority.
    """
    # SKU-level
    for i, p in enumerate(products):
        if not isinstance(p, dict):
            continue
        nom = (p.get("nom") or "").strip()
        if nom:
            conn.execute(
                "INSERT INTO sku_priority(nom, priority) VALUES (?, ?) "
                "ON CONFLICT(nom) DO UPDATE SET priority = excluded.priority",
                (nom, i),
            )

    # Brand-level: priority = position of the brand's first appearance.
    seen_brands: List[str] = []
    for p in products:
        if not isinstance(p, dict):
            continue
        brand = (p.get("sous_groupe") or "").strip()
        if brand and brand not in seen_brands:
            seen_brands.append(brand)
    for idx, brand in enumerate(seen_brands):
        conn.execute(
            "INSERT INTO brand_priority(brand, priority) VALUES (?, ?) "
            "ON CONFLICT(brand) DO UPDATE SET priority = excluded.priority",
            (brand, idx),
        )


# ─── Projects (multi-catalogue) ────────────────────────────────────────────

def _project_summary(row: sqlite3.Row) -> Dict[str, Any]:
    try:
        data = json.loads(row["data"])
    except (json.JSONDecodeError, TypeError):
        data = {}
    return {
        "id": row["id"],
        "name": row["name"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "products": len(data.get("products") or []),
        "canal": str(data.get("canal") or ""),
        "mois": str(data.get("mois") or ""),
    }


def get_active_project_id() -> Optional[int]:
    with _lock:
        v = _get_app_state(_get_db(), "active_project")
        return int(v) if v else None


def list_projects() -> List[Dict[str, Any]]:
    with _lock:
        db = _get_db()
        rows = db.execute(
            "SELECT id, name, created_at, updated_at, data FROM projects "
            "ORDER BY updated_at DESC"
        ).fetchall()
    return [_project_summary(r) for r in rows]


def all_project_prices() -> List[Dict[str, Any]]:
    """Every project's full product list + canal + updated_at, for the
    cross-project price-list export. Reads the mirrored `data` JSON (kept
    current on every save), newest project first."""
    with _lock:
        db = _get_db()
        rows = db.execute(
            "SELECT name, updated_at, data FROM projects ORDER BY updated_at DESC"
        ).fetchall()
    out: List[Dict[str, Any]] = []
    for r in rows:
        try:
            data = json.loads(r["data"] or "{}")
        except (json.JSONDecodeError, TypeError):
            data = {}
        out.append({
            "name": r["name"],
            "updated_at": r["updated_at"] or "",
            "canal": str(data.get("canal") or ""),
            "products": data.get("products") or [],
        })
    return out


def create_project(name: str, blank: bool = False) -> int:
    """Create a project and make it active.

    blank=False → the current session becomes the project's content (i.e.
    "save my current work as a named project"). blank=True → snapshot the
    current session, reset it, and start the project empty."""
    global _session
    with _lock:
        db = _get_db()
        if blank:
            create_snapshot("Avant nouveau projet")
            _session = Session()
        s = get_session()
        payload = json.dumps(s.to_dict(), ensure_ascii=False)
        with db:
            cur = db.execute(
                "INSERT INTO projects(name, data) VALUES (?, ?)",
                (name, payload),
            )
            pid = int(cur.lastrowid)
            _set_app_state(db, "active_project", str(pid))
        _save(s)     # mirror once so updated_at is coherent
        return pid


def open_project(pid: int) -> int:
    """Switch to a project: the current session (already mirrored into its
    own project row if one is active) is replaced by the target project's
    content. A snapshot guards the transition for non-project sessions.
    Returns the number of loaded products."""
    global _session
    with _lock:
        db = _get_db()
        row = db.execute(
            "SELECT data FROM projects WHERE id = ?", (pid,)
        ).fetchone()
        if row is None:
            raise KeyError(pid)
        if _get_app_state(db, "active_project") is None:
            # Untracked session — its content isn't mirrored anywhere, so
            # keep a snapshot before replacing it.
            create_snapshot("Avant ouverture de projet")
        loaded = Session.from_dict(json.loads(row["data"]))
        with db:
            _set_app_state(db, "active_project", str(pid))
        _session = loaded
        _save(loaded)
        return len(loaded.products)


def duplicate_project(pid: int, new_name: Optional[str] = None) -> int:
    """Copy a project (e.g. clone "Juin Gros" → "Juin Détail"). The copy is
    NOT opened automatically. Returns the new project id."""
    with _lock:
        db = _get_db()
        row = db.execute(
            "SELECT name, data FROM projects WHERE id = ?", (pid,)
        ).fetchone()
        if row is None:
            raise KeyError(pid)
        name = new_name or f"{row['name']} (copie)"
        with db:
            cur = db.execute(
                "INSERT INTO projects(name, data) VALUES (?, ?)",
                (name, row["data"]),
            )
            return int(cur.lastrowid)


def rename_project(pid: int, name: str) -> bool:
    with _lock:
        db = _get_db()
        with db:
            cur = db.execute(
                "UPDATE projects SET name = ? WHERE id = ?", (name, pid),
            )
            return cur.rowcount > 0


def delete_project(pid: int) -> bool:
    """Delete a project row. If it was active, the live session keeps its
    content but becomes untracked (edits no longer mirror anywhere)."""
    with _lock:
        db = _get_db()
        with db:
            cur = db.execute("DELETE FROM projects WHERE id = ?", (pid,))
            if _get_app_state(db, "active_project") == str(pid):
                _set_app_state(db, "active_project", None)
            return cur.rowcount > 0


# ─── Snapshots (automatic safety net) ──────────────────────────────────────

_SNAPSHOTS_MAX = 20


def create_snapshot(label: str) -> Optional[int]:
    """Dump the current session into the snapshots table. No-op when the
    session has no products (nothing worth saving). Returns the snapshot id.
    Called by import / clear / archive-load routes right before they replace
    the products list."""
    s = get_session()
    if not s.products:
        return None
    payload = json.dumps(s.to_dict(), ensure_ascii=False)
    with _lock:
        db = _get_db()
        with db:
            cur = db.execute(
                "INSERT INTO snapshots(label, data) VALUES (?, ?)",
                (label, payload),
            )
            db.execute(
                "DELETE FROM snapshots WHERE id NOT IN "
                "(SELECT id FROM snapshots ORDER BY id DESC LIMIT ?)",
                (_SNAPSHOTS_MAX,),
            )
            return int(cur.lastrowid)


def list_snapshots() -> List[Dict[str, Any]]:
    """Newest first. `products` is the row count, not the payload — the
    payload only travels on restore."""
    with _lock:
        db = _get_db()
        rows = db.execute(
            "SELECT id, label, created_at, data FROM snapshots ORDER BY id DESC"
        ).fetchall()
    out = []
    for r in rows:
        try:
            n = len(json.loads(r["data"]).get("products") or [])
        except (json.JSONDecodeError, TypeError):
            n = 0
        out.append({
            "id": r["id"], "label": r["label"],
            "created_at": r["created_at"], "products": n,
        })
    return out


def restore_snapshot(snap_id: int) -> int:
    """Replace the live session with the snapshot's content. Returns the
    number of restored products. Raises KeyError when the id is unknown."""
    global _session
    with _lock:
        db = _get_db()
        row = db.execute(
            "SELECT data FROM snapshots WHERE id = ?", (snap_id,)
        ).fetchone()
        if row is None:
            raise KeyError(snap_id)
        restored = Session.from_dict(json.loads(row["data"]))
        _session = restored
        _save(restored)
        return len(restored.products)


def delete_snapshot(snap_id: int) -> bool:
    with _lock:
        db = _get_db()
        with db:
            cur = db.execute("DELETE FROM snapshots WHERE id = ?", (snap_id,))
            return cur.rowcount > 0


# ─── Product memory ("never redo anything") ────────────────────────────────

# The enrichment fields worth remembering across imports. Identity fields
# (groupe / sous_groupe / nom / item_code) and price/colisage fields are
# excluded on purpose — those come from each fresh import and must win.
_MEMORY_FIELDS = [
    "packshot", "nom_image", "logo_groupe",
    "is_promo", "type_promo",
    "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct",
    "promo_texte", "promo_unit",
    "promo_carton_left", "promo_carton_right",
    "promo_ribbon_left", "promo_ribbon_right",
    "promo_carton_image", "promo_ribbon_image",
    "promo_remise_image", "promo_gratuite_image",
    "promo_gratuite_image_2", "promo_gratuite_image_3", "promo_gratuite_image_4",
    "packshot_left", "packshot_top", "packshot_width", "packshot_height",
    "packshot_status",
]


def _memory_key(p: Dict[str, Any]) -> str:
    """Stable identity for a product across imports: SAP ItemCode when
    present, otherwise the product name (BySKU files have no ItemCode)."""
    return (str(p.get("item_code") or "").strip()
            or str(p.get("nom") or "").strip())


def _is_default(v: Any) -> bool:
    """True when a value carries no user work: '', 0, 0.0, False, None."""
    return v is None or v == "" or v == 0 or v is False


def _sync_memory(conn: sqlite3.Connection, products: List[Dict[str, Any]]) -> None:
    """Mirror the current enrichment state of every product into
    product_memory. UPSERT — products that disappear keep their memory so
    they get their visual work back if a later import brings them back.
    Latest session state wins: intentionally clearing a field in the editor
    clears it in memory too."""
    for p in products:
        if not isinstance(p, dict):
            continue
        key = _memory_key(p)
        if not key:
            continue
        data = json.dumps(
            {f: _to_sqlite(p.get(f)) for f in _MEMORY_FIELDS},
            ensure_ascii=False,
        )
        conn.execute(
            "INSERT INTO product_memory(key, data, updated_at) "
            "VALUES (?, ?, datetime('now')) "
            "ON CONFLICT(key) DO UPDATE SET data = excluded.data, "
            "updated_at = excluded.updated_at",
            (key, data),
        )


def apply_product_memory(rows: List[Dict[str, Any]]) -> int:
    """Merge remembered enrichments into freshly imported rows, in place.

    Fill-the-gaps rule: a remembered value is applied only when the incoming
    row's field is still at its default ('' / 0 / False). Anything the import
    file explicitly provides (e.g. a template with its own promo columns)
    always wins over memory. Returns how many rows received at least one
    remembered value — surfaced in the import toast.
    """
    with _lock:
        db = _get_db()
        mem_rows = db.execute("SELECT key, data FROM product_memory").fetchall()
    memory: Dict[str, Dict[str, Any]] = {}
    for r in mem_rows:
        try:
            memory[r["key"]] = json.loads(r["data"])
        except (json.JSONDecodeError, TypeError):
            continue

    enriched = 0
    for row in rows:
        mem = memory.get(_memory_key(row))
        if not mem:
            continue
        changed = False
        for f in _MEMORY_FIELDS:
            if _is_default(row.get(f)) and not _is_default(mem.get(f)):
                row[f] = mem[f]
                changed = True
        if changed:
            # Re-coerce types (JSON round-trip turns bools into 0/1 etc.)
            row.update(normalize_product(row))
            enriched += 1
    return enriched


def apply_stored_priority(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Sort `rows` by the two-level remembered priority:
        outer: brand_priority[sous_groupe]
        inner: sku_priority[nom]

    Brands not in the priority table go after known brands; SKUs not in
    the priority table go after known SKUs within their brand. Stable on
    source order for ties. Used by every import route (Excel / SAP /
    archive-load) before assigning to `session.products`.
    """
    with _lock:
        db = _get_db()
        sku_pri = dict(db.execute("SELECT nom, priority FROM sku_priority").fetchall())
        brand_pri = dict(db.execute("SELECT brand, priority FROM brand_priority").fetchall())

    UNKNOWN = 9_999_999     # bigger than any real priority value

    keyed = []
    for orig_idx, r in enumerate(rows):
        brand = (r.get("sous_groupe") or "").strip()
        nom = (r.get("nom") or "").strip()
        b_pri = brand_pri.get(brand, UNKNOWN) if brand else UNKNOWN
        s_pri = sku_pri.get(nom, UNKNOWN) if nom else UNKNOWN
        # Sort key tuple: brand first, SKU second, original index as
        # stable tiebreaker. Unknown brands/SKUs naturally sort after
        # known ones because UNKNOWN is huge.
        keyed.append(((b_pri, s_pri, orig_idx), r))
    keyed.sort(key=lambda x: x[0])
    return [r for _, r in keyed]


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
