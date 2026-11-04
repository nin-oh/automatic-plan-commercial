@echo off
REM Plan Commercial — DEV mode (two processes with hot reload).
REM   FastAPI on :8000   (the API + user-image host at /files)
REM   Vite     on :5174  (Plan Commercial app with HMR; proxies /api -> :8000)
REM
REM Open http://localhost:5174/ for the live-reloading UI.

REM `setlocal` scopes PC_DATA_DIR to this script's lifetime — the variable
REM is COPIED into the `start`-ed child windows but DOESN'T leak back into
REM the parent cmd. Otherwise running this script then `docker compose up`
REM in the same cmd would break Docker's volume substitution (the leftover
REM PC_DATA_DIR overrides docker-compose.yml's default).
setlocal

cd /d "%~dp0"

REM Where user-mutable data lives (state.db + images/ + archive/). Kept
REM OUTSIDE OneDrive so the sync agent doesn't slow every .pptx write to a
REM crawl. Created on first run if it doesn't exist.
set PC_DATA_DIR=C:\plan_commercial_data
if not exist "%PC_DATA_DIR%" mkdir "%PC_DATA_DIR%"

where /q py && (
  start "Plan Commercial API" cmd /k "set PC_DATA_DIR=%PC_DATA_DIR% && py -3.12 -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload"
) || (
  start "Plan Commercial API" cmd /k "set PC_DATA_DIR=%PC_DATA_DIR% && python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload"
)
start "Plan Commercial Frontend" cmd /k pnpm --dir frontend\apps\plan-commercial dev

endlocal
