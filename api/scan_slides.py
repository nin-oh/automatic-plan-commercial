"""Scan every slide for text — flag promo / discount slides so we know
which slide numbers to inspect in PowerPoint for badges/ribbons/arrows
that aren't embedded as images.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from pptx import Presentation

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PPTX = PROJECT_ROOT / "samples" / "Plan commercial Gros Avril - 2026.pptx"

PROMO_KEYWORDS = [
    'remise', 'gratuit', 'gratuite', 'promo', 'offre',
    'caisse', 'pour', 'bombe', 'achat', 'achete',
    '%', '−', 'cadeau',
]


def main():
    pptx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PPTX
    if not pptx_path.exists():
        print(f"ERROR: {pptx_path} not found", file=sys.stderr)
        sys.exit(1)

    pres = Presentation(str(pptx_path))
    print(f"Scanning {len(pres.slides)} slides for promo content...\n")

    promo_slides: list[tuple[int, str, list[str]]] = []

    for idx, slide in enumerate(pres.slides, 1):
        text_chunks: list[str] = []
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    t = run.text.strip()
                    if t:
                        text_chunks.append(t)

        full_text = ' | '.join(text_chunks).lower()
        matches = [k for k in PROMO_KEYWORDS if k in full_text]
        if matches:
            # Try to find the product title (longest text on slide)
            title = max(text_chunks, key=len, default='').strip()[:60]
            promo_slides.append((idx, title, matches))

    if not promo_slides:
        print("No slides matched promo keywords.")
        return

    print(f"{len(promo_slides)} slide(s) match promo keywords:\n")
    for idx, title, matches in promo_slides:
        print(f"  Slide {idx:3d}: {title!r}")
        print(f"             matched: {', '.join(matches)}")
    print()
    print("→ Open the PPTX in PowerPoint, jump to these slide numbers,")
    print("  and look for: arrows, ribbons, discount badges, carton stacks.")
    print("  Anything you see that's NOT in assets/extracted/ is drawn")
    print("  as a PowerPoint shape — we'll need to capture it differently.")


if __name__ == '__main__':
    main()
