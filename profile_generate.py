"""Time each phase of a deck generation against the current session.

Run this while the server is NOT generating anything else:

    py -3.12 profile_generate.py

The output tells us where the seconds actually go, so we can target
optimisations instead of guessing.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Make sure session.py picks up the same PC_DATA_DIR the server uses.
os.environ.setdefault("PC_DATA_DIR", r"C:\plan_commercial_data")

PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "src"))


def stage(label: str, t0: float) -> float:
    t1 = time.perf_counter()
    print(f"  {label:<35s} {t1 - t0:7.2f}s")
    return t1


def main() -> None:
    print(f"PC_DATA_DIR = {os.environ.get('PC_DATA_DIR')}\n")

    print("Phase 1 — load session + build deck")
    t = time.perf_counter()
    from api.session import get_session
    t = stage("import api.session", t)

    s = get_session()
    t = stage(f"get_session ({len(s.products)} products)", t)

    from api.deps import build_deck
    t = stage("import api.deps (build_deck)", t)

    deck = build_deck(s)
    n_prods = sum(len(sg.produits) for g in deck.groupes for sg in g.sous_groupes)
    t = stage(f"build_deck ({n_prods} products)", t)

    print("\nPhase 2 — build_pptx (the slow part?)")
    from plan_commercial import build_pptx
    t = stage("import plan_commercial.build_pptx", t)

    pptx_bytes = build_pptx(deck, with_subgroup_dividers=False)
    t = stage(f"build_pptx → {len(pptx_bytes) / 1024 / 1024:.1f} MB in memory", t)

    print("\nPhase 3 — disk I/O")
    out = PROJECT_ROOT / "_profile_out.pptx"
    out.write_bytes(pptx_bytes)
    t = stage(f"write_bytes → {out}", t)

    out.unlink(missing_ok=True)

    print("\nDone.")


if __name__ == "__main__":
    main()
