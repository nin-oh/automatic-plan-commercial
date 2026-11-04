"""Multi-catalogue projects — named, switchable, duplicable sessions.

The live session is the working copy; the active project row mirrors it on
every save (see session._write_session). Switching projects is therefore
always lossless for tracked sessions, and snapshot-guarded for untracked
ones.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..session import (
    create_project, delete_project, duplicate_project, get_active_project_id,
    list_projects, open_project, rename_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


class ProjectOut(BaseModel):
    id: int
    name: str
    created_at: str
    updated_at: str
    products: int
    canal: str
    mois: str
    active: bool


class CreateIn(BaseModel):
    name: str
    blank: bool = False


class NameIn(BaseModel):
    name: Optional[str] = None


def _listing() -> List[ProjectOut]:
    active = get_active_project_id()
    return [
        ProjectOut(**p, active=(p["id"] == active)) for p in list_projects()
    ]


@router.get("", response_model=List[ProjectOut])
def get_projects():
    return _listing()


@router.post("", response_model=List[ProjectOut])
def post_project(payload: CreateIn):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "name required")
    create_project(name, blank=payload.blank)
    return _listing()


class OpenOut(BaseModel):
    loaded: int


@router.post("/{pid}/open", response_model=OpenOut)
def post_open(pid: int):
    try:
        return OpenOut(loaded=open_project(pid))
    except KeyError:
        raise HTTPException(404, "project not found")


@router.post("/{pid}/duplicate", response_model=List[ProjectOut])
def post_duplicate(pid: int, payload: NameIn = NameIn()):
    try:
        duplicate_project(pid, payload.name)
    except KeyError:
        raise HTTPException(404, "project not found")
    return _listing()


@router.patch("/{pid}", response_model=List[ProjectOut])
def patch_project(pid: int, payload: NameIn):
    if not payload.name or not payload.name.strip():
        raise HTTPException(400, "name required")
    if not rename_project(pid, payload.name.strip()):
        raise HTTPException(404, "project not found")
    return _listing()


@router.delete("/{pid}", response_model=List[ProjectOut])
def remove_project(pid: int):
    if not delete_project(pid):
        raise HTTPException(404, "project not found")
    return _listing()
