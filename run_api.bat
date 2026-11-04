@echo off
REM Plan Commercial — single-process launcher (FastAPI + built React).
REM Run this AFTER `pnpm --dir frontend\apps\plan-commercial build` has produced
REM the dist folder. Open http://localhost:8000/ in the browser.
REM
REM We try Python 3.12 via the `py` launcher first (most reliable on Windows
REM since 3.13/3.14 still lack prebuilt wheels for numpy/pandas/etc.). Falls
REM back to whatever `python` resolves to on PATH.

REM `setlocal` scopes PC_DATA_DIR so it doesn't leak into the parent cmd
REM and clobber Docker Compose if you later run `docker compose up` from
REM the same window. uvicorn inherits the var fine during its lifetime.
setlocal

cd /d "%~dp0"

REM Where user-mutable data lives (state.db + images/ + archive/). Kept
REM OUTSIDE OneDrive so the sync agent doesn't slow every .pptx write to a
REM crawl. Created on first run if it doesn't exist.
set PC_DATA_DIR=C:\plan_commercial_data
if not exist "%PC_DATA_DIR%" mkdir "%PC_DATA_DIR%"

where /q py && (
  py -3.12 -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
) || (
  python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
)

endlocal
