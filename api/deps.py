"""Shared helpers for the route modules (image resolution, deck building)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from .session import IMAGE_DIR, PROJECT_ROOT, Session

# Make src/ and project root importable for plan_commercial + excel_reader.
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from plan_commercial import Deck, Group, SubGroup, Product  # noqa: E402
from plan_commercial.promo_split import count_promos, expand_multi_promos  # noqa: E402
import image_assets  # noqa: E402


def resolve_image(name: Optional[str]) -> Optional[str]:
    """Resolve an image reference to an absolute filesystem path.

    Accepts both the explicit relative form (``MIO/foo.png``) and the bare
    basename (``foo.png``) — the latter is searched recursively so legacy
    Excel files keep working after the user reorganises the image folder
    into brand subdirectories.
    """
    if not name:
        return None
    rel = image_assets.find_relative_path(IMAGE_DIR, str(name))
    return str(IMAGE_DIR / rel) if rel else None


def build_deck(session: Session) -> Deck:
    """Build a fully populated Deck from the session's products list."""
    deck = Deck(
        titre=session.titre,
        canal=session.canal,
        mois=session.mois,
        banner_path=resolve_image(session.banner),
        background_path=resolve_image(session.background),
        cover_photo_path=resolve_image(session.cover_photo),
    )
    groups: Dict[str, Group] = {}
    subgroups: Dict[tuple, SubGroup] = {}
    for row in session.products:
        gname = (row.get("groupe") or "Sans groupe").strip() or "Sans groupe"
        sgname = (row.get("sous_groupe") or "Sans sous-groupe").strip() or "Sans sous-groupe"
        if gname not in groups:
            groups[gname] = Group(
                nom=gname, logo_path=resolve_image(row.get("logo_groupe")),
            )
            deck.groupes.append(groups[gname])
        elif not groups[gname].logo_path:
            groups[gname].logo_path = resolve_image(row.get("logo_groupe"))
        key = (gname, sgname)
        if key not in subgroups:
            subgroups[key] = SubGroup(nom=sgname)
            groups[gname].sous_groupes.append(subgroups[key])
        # `//` in promo_texte means several distinct offers — emit one slide each.
        for sub_row in expand_multi_promos(row):
            subgroups[key].produits.append(_make_product(sub_row))
    return deck


def _make_product(row: Dict[str, Any]) -> Product:
    return Product(
        nom=str(row.get("nom") or "").strip(),
        packshot_path=resolve_image(row.get("packshot")),
        nom_image_path=resolve_image(row.get("nom_image")),
        prix_gros=float(row.get("prix_gros") or 0),
        prix_gros_net=float(row.get("prix_gros_net") or 0),
        colisage=str(row.get("colisage") or "").strip(),
        colisage_prix_gros=float(row.get("colisage_prix_gros") or 0),
        colisage_prix_gros_net=float(row.get("colisage_prix_gros_net") or 0),
        is_promo=bool(row.get("is_promo") or False),
        type_promo=str(row.get("type_promo") or ""),
        promo_achat_qte=int(row.get("promo_achat_qte") or 0),
        promo_gratuit_qte=int(row.get("promo_gratuit_qte") or 0),
        promo_remise_pct=float(row.get("promo_remise_pct") or 0),
        promo_texte=str(row.get("promo_texte") or ""),
        promo_carton_left=bool(row.get("promo_carton_left") or False),
        promo_carton_right=bool(row.get("promo_carton_right") or False),
        promo_ribbon_left=bool(row.get("promo_ribbon_left") or False),
        promo_ribbon_right=bool(row.get("promo_ribbon_right") or False),
        promo_carton_image=resolve_image(row.get("promo_carton_image")),
        promo_ribbon_image=resolve_image(row.get("promo_ribbon_image")),
        promo_remise_image=resolve_image(row.get("promo_remise_image")),
        promo_gratuite_image=resolve_image(row.get("promo_gratuite_image")),
        packshot_left=float(row.get("packshot_left") or 0),
        packshot_top=float(row.get("packshot_top") or 0),
        packshot_width=float(row.get("packshot_width") or 0),
        packshot_height=float(row.get("packshot_height") or 0),
    )


def make_single_product_deck(session: Session, idx: int, promo: int = 0) -> tuple:
    """Build a (deck, group, product) for previewing a single slide.

    The deck keeps the global imagery; the group carries the row's logo. We
    don't reuse `build_deck` because we want to address products by their flat
    index (the order in `session.products`), not by group/subgroup hierarchy.

    `promo` is a sub-index that selects which `//`-separated offer to render
    when the row carries multiple promos. 0 = first segment; ignored for
    rows that don't have multiple promos.
    """
    if idx < 0 or idx >= len(session.products):
        raise IndexError(idx)
    row = session.products[idx]
    sub_rows = list(expand_multi_promos(row))
    sub_idx = max(0, min(promo, len(sub_rows) - 1))
    chosen = sub_rows[sub_idx]
    deck = Deck(
        titre=session.titre, canal=session.canal, mois=session.mois,
        banner_path=resolve_image(session.banner),
        background_path=resolve_image(session.background),
        cover_photo_path=resolve_image(session.cover_photo),
    )
    group = Group(
        nom=str(chosen.get("groupe") or ""),
        logo_path=resolve_image(chosen.get("logo_groupe")),
    )
    product = _make_product(chosen)
    return deck, group, product


def get_promo_count(session: Session, idx: int) -> int:
    """How many slides row `idx` will produce after multi-promo expansion."""
    if idx < 0 or idx >= len(session.products):
        raise IndexError(idx)
    return count_promos(session.products[idx])
