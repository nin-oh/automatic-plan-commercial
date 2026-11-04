@echo off
title Plan Commercial (local)
cd /d "%~dp0"
set PYTHONPATH=src
set PC_DATA_DIR=%~dp0data

echo ==========================================================
echo   PLAN COMMERCIAL
echo   Ouvre sur : http://localhost:8000
echo.
echo   Laissez cette fenetre OUVERTE tant que vous utilisez l'app.
echo   Fermez-la (ou Ctrl+C) pour arreter le serveur.
echo ==========================================================
echo.

REM Ouvre le navigateur apres 3s (le temps que le serveur demarre)
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:8000"

".venv\Scripts\python.exe" -m uvicorn api.server:app --host 0.0.0.0 --port 8000

echo.
echo Serveur arrete. Appuyez sur une touche pour fermer.
pause >nul
