"""Multi-promo expansion: split rows whose `promo_texte` contains `//`.

In the source spreadsheets, a single product line can carry several distinct
promotional offers separated by `//` — e.g. `1cs -> 15.2 // 2cs -> 15` (two
tiered remises) or `1cs -> 2u // 2cs -> 4u + 2.3% red` (gratuite then mixed).
We render each segment as its own slide.

`expand_multi_promos(row)` yields one or more session-style dicts. For each
extracted segment we best-effort parse:
  - `type_promo`     ('remise' | 'gratuite' | 'remise+gratuite')
  - `promo_achat_qte`  (cartons to buy, LHS of `->`)
  - `promo_gratuit_qte`(free units, first `Nu` on RHS)
  - `promo_remise_pct` (percent off, if any)
  - `promo_texte`      (cleaned segment text)

When parsing fails we fall back to the row's existing values so callers stay
robust against unusual phrasings.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterator, List


_ARROW = re.compile(r"->|→|=>")
_BUY_QTY = re.compile(r"(\d+)\s*(?:cs|caisse[s]?|carton[s]?|u\b|unit[eé]s?)", re.IGNORECASE)
_PCT = re.compile(r"(\d+(?:[.,]\d+)?)\s*%")
# Strip "<price> per u" before searching for free units, so a price-per-unit
# remise (`4u -> 7.70 per u`) doesn't get mistaken for a gratuite.
_PER_UNIT_PRICE = re.compile(r"\d+(?:[.,]\d+)?\s*per\s*u\b", re.IGNORECASE)
_FREE_UNITS = re.compile(r"(\d+)\s*u\b", re.IGNORECASE)


def split_promo_text(text: Any) -> List[str]:
    """Return the `//`-separated, stripped, non-empty segments of `text`."""
    if text is None:
        return []
    s = str(text)
    if not s.strip():
        return []
    return [p.strip() for p in s.split("//") if p.strip()]


def parse_segment(segment: str) -> Dict[str, Any]:
    """Best-effort parse of one promo segment.

    Returns a dict with the four promo fields plus the cleaned text. The
    caller decides whether to override the source row's defaults with these.
    """
    text = (segment or "").strip()
    out: Dict[str, Any] = {
        "type_promo": "",
        "promo_achat_qte": 0,
        "promo_gratuit_qte": 0,
        "promo_remise_pct": 0.0,
        "promo_texte": text,
    }
    if not text:
        return out

    arrow = _ARROW.search(text)
    lhs = text[: arrow.start()] if arrow else text
    rhs = text[arrow.end():] if arrow else ""

    m_buy = _BUY_QTY.search(lhs)
    if m_buy:
        try:
            out["promo_achat_qte"] = int(m_buy.group(1))
        except ValueError:
            pass

    m_pct = _PCT.search(rhs)
    if m_pct:
        try:
            out["promo_remise_pct"] = float(m_pct.group(1).replace(",", "."))
        except ValueError:
            pass

    rhs_no_price = _PER_UNIT_PRICE.sub("", rhs)
    m_free = _FREE_UNITS.search(rhs_no_price)
    if m_free:
        try:
            out["promo_gratuit_qte"] = int(m_free.group(1))
        except ValueError:
            pass

    has_grat = out["promo_gratuit_qte"] > 0
    has_rem = out["promo_remise_pct"] > 0
    if has_grat and has_rem:
        out["type_promo"] = "remise+gratuite"
    elif has_grat:
        out["type_promo"] = "gratuite"
    else:
        # Includes price-based remises (`1cs -> 15.2`) where no % is parsed
        # but the offer is still effectively a price drop.
        out["type_promo"] = "remise"
    return out


def count_promos(row: Dict[str, Any]) -> int:
    """How many slides this row will produce. 1 for non-promos or no `//`."""
    if not row.get("is_promo"):
        return 1
    n = len(split_promo_text(row.get("promo_texte")))
    return n if n > 1 else 1


def expand_multi_promos(row: Dict[str, Any]) -> Iterator[Dict[str, Any]]:
    """Yield one row per `//`-separated promo segment.

    - Non-promo rows pass through unchanged.
    - Promo rows without `//` pass through unchanged.
    - Promo rows with `//` yield N rows; each carries the parsed type/qty/pct
      derived from its segment, with the segment text as `promo_texte`.
    """
    if not row.get("is_promo"):
        yield row
        return
    segments = split_promo_text(row.get("promo_texte"))
    if len(segments) <= 1:
        yield row
        return
    for seg in segments:
        parsed = parse_segment(seg)
        new_row = dict(row)
        # Each split segment is its own offer — its parsed quantities/percent
        # are authoritative. The source row's fields described the combined
        # text and would otherwise bleed across segments (e.g. an 8.85% remise
        # leaking onto a `4u -> 7.70 per u` text-only segment).
        new_row["type_promo"] = parsed["type_promo"] or row.get("type_promo") or ""
        new_row["promo_texte"] = parsed["promo_texte"]
        new_row["promo_achat_qte"] = parsed["promo_achat_qte"]
        new_row["promo_gratuit_qte"] = parsed["promo_gratuit_qte"]
        new_row["promo_remise_pct"] = parsed["promo_remise_pct"]
        yield new_row
