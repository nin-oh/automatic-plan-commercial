"""Stable branding layer — elements repeated on every applicable slide.

Loads each stable PNG ONCE per run and hands the same BytesIO to every
add_picture() call so python-pptx deduplicates the embedded media.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from typing import Dict, Tuple

from pptx.util import Inches

logger = logging.getLogger(__name__)


# Inch-coordinates (left, top, width, height) ------------------------------
POS_HEADER   = (0.00, 0.00,  4.96, 1.66)
POS_CORNER_TR= (10.68, 0.00, 2.66, 2.29)
POS_CORNER_BL= (0.00, 5.31,  2.40, 2.19)
POS_WOOD     = (0.00, 3.77, 13.33, 3.73)


STABLE_FILES = {
    "header":    "header_ribbon_canal_gros.png",
    "corner_tr": "corner_tr_logo.png",
    "corner_bl": "corner_bl_logo.png",
    "wood":      "wood_backdrop.png",
    "underline": "red_underline.png",
}


@dataclass
class StableAssets:
    """Cache of stable image bytes, loaded once per run."""
    data: Dict[str, bytes]

    @classmethod
    def load(cls, stable_dir: Path) -> "StableAssets":
        out: Dict[str, bytes] = {}
        for key, fname in STABLE_FILES.items():
            path = stable_dir / fname
            if path.exists():
                out[key] = path.read_bytes()
            else:
                logger.warning("stable asset missing: %s", path)
        return cls(data=out)

    def stream(self, key: str) -> BytesIO:
        """Fresh BytesIO view over the cached bytes.

        python-pptx reads the stream once per add_picture call, so each call
        needs its own position, but the underlying bytes are identical and
        pptx deduplicates them in the package via content hash.
        """
        if key not in self.data:
            raise KeyError(f"stable asset not loaded: {key}")
        return BytesIO(self.data[key])


def _add(slide, stream: BytesIO, pos: Tuple[float, float, float, float]):
    l, t, w, h = pos
    return slide.shapes.add_picture(stream, Inches(l), Inches(t), Inches(w), Inches(h))


def apply_stable_layer(slide, assets: StableAssets, variant: str = "product") -> None:
    """Insert the stable branding onto `slide`. Call FIRST so unique content
    renders on top.

    Variants:
      - "cover"          header only
      - "section"        header + TR logo
      - "brand"          header + TR logo
      - "product"        header + TR + BL logos + wood backdrop
      - "closing"        header + TR logo
    """
    if "header" in assets.data:
        _add(slide, assets.stream("header"), POS_HEADER)

    want_tr = variant in {"cover", "section", "brand", "product", "closing"}
    want_bl = variant == "product"
    want_wood = variant == "product"

    if want_tr and "corner_tr" in assets.data:
        _add(slide, assets.stream("corner_tr"), POS_CORNER_TR)
    if want_bl and "corner_bl" in assets.data:
        _add(slide, assets.stream("corner_bl"), POS_CORNER_BL)
    if want_wood and "wood" in assets.data:
        shape = _add(slide, assets.stream("wood"), POS_WOOD)
        _send_to_back(shape)


def _send_to_back(shape) -> None:
    """Move a shape to the back of its slide's z-order."""
    sp = shape._element
    spTree = sp.getparent()
    spTree.remove(sp)
    spTree.insert(2, sp)  # insert right after <p:nvGrpSpPr> and <p:grpSpPr>
