"""Image-asset library helpers: metadata, brand/type inference, listing.

Assets live in ``assets/images/`` (next to ``app.py``). A JSON sidecar
``assets/images/_metadata.json`` stores per-image metadata — brand, type
(packshot / logo / badge / other), upload timestamp, and freeform tags.
Metadata is updated lazily: any image file on disk without an entry gets
one auto-created from its filename the first time it's listed.

Subfolders are scanned recursively. The metadata key is the path relative to
``assets/images/`` (with forward slashes, e.g. ``MIO/main_500.png``), so the
same basename can appear in different folders without collision. Files that
sit inside a subfolder inherit that subfolder's name as their brand — drop a
file into ``images/MIO/`` and it's automatically tagged ``brand=MIO``.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp"}
METADATA_FILENAME = "_metadata.json"


@dataclass
class AssetMeta:
    filename: str
    brand: str = ""
    type: str = "packshot"        # packshot | logo | badge | other
    added: str = ""
    size: int = 0
    tags: List[str] = field(default_factory=list)

    def to_dict(self):
        return {
            "brand": self.brand,
            "type": self.type,
            "added": self.added,
            "size": self.size,
            "tags": list(self.tags),
        }

    @classmethod
    def from_dict(cls, filename: str, data: dict) -> "AssetMeta":
        return cls(
            filename=filename,
            brand=str(data.get("brand") or ""),
            type=str(data.get("type") or "packshot"),
            added=str(data.get("added") or ""),
            size=int(data.get("size") or 0),
            tags=list(data.get("tags") or []),
        )


# --- Inference --------------------------------------------------------------

def infer_brand(filename: str) -> str:
    """Extract a probable brand from the filename.

    Rules of thumb, checked in order:
      - If the stem starts with a known brand token (MIO, FIX, IRIS, ...),
        return that.
      - Else, take the first alnum token.
    """
    stem = Path(filename).stem
    tokens = [t for t in re.split(r"[_\-\s.]+", stem) if t]
    if not tokens:
        return ""
    known = {"MIO", "FIX", "IRIS", "MALA", "ZEN", "BANO", "QZI", "A+"}
    for t in tokens:
        up = t.upper()
        if up in known:
            return up
    # Fallback: first alphabetic token
    for t in tokens:
        if t.isalpha():
            return t.upper()
    return tokens[0].upper()


def infer_type(filename: str) -> str:
    low = filename.lower()
    if "logo" in low:
        return "logo"
    if "badge" in low or "bomb" in low or "offre" in low:
        return "badge"
    return "packshot"


# --- Metadata store ---------------------------------------------------------

def _metadata_path(image_dir: Path) -> Path:
    return image_dir / METADATA_FILENAME


def load_metadata(image_dir: Path) -> Dict[str, AssetMeta]:
    """Load the metadata map; reconcile with files actually on disk.

    - Walks ``image_dir`` recursively; the relative path with forward slashes
      becomes the metadata key (e.g. ``MIO/main_500.png``).
    - Drops metadata entries whose file is gone.
    - Adds auto-inferred entries for files that have no entry yet.
    """
    image_dir.mkdir(parents=True, exist_ok=True)
    mpath = _metadata_path(image_dir)
    raw: dict = {}
    if mpath.exists():
        try:
            raw = json.loads(mpath.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            raw = {}

    on_disk: Dict[str, Path] = {}
    for p in image_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        if p.name == METADATA_FILENAME:
            continue
        rel = p.relative_to(image_dir).as_posix()
        on_disk[rel] = p

    result: Dict[str, AssetMeta] = {}
    for name, path in on_disk.items():
        entry = raw.get(name)
        if entry:
            result[name] = AssetMeta.from_dict(name, entry)
        else:
            result[name] = _auto_meta(path, rel_name=name)

    # If anything changed (added or pruned), persist it.
    if set(raw) != set(result):
        save_metadata(image_dir, result)

    return result


def save_metadata(image_dir: Path, meta: Dict[str, AssetMeta]) -> None:
    data = {name: m.to_dict() for name, m in meta.items()}
    _metadata_path(image_dir).write_text(
        json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
    )


def _auto_meta(path: Path, rel_name: Optional[str] = None) -> AssetMeta:
    """`rel_name` is the path relative to image_dir (forward slashes). When the
    file lives in a subfolder, that folder name becomes the brand — exactly
    what the user gets by dropping a file into ``images/MIO/``."""
    st = path.stat()
    name = rel_name if rel_name is not None else path.name
    if "/" in name:
        # Use the topmost subfolder as the brand (e.g. "MIO/Pdr/foo.png" -> MIO).
        brand = name.split("/", 1)[0].upper().strip()
    else:
        brand = infer_brand(name)
    return AssetMeta(
        filename=name,
        brand=brand,
        type=infer_type(name),
        added=datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
        size=st.st_size,
    )


def register_upload(image_dir: Path, filename: str, data: bytes,
                    brand: Optional[str] = None,
                    type_: Optional[str] = None) -> AssetMeta:
    """Write `data` to image_dir/filename and update the metadata store.

    `filename` may include forward slashes to land the file inside a subfolder
    (which then drives brand inference)."""
    target = image_dir / filename
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)

    meta = load_metadata(image_dir)
    entry = meta.get(filename) or _auto_meta(target, rel_name=filename)
    if brand is not None:
        entry.brand = brand
    if type_ is not None:
        entry.type = type_
    entry.added = datetime.now().isoformat(timespec="seconds")
    entry.size = target.stat().st_size
    meta[filename] = entry
    save_metadata(image_dir, meta)
    _BASENAME_INDEX.pop(image_dir, None)
    return entry


def delete_asset(image_dir: Path, filename: str) -> bool:
    path = image_dir / filename
    removed = False
    if path.exists() and path.is_file():
        path.unlink()
        removed = True
    meta = load_metadata(image_dir)
    if filename in meta:
        meta.pop(filename)
        save_metadata(image_dir, meta)
    _BASENAME_INDEX.pop(image_dir, None)
    return removed


# --- Basename index --------------------------------------------------------
#
# When the user moves files into subfolders (e.g. ``MIO/foo.png``) but the
# Excel still references the bare filename (``foo.png``), the resolver needs
# to find the file anywhere in the tree. We keep a per-image_dir basename →
# relative-path map, refreshed lazily and invalidated on uploads/deletes.

_BASENAME_INDEX: Dict[Path, Dict[str, str]] = {}


def _build_basename_index(image_dir: Path) -> Dict[str, str]:
    idx: Dict[str, str] = {}
    if not image_dir.exists():
        return idx
    for p in image_dir.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS:
            continue
        if p.name == METADATA_FILENAME:
            continue
        # First match wins — top-level files take priority over subfolder
        # duplicates so an explicit override at the root keeps working.
        idx.setdefault(p.name, p.relative_to(image_dir).as_posix())
    return idx


def find_relative_path(image_dir: Path, name: str) -> Optional[str]:
    """Resolve a filename — possibly bare or prefixed with a subfolder —
    to its path relative to image_dir.

    Resolution order, stopping at the first hit:
      1. Exact path under image_dir (``MIO/foo.png`` → ``image_dir/MIO/foo.png``).
      2. Basename lookup over the recursive index (``foo.png`` → wherever).
         The basename of the input is used, so ``MIO/foo.png`` still hits
         even when the subfolder part is wrong (renamed brand folder, case
         mismatch on Linux, …).
      3. Case-insensitive basename lookup — last-resort safety net for the
         all-too-common "WSL volume case-folded my filename" footgun.
    """
    if not name:
        return None
    direct = image_dir / name
    if direct.is_file():
        return name

    # Extract the basename — works for both "MIO/foo.png" and bare "foo.png".
    basename = name.replace("\\", "/").rsplit("/", 1)[-1]

    cache = _BASENAME_INDEX.get(image_dir)
    if cache is None:
        cache = _build_basename_index(image_dir)
        _BASENAME_INDEX[image_dir] = cache

    hit = cache.get(basename)
    if hit:
        return hit

    # Cache miss — rebuild once in case the file was added since startup.
    cache = _build_basename_index(image_dir)
    _BASENAME_INDEX[image_dir] = cache
    hit = cache.get(basename)
    if hit:
        return hit

    # Last resort: case-insensitive match on basename.
    needle = basename.lower()
    for cached_name, rel in cache.items():
        if cached_name.lower() == needle:
            return rel
    return None


# --- Querying ---------------------------------------------------------------

def list_assets(image_dir: Path,
                brand: Optional[str] = None,
                type_: Optional[str] = None,
                search: Optional[str] = None) -> List[AssetMeta]:
    """Return metadata entries, newest first, after applying optional filters."""
    meta = load_metadata(image_dir)
    rows = list(meta.values())
    if brand:
        b = brand.upper()
        rows = [r for r in rows if r.brand.upper() == b]
    if type_:
        rows = [r for r in rows if r.type == type_]
    if search:
        s = search.lower()
        rows = [
            r for r in rows
            if s in r.filename.lower()
            or s in r.brand.lower()
            or any(s in t.lower() for t in r.tags)
        ]
    rows.sort(key=lambda r: r.added, reverse=True)
    return rows


def count_usage(meta_name: str, products_df) -> int:
    """How many SKU rows reference this filename in packshot / nom_image / logo_groupe."""
    if products_df is None or len(products_df) == 0:
        return 0
    cols = ["packshot", "nom_image", "logo_groupe"]
    total = 0
    for c in cols:
        if c in products_df.columns:
            total += int((products_df[c].astype(str) == meta_name).sum())
    return total
