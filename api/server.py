"""Plan Commercial — FastAPI app.

Single-process layout:
- /api/...      → JSON endpoints + binary streams (PNG previews, xlsx, pptx, pdf)
- /assets/*     → uploaded images served as static files
- /             → built React app from frontend/apps/amafin/dist/

In dev, run:
  uvicorn api.server:app --reload --port 8000
and start Vite separately on 5173 — it proxies /api to :8000.

In prod, build the React app first (`pnpm --dir frontend/apps/amafin build`)
then run uvicorn alone — the static dir is served from the same port.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

# `deps` adds src/ + project root to sys.path so plan_commercial / image_assets
# resolve regardless of where uvicorn is launched from.
from . import deps  # noqa: F401  (import-time side effect)
from .session import IMAGE_DIR, PROJECT_ROOT
from .routes import (
    archive, generate, images, preview, products, projects, sap, snapshots,
    state,
)

FRONTEND_DIST = PROJECT_ROOT / "frontend" / "apps" / "plan-commercial" / "dist"

app = FastAPI(
    title="Plan Commercial API",
    version="0.1.0",
    description="REST API behind the Plan Commercial generator UI.",
)

# Permissive CORS — single-user, single-process. Vite dev server lives on
# 5173 and proxies through to us anyway, but allowing the direct browser→8000
# calls during dev makes the API usable from REST clients too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(state.router)
app.include_router(products.router)
app.include_router(images.router)
app.include_router(preview.router)
app.include_router(generate.router)
app.include_router(archive.router)
app.include_router(sap.router)
app.include_router(snapshots.router)
app.include_router(projects.router)


@app.on_event("startup")
def _sap_warm_cache():
    """Sync SAP into the in-process cache once at boot so the SAP page
    serves data instantly without the user clicking anything. Silent on
    failure — the user can still hit /sap/sync manually, and the rest of
    the app must stay usable when SAP is unreachable."""
    sap.init_cache_silently()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "plan-commercial"}


# Uploaded images — direct file access for <img src="/files/foo.png">. We use
# `/files` (not `/assets`) because the Vite build emits its hashed JS/CSS to
# `dist/assets/`, and serving both at the same prefix causes collisions.
app.mount("/files", StaticFiles(directory=str(IMAGE_DIR)), name="files")

# ---- Built React app (single-process production mode) ----------------------
# The Plan Commercial Vite app is built with base="/", so its asset URLs are
# at /assets/ (Vite hash-named build artifacts) and /logo.png etc. Note this
# collides with the user-uploaded `/assets/<filename>` mount above only by
# name — Vite outputs to `dist/assets/` and our images live in `assets/images/`
# at the project root. The static mount at `/assets` (line ~60) was already
# added earlier; keep it ABOVE the SPA fallback so user-uploaded images win.
if FRONTEND_DIST.exists():
    INDEX_HTML = FRONTEND_DIST / "index.html"

    @app.get("/", include_in_schema=False)
    def spa_root():
        return FileResponse(str(INDEX_HTML))

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        """Serve a built file under dist/ if it exists, else fall back to
        index.html so the React Router can take over (deep links work)."""
        # Don't shadow API endpoints / user-image mount
        if full_path.startswith(("api/", "files/")):
            from fastapi import HTTPException
            raise HTTPException(status_code=404)
        target = FRONTEND_DIST / full_path
        if target.is_file():
            return FileResponse(str(target))
        return FileResponse(str(INDEX_HTML))
else:
    @app.get("/")
    def dev_landing():
        return JSONResponse({
            "service": "plan-commercial",
            "note": "Frontend dist not built. Run `pnpm --dir frontend/apps/amafin build` "
                    "for single-process mode, or `pnpm --dir frontend/apps/amafin dev` "
                    "for hot-reload on :5173.",
            "api_root": "/api",
        })
