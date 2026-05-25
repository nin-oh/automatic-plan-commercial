# syntax=docker/dockerfile:1.6
#
# Plan Commercial — single-image build.
#
#   stage 1 (frontend-builder)  → Node + pnpm, builds the React app to /dist
#   stage 2 (runtime)           → Python 3.12 + FastAPI + uvicorn + msodbcsql18
#                                 (for the SAP import) serves both API and UI
#                                 on :8000.
#
# Build:   docker build -t plan-commercial:latest .
# Run:     docker run --rm -p 8000:8000 \
#              -v pc_images:/app/assets/images \
#              -v pc_archive:/app/archive \
#              plan-commercial:latest
#
# Or use docker-compose.yml which wires the volumes for you.


# ─── Stage 1: frontend ──────────────────────────────────────────────────────
# Node 22 (current LTS). pnpm 11+, which corepack picks by default, requires
# Node ≥22.13 — Node 20 fails with "No such built-in module: node:sqlite".
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /workspace

# pnpm via corepack (bundled with Node). Pin to v9 — corepack's default is
# pnpm 11 which enforces a network-bound supply-chain policy check that
# fails in offline / sandboxed builds, and is otherwise more brittle.
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

# Workspace manifests first — cached when only source changes
COPY frontend/package.json frontend/pnpm-workspace.yaml frontend/pnpm-lock.yaml* ./
COPY frontend/apps/plan-commercial/package.json apps/plan-commercial/
COPY frontend/apps/amafin/package.json           apps/amafin/
COPY frontend/packages/ui/package.json           packages/ui/

# `--no-frozen-lockfile` lets the build proceed when the committed lockfile
# is slightly out of sync with package.json (e.g. a dependency was just
# removed). Regenerate the lockfile locally (`pnpm install` then commit
# pnpm-lock.yaml) to switch this back to `--frozen-lockfile` for stricter
# reproducible builds.
RUN pnpm install --no-frozen-lockfile

# Now the actual sources
COPY frontend/ ./

# Build the plan-commercial app (the ui package compiles as part of its deps)
RUN pnpm --filter @plan-commercial/app build


# ─── Stage 2: runtime ───────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS runtime
WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System deps:
#  - unixodbc + g++ + msodbcsql18  → pyodbc + SAP SQL Server import
#  - curl + gnupg                  → fetch Microsoft repo key
#  - tini                          → proper PID 1 signal handling for uvicorn
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        curl gnupg ca-certificates tini \
        unixodbc unixodbc-dev g++ \
 && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
 && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list \
 && apt-get update \
 && ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18 \
 && apt-get purge -y --auto-remove curl gnupg \
 && rm -rf /var/lib/apt/lists/*

# Python deps (+ pyodbc which isn't pinned in requirements.txt)
COPY requirements.txt .
RUN pip install -r requirements.txt pyodbc

# App source — only what the running server actually reads
COPY api/                 ./api/
COPY src/                 ./src/
COPY assets/builtin/      ./assets/builtin/
COPY samples/             ./samples/
COPY image_assets.py excel_reader.py ./

# Built React bundle from stage 1, at the location api/server.py expects
COPY --from=frontend-builder /workspace/apps/plan-commercial/dist \
                             ./frontend/apps/plan-commercial/dist

# Persistent data lives under a single root that the named volume mounts at
# runtime. session.py reads this via the PC_DATA_DIR env var and points
# IMAGE_DIR / ARCHIVE_DIR / state.db all under it.
ENV PC_DATA_DIR=/app/data
RUN mkdir -p /app/data/images /app/data/archive

# Entrypoint copies the bundled defaults (builtin graphics) into the volume
# on first start if it's empty, so a fresh `-v pc_images:/app/assets/images`
# mount doesn't wipe out the wood background / banner / arrow assets.
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["python", "-m", "uvicorn", "api.server:app", "--host", "0.0.0.0", "--port", "8000"]
