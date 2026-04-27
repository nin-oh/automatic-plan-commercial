@echo off
REM One-click launcher for the NiceGUI build.
cd /d "%~dp0"

echo.
echo === Plan Commercial Generator (NiceGUI) ===
echo.

where py >nul 2>&1
if %errorlevel%==0 (
    set "PY=py"
) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
        set "PY=python"
    ) else (
        echo [ERREUR] Python n'est pas installe. https://www.python.org/downloads/
        pause
        exit /b 1
    )
)

echo [1/2] Verification des dependances...
%PY% -m pip install --quiet --disable-pip-version-check -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de l'installation des dependances.
    pause
    exit /b 1
)

echo [2/2] Lancement de l'application sur http://localhost:8502 ...
echo Pour arreter: fermer cette fenetre ou Ctrl+C.
echo.
%PY% app_ng.py
pause
