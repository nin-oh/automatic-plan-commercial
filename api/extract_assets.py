"""Extract images from a reference PPTX and categorize them.

Walks every slide, saves each Picture shape's blob to disk under
`assets/extracted/<category>/`, dedupes by content hash, and writes a manifest
listing every occurrence (slide #, position, size, source filename).

Categories are guessed from size + position + embedded filename. They're not
perfect — open the folder afterwards and re-bucket anything obviously wrong.

Usage:
    python -m api.extract_assets
    python -m api.extract_assets samples/another-deck.pptx
"""
from __future__ import annotations

import hashlib
import json
import sys
from collections import defaultdict
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PPTX = PROJECT_ROOT / "samples" / "Plan commercial Gros Avril - 2026.pptx"
OUT = PROJECT_ROOT / "assets" / "extracted"


def classify(width_in: float, height_in: float, left_in: float, top_in: float,
             image_name: str) -> str:
    """Heuristic category guess. Refine afterwards by inspecting the folder."""
    name = (image_name or '').lower()
    aspect = width_in / max(0.01, height_in)

    # Logos / brand marks: small, often in top corners or labelled
    if width_in < 2.2 and height_in < 2.2:
        if 'logo' in name:
            return 'logos'
        if top_in < 1.5 and (left_in > 10.5 or left_in < 2.5):
            return 'logos'
        return 'badges'

    # Banners: wide+thin, near top
    if aspect > 3 and height_in < 1.5 and top_in < 1.6:
        return 'banners'

    # Backgrounds: cover the slide
    if width_in > 11 and height_in > 6:
        return 'backgrounds'

    # Wide+short — ribbons, arrows, decorative strips
    if aspect > 2.5 and height_in < 1.2:
        return 'ribbons_arrows'

    # Tall+narrow — packshots (a bag, a bottle)
    if aspect < 0.85 and height_in > 2:
        return 'packshots'

    # Square-ish, medium — possibly cartons or product photos
    if 0.7 < aspect < 1.4 and width_in > 1.8:
        return 'cartons_or_photos'

    return 'unclassified'


def main():
    pptx_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PPTX
    if not pptx_path.is_absolute():
        pptx_path = PROJECT_ROOT / pptx_path
    if not pptx_path.exists():
        print(f"ERROR: {pptx_path} not found", file=sys.stderr)
        sys.exit(1)

    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Reading {pptx_path.name} ({pptx_path.stat().st_size / 1024 / 1024:.1f} MB)...")
    pres = Presentation(str(pptx_path))
    print(f"Slides: {len(pres.slides)}")

    seen: dict[str, tuple[str, str]] = {}   # sha -> (category, filename)
    counts: dict[str, int] = defaultdict(int)
    manifest: list[dict] = []

    for slide_idx, slide in enumerate(pres.slides, 1):
        for shape in slide.shapes:
            # 13 = PICTURE
            if shape.shape_type != 13:
                continue
            try:
                img = shape.image
            except Exception:
                continue

            blob = img.blob
            sha = hashlib.sha256(blob).hexdigest()[:12]

            width_in = Emu(shape.width or 0).inches
            height_in = Emu(shape.height or 0).inches
            left_in = Emu(shape.left or 0).inches
            top_in = Emu(shape.top or 0).inches
            ext = img.ext or 'png'
            name = getattr(img, 'filename', None) or shape.name or 'image'

            category = classify(width_in, height_in, left_in, top_in, name)

            if sha not in seen:
                cat_dir = OUT / category
                cat_dir.mkdir(exist_ok=True)
                out_name = f"{sha}_{width_in:.1f}x{height_in:.1f}.{ext}"
                (cat_dir / out_name).write_bytes(blob)
                seen[sha] = (category, out_name)
                counts[category] += 1

            manifest.append({
                'slide': slide_idx,
                'name': name,
                'category': seen[sha][0],
                'file': seen[sha][1],
                'left_in': round(left_in, 2),
                'top_in': round(top_in, 2),
                'width_in': round(width_in, 2),
                'height_in': round(height_in, 2),
                'size_kb': len(blob) // 1024,
                'sha': sha,
            })

    (OUT / 'manifest.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding='utf-8'
    )

    # Per-image usage report — find the most-reused images (likely brand
    # elements: logos, banners, the wood background)
    usage: dict[str, list[int]] = defaultdict(list)
    for m in manifest:
        usage[m['sha']].append(m['slide'])

    most_reused = sorted(usage.items(), key=lambda x: -len(x[1]))[:15]

    # Console summary
    print("\nBy category (unique images):")
    for cat, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {cat:20s} {n}")
    print(f"\nTotal unique images: {len(seen)}")
    print(f"Total picture references across all slides: {len(manifest)}")
    print(f"\nMost-reused images (likely brand elements):")
    for sha, slides in most_reused:
        cat, fn = seen[sha]
        print(f"  [{len(slides):3d}× across slides] {cat}/{fn}")

    print(f"\nOutput: {OUT}")
    print(f"Manifest: {OUT / 'manifest.json'}")


if __name__ == '__main__':
    main()
