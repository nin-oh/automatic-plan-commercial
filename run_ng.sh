#!/usr/bin/env bash
# One-click launcher for the NiceGUI build (macOS / Linux).
set -e
cd "$(dirname "$0")"

echo
echo "=== Plan Commercial Generator (NiceGUI) ==="
echo

if command -v python3 >/dev/null 2>&1; then
    PY=python3
elif command -v python >/dev/null 2>&1; then
    PY=python
else
    echo "[ERREUR] Python n'est pas installe."
    exit 1
fi

echo "[1/2] Verification des dependances..."
$PY -m pip install --quiet --disable-pip-version-check -r requirements.txt

echo "[2/2] Lancement de l'application sur http://localhost:8502 ..."
echo "Pour arreter: Ctrl+C."
echo
$PY app_ng.py
