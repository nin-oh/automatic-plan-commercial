"""Generate a visual contact sheet of every extracted asset.

Reads `assets/extracted/manifest.json` (produced by `extract_assets.py`),
groups images by category, sorts each group by reuse count (most-reused first
— those are usually the brand elements), and writes a single HTML file with
thumbnail grids.

Open the result in a browser and scroll through. Each tile shows the image,
its size, how many slides it appears on, and its filename.

Usage:
    python -m api.contact_sheet
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXTRACTED = PROJECT_ROOT / "assets" / "extracted"
OUT = EXTRACTED / "contact_sheet.html"


def main():
    manifest_path = EXTRACTED / "manifest.json"
    if not manifest_path.exists():
        print("Run `python -m api.extract_assets` first.")
        return

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    # Group occurrences by sha (unique image)
    by_sha: dict[str, dict] = {}
    for m in manifest:
        sha = m["sha"]
        if sha not in by_sha:
            by_sha[sha] = {
                **m,
                "slides_used": [m["slide"]],
            }
        else:
            by_sha[sha]["slides_used"].append(m["slide"])

    # Group by category
    by_category: dict[str, list[dict]] = defaultdict(list)
    for entry in by_sha.values():
        by_category[entry["category"]].append(entry)

    # Sort each category by usage count desc
    for cat in by_category:
        by_category[cat].sort(key=lambda e: -len(e["slides_used"]))

    # Build HTML
    parts = ['<!DOCTYPE html><html><head><meta charset="utf-8">']
    parts.append('<title>Plan Commercial — assets extraits</title>')
    parts.append("""
    <style>
      * { box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, sans-serif;
        background: #f4f4f5; color: #18181b; margin: 0; padding: 24px;
      }
      h1 { margin: 0 0 4px; font-size: 22px; }
      h2 {
        margin: 32px 0 12px; font-size: 15px;
        text-transform: uppercase; letter-spacing: 1px; color: #71717a;
        border-bottom: 1px solid #e4e4e7; padding-bottom: 6px;
      }
      .hint { color: #71717a; font-size: 12px; margin-bottom: 16px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 10px;
      }
      .card {
        background: #fff; border: 1px solid #e4e4e7; border-radius: 10px;
        padding: 8px; display: flex; flex-direction: column; gap: 6px;
        transition: transform 120ms, box-shadow 120ms;
      }
      .card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(0,0,0,0.08); }
      .thumb {
        height: 130px; background:
          linear-gradient(45deg, #f4f4f5 25%, transparent 25%, transparent 75%, #f4f4f5 75%),
          linear-gradient(45deg, #f4f4f5 25%, #fff 25%, #fff 75%, #f4f4f5 75%);
        background-size: 16px 16px; background-position: 0 0, 8px 8px;
        border-radius: 6px; display: flex; align-items: center; justify-content: center;
        overflow: hidden;
      }
      .thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
      .meta { font-size: 10.5px; color: #52525b; line-height: 1.4; }
      .file { font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
              color: #a1a1aa; word-break: break-all; }
      .badge {
        display: inline-block; padding: 1px 6px; border-radius: 999px;
        background: #6366f1; color: #fff; font-size: 9.5px; font-weight: 700;
      }
      .badge.lots { background: #f97316; }
      .summary {
        background: #fff; padding: 14px 18px; border-radius: 10px;
        border: 1px solid #e4e4e7; margin-bottom: 20px;
      }
      .summary table { font-size: 13px; }
      .summary td { padding: 2px 12px 2px 0; }
    </style>
    """)
    parts.append('</head><body>')
    parts.append('<h1>Plan Commercial — assets extraits</h1>')
    parts.append('<p class="hint">Cliquez/zoomez sur une image pour la voir en grand. '
                 'Les images les plus utilisées sont en haut de chaque section — ce sont '
                 'généralement les éléments de marque (logos, banners, fonds).</p>')

    # Summary
    total_unique = sum(len(v) for v in by_category.values())
    total_refs = sum(len(e["slides_used"]) for v in by_category.values() for e in v)
    parts.append('<div class="summary"><table>')
    parts.append(f'<tr><td><b>{total_unique}</b></td><td>images uniques</td></tr>')
    parts.append(f'<tr><td><b>{total_refs}</b></td><td>occurrences sur les slides</td></tr>')
    for cat, items in sorted(by_category.items(), key=lambda x: -len(x[1])):
        parts.append(f'<tr><td><b>{len(items)}</b></td><td>{cat}</td></tr>')
    parts.append('</table></div>')

    # Per-category grids
    for cat, items in sorted(by_category.items(), key=lambda x: -len(x[1])):
        parts.append(f'<h2>{cat} <span style="color:#a1a1aa;font-weight:400">({len(items)})</span></h2>')
        parts.append('<div class="grid">')
        for entry in items:
            n = len(entry["slides_used"])
            badge_class = 'badge lots' if n >= 5 else 'badge'
            rel_path = f"{entry['category']}/{entry['file']}"
            parts.append(f"""
            <div class="card">
              <div class="thumb"><img src="{rel_path}" alt="" loading="lazy" /></div>
              <div class="meta">
                <span class="{badge_class}">{n}× slides</span>
                <span style="margin-left:6px">{entry['width_in']}″ × {entry['height_in']}″ · {entry['size_kb']} KB</span>
              </div>
              <div class="file">{entry['file']}</div>
            </div>
            """)
        parts.append('</div>')

    parts.append('</body></html>')
    OUT.write_text("\n".join(parts), encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Open: file:///{OUT.as_posix()}")


if __name__ == "__main__":
    main()
