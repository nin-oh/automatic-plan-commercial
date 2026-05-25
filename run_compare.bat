@echo off
REM Launch BOTH frontends side-by-side for visual comparison.
REM
REM   FastAPI backend          → :8000  (Plan Commercial only — Amafin
REM                                       expects Django, not running)
REM   Amafin Vite              → http://localhost:5173/react/
REM   Plan Commercial Vite     → http://localhost:5174/
REM
REM Three terminals open. The Amafin data pages (Factures, Soldes, etc.)
REM will show fetch errors because Django is not running — but the splash,
REM sidebar, navbar, page shells and visual styling all render fine, which
REM is what you want for a side-by-side comparison.

cd /d "%~dp0"
start "Plan Commercial API"        cmd /k python -m uvicorn api.server:app --host 0.0.0.0 --port 8000 --reload
start "Amafin Frontend (5173)"     cmd /k pnpm --dir frontend\apps\amafin dev
start "Plan Commercial Frontend (5174)" cmd /k pnpm --dir frontend\apps\plan-commercial dev
