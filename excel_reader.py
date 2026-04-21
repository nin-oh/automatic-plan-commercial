"""Parse PL_Changes_*.xlsx into Product records.

The workbook has two sheets:
- `ByFPC`: one row per Item Code (SKU variant with its own prices).
- `BySKU`: aggregated per SKU (same price applies to all its variants).

Header row is on row 5; data starts at row 6 (openpyxl rows are 1-indexed).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

from openpyxl import load_workbook

CATEGORY_ORDER = [
    "Detergent Pdr Main",
    "Detergent Pdr Matic",
    "Detergent Liquide",
    "Liquide Vaisselle",
    "Pâte",
    "Javel",
]


@dataclass
class Product:
    item_code: str
    description: str
    sku: str
    category: str
    brand: str
    change: str        # "Augmentation" | "Baisse" | "Simplification" | ""
    bp_new: Optional[float] = None
    net_new: Optional[float] = None
    promo_new: str = ""
    bp_old: Optional[float] = None
    net_old: Optional[float] = None
    promo_old: str = ""

    @property
    def bp_changed(self) -> bool:
        return _diff(self.bp_new, self.bp_old)

    @property
    def net_changed(self) -> bool:
        return _diff(self.net_new, self.net_old)


def _diff(a, b) -> bool:
    if a is None or b is None:
        return a != b
    return abs(float(a) - float(b)) > 1e-6


def _s(v) -> str:
    return "" if v is None else str(v).strip()


def _f(v) -> Optional[float]:
    if v is None or (isinstance(v, str) and not v.strip()):
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def read_byfpc(xlsx_path: str | Path, header_row: int = 5) -> List[Product]:
    """Load the ByFPC sheet into Product records.

    Column indices:
      A Item Code | B Item Description | C SKU | D Category | E Brand | F Change |
      G blank | H Gros_BP_new | I Promo_Txt_new | J Gros_Net_new |
      K blank | L Gros_BP_old | M Promo_Txt_old | N Gros_Net_old
    """
    wb = load_workbook(filename=str(xlsx_path), data_only=True, read_only=True)
    if "ByFPC" not in wb.sheetnames:
        raise ValueError(f"Sheet 'ByFPC' missing in {xlsx_path}")
    ws = wb["ByFPC"]
    products: List[Product] = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        r = list(row) + [None] * max(0, 14 - len(row))
        item_code = _s(r[0])
        if not item_code:
            continue
        products.append(Product(
            item_code=item_code,
            description=_s(r[1]),
            sku=_s(r[2]),
            category=_s(r[3]),
            brand=_s(r[4]),
            change=_s(r[5]),
            bp_new=_f(r[7]),
            promo_new=_s(r[8]),
            net_new=_f(r[9]),
            bp_old=_f(r[11]),
            promo_old=_s(r[12]),
            net_old=_f(r[13]),
        ))
    return products


def read_bysku(xlsx_path: str | Path, header_row: int = 5) -> List[Product]:
    """Load the BySKU sheet (aggregated: one row per SKU).

    Column indices:
      A SKU | B Category | C Brand | D Change | E blank |
      F Gros_BP_new | G Promo_Txt_new | H Gros_Net_new |
      I blank | J Gros_BP_old | K Promo_Txt_old | L Gros_Net_old

    Populates `item_code` = `sku` (same identifier, for packshot lookup).
    `description` defaults to the SKU string since BySKU has no separate
    description column.
    """
    wb = load_workbook(filename=str(xlsx_path), data_only=True, read_only=True)
    if "BySKU" not in wb.sheetnames:
        raise ValueError(f"Sheet 'BySKU' missing in {xlsx_path}")
    ws = wb["BySKU"]
    products: List[Product] = []
    for row in ws.iter_rows(min_row=header_row + 1, values_only=True):
        r = list(row) + [None] * max(0, 12 - len(row))
        sku = _s(r[0])
        if not sku:
            continue
        products.append(Product(
            item_code=sku,
            description=sku,
            sku=sku,
            category=_s(r[1]),
            brand=_s(r[2]),
            change=_s(r[3]),
            bp_new=_f(r[5]),
            promo_new=_s(r[6]),
            net_new=_f(r[7]),
            bp_old=_f(r[9]),
            promo_old=_s(r[10]),
            net_old=_f(r[11]),
        ))
    return products


def grouped(products: List[Product]):
    """Yield (category, [(brand, [Product, ...]), ...]) in the reference order."""
    seen = {}
    for p in products:
        seen.setdefault(p.category, {}).setdefault(p.brand, []).append(p)

    ordered_cats = [c for c in CATEGORY_ORDER if c in seen]
    # Append any unknown categories at the end (preserving first-seen order)
    for c in seen:
        if c not in ordered_cats:
            ordered_cats.append(c)

    for cat in ordered_cats:
        brands = seen[cat]
        yield cat, [(b, brands[b]) for b in brands]


def print_tree(products: List[Product]) -> None:
    for cat, brands in grouped(products):
        print(f"[{cat}]  ({sum(len(v) for _, v in brands)} SKUs)")
        for brand, items in brands:
            print(f"  {brand}:")
            for p in items:
                tag = f"  [{p.change}]" if p.change else ""
                print(f"    - {p.item_code}  {p.description}{tag}")
