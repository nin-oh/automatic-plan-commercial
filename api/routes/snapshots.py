"""Session snapshots — the automatic safety net.

Snapshots are created automatically by the destructive routes (Excel import,
Effacer, archive load) via `session.create_snapshot`, and manually from the
frontend. This module only exposes the list / restore / delete surface.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..session import (
    create_snapshot, delete_snapshot, list_snapshots, restore_snapshot,
)

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])


class SnapshotOut(BaseModel):
    id: int
    label: str
    created_at: str
    products: int


class CreateIn(BaseModel):
    label: Optional[str] = None


@router.get("", response_model=List[SnapshotOut])
def get_snapshots():
    return [SnapshotOut(**s) for s in list_snapshots()]


@router.post("", response_model=Optional[SnapshotOut])
def post_snapshot(payload: CreateIn):
    """Manual snapshot ("point de sauvegarde"). Returns null when the
    session is empty (nothing to save)."""
    snap_id = create_snapshot(payload.label or "Sauvegarde manuelle")
    if snap_id is None:
        return None
    for s in list_snapshots():
        if s["id"] == snap_id:
            return SnapshotOut(**s)
    return None


class RestoreOut(BaseModel):
    restored: int


@router.post("/{snap_id}/restore", response_model=RestoreOut)
def post_restore(snap_id: int):
    try:
        n = restore_snapshot(snap_id)
    except KeyError:
        raise HTTPException(404, "snapshot not found")
    return RestoreOut(restored=n)


@router.delete("/{snap_id}")
def remove_snapshot(snap_id: int):
    if not delete_snapshot(snap_id):
        raise HTTPException(404, "snapshot not found")
    return {"ok": True}
