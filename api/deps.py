"""Shared helpers for the route modules (image resolution, deck building)."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .session import IMAGE_DIR, PROJECT_ROOT, Session

# Make src/ and project root importable for plan_commercial + excel_reader.
sys.path.insert(0, str(PROJECT_ROOT / "src"))
sys.path.insert(0, str(PROJECT_ROOT))

from plan_commercial import Deck, Group, SubGroup, Product  # noqa: E402
import logging
from plan_commercial.promo_split import count_promos, expand_multi_promos  # noqa: E402
import image_assets  # noqa: E402

log = logging.getLogger(__name__)


def resolve_image(name: Optional[str]) -> Optional[str]:
    """Resolve an image reference to an absolute filesystem path.

    Accepts both the explicit relative form (``MIO/foo.png``) and the bare
    basename (``foo.png``) — the latter is searched recursively so legacy
    Excel files keep working after the user reorganises the image folder
    into brand subdirectories.

    Logs a warning when a non-empty name fails to resolve — otherwise these
    failures (e.g. `promo_gratuite_image` pointing at a deleted file) were
    silently swallowed and the renderer fell back to the packshot, leaving
    the user confused about why the gratuite image didn't show.
    """
    if not name:
        return None
    name_str = str(name).strip()
    if not name_str:
        return None
    rel = image_assets.find_relative_path(IMAGE_DIR, name_str)
    if rel:
        return str(IMAGE_DIR / rel)
    log.warning(
        "resolve_image: %r requested but no file under %s — preview will "
        "fall back to packshot. Re-upload or pick a different image.",
        name_str, IMAGE_DIR,
    )
    return None


def build_deck(
    session: Session,
    *,
    row_filter: Optional[Callable[[Dict[str, Any]], bool]] = None,
) -> Deck:
    """Build a fully populated Deck from the session's products list.

    `row_filter` (optional): predicate run against each raw session row
    BEFORE expansion. When provided and falsy, the row is skipped — no
    slide is emitted for it and its brand/sous-groupe collapse to whatever
    other rows are still in the deck. Used by the "PPT with packshot only"
    export to drop rows whose `packshot` doesn't resolve on disk.
    """
    deck = Deck(
        titre=session.titre,
        canal=session.canal,
        mois=session.mois,
        banner_path=resolve_image(session.banner),
        background_path=resolve_image(session.background),
        cover_photo_path=resolve_image(session.cover_photo),
        nouveau_lancement=bool(getattr(session, "nouveau_lancement", False)),
    )
    groups: Dict[str, Group] = {}
    subgroups: Dict[tuple, SubGroup] = {}
    for row in session.products:
        if row_filter is not None and not row_filter(row):
            continue
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
            subgroups[key] = SubGroup(
                nom=sgname,
                # The actual brand identifier is the sous_groupe whenever
                # the user has bulk-set every groupe to "Gros"/"Détail"
                # (channel labels). Carry the per-brand logo here so the
                # renderer can pick it up regardless of what Group.logo
                # ended up as. Same pattern as Group.logo above.
                logo_path=resolve_image(row.get("logo_groupe")),
            )
            groups[gname].sous_groupes.append(subgroups[key])
        elif not subgroups[key].logo_path:
            # Later row in the same sub-group may carry a logo when the
            # first row didn't — fill it in opportunistically.
            subgroups[key].logo_path = resolve_image(row.get("logo_groupe"))
        # `//` in promo_texte means several distinct offers — emit one slide each.
        for sub_row in expand_multi_promos(row):
            subgroups[key].produits.append(_make_product(sub_row))
    return deck


def row_has_resolvable_packshot(row: Dict[str, Any]) -> bool:
    """True iff `row["packshot"]` is set AND resolves to a file on disk.

    Used as the `row_filter` predicate for the "PPT with packshot only"
    export — keeps things consistent with the renderer's `resolve_image`
    semantics (basename + case-insensitive fallback), so a row is kept iff
    the renderer would actually paint a packshot for it."""
    return resolve_image(row.get("packshot")) is not None


def _make_product(row: Dict[str, Any]) -> Product:
    return Product(
        nom=str(row.get("nom") or "").strip(),
        packshot_path=resolve_image(row.get("packshot")),
        packshot2_path=resolve_image(row.get("packshot2")),
        packshot3_path=resolve_image(row.get("packshot3")),
        packshot4_path=resolve_image(row.get("packshot4")),
        packshot5_path=resolve_image(row.get("packshot5")),
        packshot6_path=resolve_image(row.get("packshot6")),
        nom_image_path=resolve_image(row.get("nom_image")),
        prix_gros=float(row.get("prix_gros") or 0),
        prix_gros_net=float(row.get("prix_gros_net") or 0),
        # Without these the Product kept prix_detail=0 and generator's
        # `_price_pair` silently fell back to the gros pair — a Détail deck
        # rendered its GROS price. Invisible while imports copied the same
        # number into both, wrong the moment they differ.
        prix_detail=float(row.get("prix_detail") or 0),
        prix_detail_net=float(row.get("prix_detail_net") or 0),
        colisage=str(row.get("colisage") or "").strip(),
        colisage_prix_gros=float(row.get("colisage_prix_gros") or 0),
        colisage_prix_gros_net=float(row.get("colisage_prix_gros_net") or 0),
        is_promo=bool(row.get("is_promo") or False),
        type_promo=str(row.get("type_promo") or ""),
        promo_achat_qte=int(row.get("promo_achat_qte") or 0),
        promo_gratuit_qte=int(row.get("promo_gratuit_qte") or 0),
        promo_remise_pct=float(row.get("promo_remise_pct") or 0),
        promo_texte=str(row.get("promo_texte") or ""),
        promo_unit=str(row.get("promo_unit") or "").strip().lower(),
        promo_carton_left=bool(row.get("promo_carton_left") or False),
        promo_carton_right=bool(row.get("promo_carton_right") or False),
        promo_ribbon_left=bool(row.get("promo_ribbon_left") or False),
        promo_ribbon_right=bool(row.get("promo_ribbon_right") or False),
        promo_carton_image=resolve_image(row.get("promo_carton_image")),
        promo_ribbon_image=resolve_image(row.get("promo_ribbon_image")),
        promo_remise_image=resolve_image(row.get("promo_remise_image")),
        promo_gratuite_image=resolve_image(row.get("promo_gratuite_image")),
        promo_gratuite_image_2=resolve_image(row.get("promo_gratuite_image_2")),
        promo_gratuite_image_3=resolve_image(row.get("promo_gratuite_image_3")),
        promo_gratuite_image_4=resolve_image(row.get("promo_gratuite_image_4")),
        promo_gratuite_nom=str(row.get("promo_gratuite_nom") or "").strip(),
        promo_gratuite_nom_2=str(row.get("promo_gratuite_nom_2") or "").strip(),
        promo_gratuite_nom_3=str(row.get("promo_gratuite_nom_3") or "").strip(),
        promo_gratuite_nom_4=str(row.get("promo_gratuite_nom_4") or "").strip(),
        promo_gratuite_lift=float(row.get("promo_gratuite_lift") or 0),
        nouveau=bool(row.get("nouveau") or False),
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
        nouveau_lancement=bool(getattr(session, "nouveau_lancement", False)),
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
