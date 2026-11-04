"""Default product-family ordering for the catalogues.

A deck groups every SKU under one brand block (sous_groupe), so the
two-level brand/SKU ordering can't express the business order, which is by
PRODUCT FAMILY (poudre main first, then IRIS poudre main, then Matic, …).
This module ranks each product name against an ordered list of family
patterns; the Ordre page button and the import path use it.

Three lists exist, picked by `preset_key(canal, marque)`:
  - Gros   → one catalogue-wide order across every brand   (GROS_FAMILIES)
  - Détail → one order per marque, MIO or ZEN   (MIO_/ZEN_DETAIL_FAMILIES)

Matching:
- names are normalised (lowercase, accents stripped, punctuation kept only
  for "a+") before testing
- a family is a list of ALTERNATIVE token sets; a product belongs to the
  first family (in list order) where every token of one alternative matches
  as a whole word
- products matching no family keep their relative order after the matched
  ones

Because the first match wins, a family that appears EARLIER must carry the
more specific pattern. The recurring trap is "pdr": the price file writes
both "Pdr Main" and "Pdr Matic", so the poudre-main families require the
"main" token and never a bare "pdr".
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

# Ordered family list for the MIO Détail catalogue, as provided by the user
# (2026-07-15). label is only used in diagnostics.
MIO_DETAIL_FAMILIES: List[Tuple[str, List[List[str]]]] = [
    # Require "main": "pdr" alone is ambiguous — the price file writes both
    # "Pdr Main" and "Pdr Matic", and this family is evaluated first, so a
    # bare ["mio","pdr"] would swallow every Matic powder too.
    ("MIO poudre main",        [["mio", "main"]]),
    ("IRIS poudre main",       [["iris"]]),
    # "MIO Matic" is the POWDER matic; the liquid one ("MIO Detergent Liq
    # Matic …") belongs to the "MIO Liquide détergent" family below, so the
    # powder pattern requires "pdr" (with a no-liq fallback for names that
    # spell neither).
    ("MIO Matic",              [["mio", "pdr", "matic"], ["mio", "poudre", "matic"]]),
    ("A+ Matic",               [["a+", "matic"]]),
    ("MIO Javel",              [["mio", "javel"], ["javel"]]),
    ("MIO Lave Sol",           [["mio", "sol"], ["lave", "sol"]]),
    ("MIO Liquide Vaisselle",  [["mio", "vaisselle"], ["vaisselle"]]),
    ("MIO Pâte",               [["mio", "pate"]]),
    # "liq" covers the price-file abbreviation ("MIO Detergent Liq Matic 1L");
    # also catches any leftover "mio matic" that the powder pattern skipped.
    ("MIO Liquide détergent",  [["mio", "liquide"], ["mio", "liq"], ["mio", "matic"]]),
    ("A+ liquide détergent",   [["a+"]]),
    ("MIO Alcool",             [["mio", "alcool"], ["alcool"]]),
    ("MIO Solution",           [["mio", "solution"]]),
    ("MIO Antibactérien",      [["mio", "antibacterien"], ["mio", "bacterien"],
                                ["antibacterien"], ["bacterien"]]),
    ("MIO Lave Vitre",         [["mio", "vitre"], ["vitre"]]),
    ("MIO Four & Fourneau",    [["mio", "four"], ["four"], ["fourneau"]]),
    ("MIO Détartrant",         [["mio", "detartrant"], ["detartrant"], ["calcaire"]]),
    ("MIO Tapis & Moquette",   [["mio", "tapis"], ["tapis"], ["moquette"]]),
    ("MIO Inox",               [["mio", "inox"], ["inox"]]),
    # "claire" matches "claire's" (the apostrophe is a word boundary);
    # "freshner" covers the price-file spelling of freshener.
    ("Clairs Air freshener",   [["clairs"], ["claire", "air"], ["air", "freshener"],
                                ["freshener"], ["freshner"]]),
    ("Claire's Savon Main",    [["savon"]]),
    # "bldx" is the price file's abbreviation ("BLDX PH x6 *9").
    ("Blandoux",               [["blandoux"], ["bldx"]]),
    ("Vita Fresh",             [["vita"]]),
]

# Ordered family list for the ZEN Détail catalogue, as provided by the user
# (2026-07-15). Unlike MIO, this list mixes ZEN-branded families with other
# brands entirely (Hand, FIX, Baño, Active, Loux, Papillon, Peña, Limpos,
# Verde, Shark) plus a few generic/no-brand lines (Bayetas, Masque) — every
# family here still gets its own ordered slot, same matching rules as MIO.
ZEN_DETAIL_FAMILIES: List[Tuple[str, List[List[str]]]] = [
    # Same "main"-not-"pdr" rule as the MIO list — see the note there.
    ("Zen poudre main",        [["zen", "main"]]),
    ("Hand Poudre main",       [["hand", "main"]]),
    ("FIX Poudre Main",        [["fix", "main"]]),
    # Powder Matic — requires "pdr" so the liquid Matic family below can
    # claim the liquid SKUs (mirrors the MIO Matic/MIO Liquide split).
    ("ZEN Matic",              [["zen", "pdr", "matic"], ["zen", "poudre", "matic"]]),
    # The list carries a single Baño slot, so every Baño SKU lands here —
    # the MATIC powders (3/9Kg) AND the liquid detergents (750mL/3L/5L).
    ("Baño Matic",             [["bano"], ["baño"]]),
    ("Zen Javel",              [["zen", "javel"]]),
    ("Zen Lave Sol",           [["zen", "sol"], ["zen", "lave", "sol"]]),
    ("ZEN Liquide vaisselle",  [["zen", "vaisselle"]]),
    ("ZEN Pâte",               [["zen", "pate"]]),
    # "liq" covers the price-file abbreviation; also catches any leftover
    # "zen matic" the powder pattern above didn't claim.
    ("ZEN Liquide Matic",      [["zen", "liquide"], ["zen", "liq"], ["zen", "matic"]]),
    # LAVA sits with the liquid detergents, right after the ZEN liquids.
    # Without an entry it scored as UNMATCHED and got appended to the very
    # end of the deck. "lava" is whole-word matched, so it can't collide
    # with "lave" (Lave Sol) or "lavande".
    ("LAVA liquide détergent", [["lava"]]),
    # Sold as "ACTIVE 4 Liquide détergent …" — no "matic" token in the name.
    ("Active Matic",           [["active"]]),
    ("LOUX LAVE MAIN",         [["loux"]]),
    ("PAPILLON",               [["papillon"]]),
    ("PEÑA",                   [["pena"], ["peña"]]),
    ("LIMPOS",                 [["limpos"]]),
    # The SKUn is just "SAC POUBELLE …"; VERDE only appears in the long
    # description, so match on the product words too.
    ("VERDE SAC POUBELLE",     [["verde"], ["sac", "poubelle"], ["poubelle"]]),
    ("Hand Carré Vaisselle",   [["hand", "carre"], ["hand", "vaisselle"]]),
    # "serpillere" also catches ZEN SERPILLERE, so both serpillères sit in
    # the same block rather than the ZEN one drifting to the end.
    ("Shark Serpillère",       [["shark"], ["serpillere"]]),
    ("Bayetas",                [["bayetas"]]),
    ("MASQUE TYPE CHIRURGICALE", [["masque"]]),
]

# Ordered family list for the Gros catalogue. Reworked 2026-10-09: the Gros
# deck used to be grouped by PRODUCT TYPE across every brand (all poudres
# main together, then all Matic, …), which made a seller jump brand to brand
# on every other slide. It now walks the MIO Détail order first, then the ZEN
# Détail order, so Gros reads exactly like the two Détail catalogues back to
# back. Two families exist only in Gros (MALA, QZI) and are slotted into the
# block they belong to.
#
# The patterns stay BRAND-QUALIFIED even where the Détail list uses a bare
# fallback: a Détail deck holds one brand, so ("MIO Javel", [["javel"]]) is
# safe there, but in Gros it would swallow ZEN Javel into the MIO slot.
GROS_FAMILIES: List[Tuple[str, List[List[str]]]] = [
    # ───────────────── bloc MIO Détail ─────────────────
    ("MIO poudre main",        [["mio", "main"]]),
    ("IRIS poudre main",       [["iris"]]),
    ("MIO Matic",              [["mio", "pdr", "matic"], ["mio", "poudre", "matic"]]),
    # "A+ Matic 750Grs" carries no "pdr" token, so a plain a+/matic pair is
    # kept as a fallback — the liquids say "Liq" and never "matic".
    ("A+ Poudre Matic",        [["a+", "pdr", "matic"], ["a+", "matic"]]),
    ("MIO Javel",              [["mio", "javel"]]),
    ("MIO Lave Sol",           [["mio", "sol"]]),
    ("MIO Liquide Vaisselle",  [["mio", "vaisselle"]]),
    ("MIO Pâte",               [["mio", "pate"]]),
    ("MIO Liquide détergent",  [["mio", "liquide"], ["mio", "liq"], ["mio", "matic"]]),
    ("A+ liquide Matic",       [["a+", "liq"], ["a+", "liquide"], ["a+"]]),
    ("MIO Alcool",             [["mio", "alcool"]]),
    ("MIO Solution",           [["mio", "solution"]]),
    # the price file writes "Anti-Bactérien"; the hyphen is a word boundary
    ("MIO Antibactérien",      [["mio", "bacterien"], ["mio", "antibacterien"]]),
    ("MIO Lave Vitre",         [["mio", "vitre"]]),
    ("MIO Four & Fourneau",    [["mio", "four"], ["mio", "fourneau"]]),
    ("MIO Détartrant",         [["mio", "detartrant"], ["mio", "calcaire"]]),
    ("MIO Tapis & Moquette",   [["mio", "tapis"], ["mio", "moquette"]]),
    ("MIO Inox",               [["mio", "inox"]]),
    ("Clairs Air freshener",   [["clairs"], ["claire", "air"], ["air", "freshener"],
                                ["freshener"], ["freshner"]]),
    # LOUX sits in the ZEN block BELOW this line, so the bare ["savon"]
    # fallback the Détail list can afford would steal "LOUX Savon Liquide".
    # Every Claire's SKU spells the brand, so require it.
    ("Claire's Savon Main",    [["claire", "savon"], ["clrs", "savon"]]),
    ("Blandoux",               [["blandoux"], ["bldx"]]),
    ("Vita Fresh",             [["vita"]]),

    # ───────────────── bloc ZEN Détail ─────────────────
    ("Zen poudre main",        [["zen", "main"]]),
    ("Hand Poudre main",       [["hand", "main"]]),
    ("FIX Poudre Main",        [["fix", "main"]]),
    # Gros-only, slotted with the other poudres main.
    ("MALA Poudre main",       [["mala"]]),
    ("ZEN Matic",              [["zen", "pdr", "matic"], ["zen", "poudre", "matic"]]),
    ("Baño Poudre Matic",      [["bano", "pdr", "matic"], ["baño", "pdr", "matic"],
                                ["bano", "matic"], ["baño", "matic"]]),
    ("Zen Javel",              [["zen", "javel"]]),
    ("Zen Lave Sol",           [["zen", "sol"]]),
    ("ZEN Liquide vaisselle",  [["zen", "vaisselle"]]),
    # Gros-only, slotted right after the other liquides vaisselle.
    ("QZI Liquide vaisselle",  [["qzi"]]),
    ("ZEN Pâte",               [["zen", "pate"]]),
    ("ZEN Liquide Matic",      [["zen", "liquide"], ["zen", "liq"], ["zen", "matic"]]),
    ("LAVA liquide détergent", [["lava"]]),
    ("Active Matic",           [["active"]]),
    # Gros splits Baño powder from Baño liquid (the Détail list has one slot
    # for both); the powders matched above, the liquids land here.
    ("Bano liquide matic",     [["bano", "liq"], ["bano", "liquide"],
                                ["baño", "liq"], ["baño", "liquide"],
                                ["bano"], ["baño"]]),
    ("LOUX LAVE MAIN",         [["loux"]]),
    ("PAPILLON",               [["papillon"]]),
    ("PEÑA",                   [["pena"], ["peña"]]),
    ("LIMPOS",                 [["limpos"]]),
    ("VERDE SAC POUBELLE",     [["verde"], ["sac", "poubelle"], ["poubelle"]]),
    ("Hand Carré Vaisselle",   [["hand", "carre"], ["hand", "vaisselle"]]),
    ("Shark Serpillère",       [["shark"], ["serpillere"]]),
    ("Bayetas",                [["bayetas"], ["microfibre"]]),
    ("MASQUE TYPE CHIRURGICALE", [["masque"]]),
]

_PRESETS: Dict[str, List[Tuple[str, List[List[str]]]]] = {
    "GROS": GROS_FAMILIES,
    "MIO": MIO_DETAIL_FAMILIES,
    "ZEN": ZEN_DETAIL_FAMILIES,
}

_UNMATCHED = 9_999


def _norm(s: str) -> str:
    """lowercase + strip accents; keeps '+' so "A+" stays matchable."""
    s = unicodedata.normalize("NFKD", str(s or ""))
    s = s.encode("ascii", "ignore").decode("ascii").lower()
    return " ".join(s.split())


def _token_matches(token: str, text: str) -> bool:
    # Whole-word match so "sol" doesn't hit "solution" and "four" doesn't
    # hit "fourneau" alone. '+' is escaped ("a+").
    return re.search(rf"(?<![\w+]){re.escape(token)}(?![\w+])", text) is not None


def get_preset(key: str) -> Optional[List[Tuple[str, List[List[str]]]]]:
    """Family list for a preset key ("GROS" / "MIO" / "ZEN")."""
    return _PRESETS.get((key or "").strip().upper())


def is_detail(canal: str) -> bool:
    """Mirror of plan_commercial.generator._is_detail — kept local so the
    API layer doesn't need the renderer import just for this check."""
    v = (canal or "").lower()
    return "détail" in v or "detail" in v


def preset_key(canal: str, marque: str = "") -> str:
    """Which family list a deck uses. Gros has ONE catalogue-wide order
    across all brands, so `marque` is ignored there; Détail is split per
    marque (MIO / ZEN)."""
    if not is_detail(canal):
        return "GROS"
    return (marque or "").strip().upper()


def family_index(nom: str, preset: List[Tuple[str, List[List[str]]]]) -> int:
    """Rank of the FIRST family (list order) the product name belongs to,
    or _UNMATCHED. First-match-wins keeps ambiguous names (e.g. 'MIO
    Detergent Pdr Main' also containing 'detergent') in the right family
    because the more specific families come first in the list."""
    text = _norm(nom)
    for i, (_label, alternatives) in enumerate(preset):
        for tokens in alternatives:
            if all(_token_matches(t, text) for t in tokens):
                return i
    return _UNMATCHED


def apply_family_order(
    rows: List[Dict[str, Any]], canal: str, marque: str = "",
) -> Tuple[List[Dict[str, Any]], int]:
    """Stable-sort `rows` by family rank for the deck's channel/marque.
    Returns (sorted_rows, matched_count). No-op (0 matched) when no preset
    covers that combination."""
    preset = get_preset(preset_key(canal, marque))
    if not preset:
        return rows, 0
    keyed = [
        (family_index(r.get("nom") or "", preset), i, r)
        for i, r in enumerate(rows)
    ]
    matched = sum(1 for k, _i, _r in keyed if k != _UNMATCHED)
    keyed.sort(key=lambda x: (x[0], x[1]))
    return [r for _k, _i, r in keyed], matched
