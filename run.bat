@echo off
REM One-click launcher for Windows. Double-click this file.
cd /d "%~dp0"

echo.
echo === Plan Commercial Generator ===
echo.

REM Detect Python (prefer the "py" launcher, fall back to "python")
where py >nul 2>&1
if %errorlevel%==0 (
    set "PY=py"
) else (
    where python >nul 2>&1
    if %errorlevel%==0 (
        set "PY=python"
    ) else (
        echo [ERREUR] Python n'est pas installe.
        echo Telechargez-le ici: https://www.python.org/downloads/
        echo IMPORTANT: cochez "Add python.exe to PATH" pendant l'installation.
        echo.
        pause
        exit /b 1
    )
)

echo [1/2] Installation des dependances (premiere fois uniquement, sois patient)...
%PY% -m pip install --quiet --disable-pip-version-check -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERREUR] Echec de l'installation des dependances.
    pause
    exit /b 1
)

echo [2/2] Lancement de l'application...
echo L'application va s'ouvrir dans votre navigateur.
echo Pour arreter: fermer cette fenetre ou Ctrl+C.
echo.
%PY% -m streamlit run app.py
pause
