# Running Plan Commercial in Docker

Single-container image that bundles the FastAPI backend, the built React UI,
and the Microsoft ODBC driver needed by the SAP import. Designed to run on
Linux (your dev machine, a server, or Docker Desktop on Windows/macOS).

## TL;DR

```bash
docker compose up -d --build
# UI:  http://localhost:8000/
# API: http://localhost:8000/api/...
```

That's it. The compose file wires named volumes for user uploads and
generated decks so they persist across restarts.

To stop:

```bash
docker compose down            # stop, keep data
docker compose down -v         # stop AND wipe images + archive volumes
```

## What's in the image

| Layer | Contents |
|---|---|
| Stage 1 (`node:20-bookworm-slim`) | pnpm workspace install → `vite build` of `@plan-commercial/app` |
| Stage 2 (`python:3.12-slim-bookworm`) | FastAPI + uvicorn + python-pptx + Pillow + pyodbc + `msodbcsql18` |
| App code | `api/`, `src/`, `image_assets.py`, `excel_reader.py` |
| Static defaults | `assets/builtin/` (wood background, banner, arrows…) and `samples/` (MIO-Détail intro pptx + example xlsx) |
| Built UI | `frontend/apps/plan-commercial/dist/` (copied from stage 1) |

## Persistent data

One mount point holds everything user-modifiable. The default uses a named
Docker volume, but it's overridable via `.env`:

| Setting | Default | Override (in `.env`) |
|---|---|---|
| Container path | `/app/data` | `PC_DATA_DIR=/app/data` (rarely changed) |
| Host side | Named volume `pc_data` | `PC_DATA_HOST=D:/plan_commercial_data` |

Inside the container, `state.db` (current deck), `images/` (user uploads),
and `archive/` (generated decks) all live under `$PC_DATA_DIR`. Built-in
graphics ship at `/app/assets/builtin/` inside the image (not a volume),
so they update with each release.

### Configuring via `.env`

Copy the template and edit:

```bash
cp .env.example .env
# edit .env — typical change: point PC_DATA_HOST at a host folder
docker compose up -d --build
```

Compose auto-loads `.env` from the same directory — no flags needed. The
file is git-ignored, so per-host paths and any future secrets stay out of
commits.

**Common configurations:**

```ini
# Default — Docker manages everything, you don't see it on the host
PC_DATA_HOST=pc_data

# Browsable host folder — easy to back up, inspect, restore
PC_DATA_HOST=D:/plan_commercial_data

# Linux server
PC_DATA_HOST=/var/lib/plan-commercial
```

When you switch from a named volume to a host folder (or back), the data
doesn't move automatically — copy the contents over yourself if you want
to keep the existing deck.

### Backup / restore

```bash
# Snapshot
docker run --rm -v pc_data:/data -v "$PWD":/backup busybox \
    tar czf /backup/pc-backup.tgz -C /data .

# Restore (into a fresh volume)
docker volume create pc_data
docker run --rm -v pc_data:/data -v "$PWD":/backup busybox \
    tar xzf /backup/pc-backup.tgz -C /data
```

### Inspecting the SQLite store

```bash
docker compose exec app sqlite3 /app/data/state.db \
    "SELECT position, nom, prix_gros FROM products ORDER BY position LIMIT 5"
```

### First-run migration

If you upgrade an older install (pre-SQLite) and copy the existing
`assets/session.json` into the volume root (i.e. `/app/data/session.json`)
before first start, the container imports it automatically and renames the
file to `session.json.bak`. The HTTP API and the on-disk image layout do
not change.

## Building without compose

```bash
docker build -t plan-commercial:latest .
docker run --rm -p 8000:8000 \
    -v pc_images:/app/assets/images \
    -v pc_archive:/app/archive \
    plan-commercial:latest
```

## Talking to SAP from inside the container

The default bridge network can route to LAN addresses if your host can.
Just enter the SAP creds in the UI; the container reaches `192.168.1.240`
through the host.

If your network setup makes that fail (some Docker-Desktop / VPN combos),
uncomment `network_mode: host` in `docker-compose.yml`. That shares the
host network namespace directly — useful for SQL Server on a private LAN.

The Microsoft ODBC driver shipped is **msodbcsql18** with
`Encrypt=no;TrustServerCertificate=yes` already baked into the connection
string in `api/routes/sap.py`, which matches typical on-prem SAP B1
warehouses that don't present a trusted TLS cert.

## Healthcheck

```bash
docker inspect --format='{{.State.Health.Status}}' plan-commercial
```

The healthcheck polls `GET /api/health` every 30 s; if you see `unhealthy`,
follow with `docker compose logs app` to find the cause.

## Updating to a new version

```bash
git pull
docker compose build --no-cache app
docker compose up -d
```

Named volumes survive the rebuild — only the code/UI layer is replaced.

## Common pitfalls

- **"npm ERR! missing script: build"** during image build → you're probably
  on a different package layout. The Dockerfile builds `@plan-commercial/app`
  via `pnpm --filter`; verify `frontend/apps/plan-commercial/package.json`
  still has a `build` script.
- **`pyodbc.Error: ('IM002', 'Data source name not found...')`** at SAP test
  → the ODBC driver didn't install. Rebuild with `--no-cache`; on ARM
  Macs the apt repository for msodbcsql18 supports arm64 only on Debian 12+,
  which is what this image uses.
- **404 on uploaded images after a `down -v`** → you wiped the volumes.
  Re-upload, or restore from a backup of `pc_images`.
