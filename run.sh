#!/usr/bin/env bash
# One-click launcher for macOS / Linux. Run: ./run.sh
set -e
cd "$(dirname "$0")"

echo
echo "=== Plan Commercial Generator ==="
echo

if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    echo "[ERREUR] Python n'est pas installe."
    echo "Installez-le: https://www.python.org/downloads/  (ou: brew install python / apt install python3)"
    exit 1
fi

echo "[1/2] Installation des dependances (premiere fois uniquement)..."
$PY -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo "[2/2] Lancement de l'application..."
echo "L'application va s'ouvrir dans votre navigateur."
echo "Pour arreter: Ctrl+C."
echo
$PY -m streamlit run app.py
