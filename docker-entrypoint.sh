#!/usr/bin/env bash
# Plan Commercial container entrypoint.
#
# Ensures the single persistent root ($PC_DATA_DIR) and its required
# sub-directories exist before uvicorn starts. The named volume mounted at
# /app/data may be empty on first run; the FastAPI process expects
# images/ and archive/ to be present (state.db is created on demand).

set -euo pipefail

DATA_DIR="${PC_DATA_DIR:-/app/data}"
mkdir -p "$DATA_DIR/images" "$DATA_DIR/archive"

exec "$@"
