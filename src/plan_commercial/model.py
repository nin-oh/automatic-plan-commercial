from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Product:
    nom: str = ""
    packshot_path: Optional[str] = None
    nom_image_path: Optional[str] = None
    prix_gros: float = 0.0
    prix_gros_net: float = 0.0
    colisage: str = ""
    colisage_prix_gros: float = 0.0
    colisage_prix_gros_net: float = 0.0
    # Promo (optional)
    is_promo: bool = False
    type_promo: str = ""          # "gratuite" | "remise" | "remise+gratuite"
    promo_achat_qte: int = 0
    promo_gratuit_qte: int = 0
    promo_remise_pct: float = 0.0
    promo_texte: str = ""
    # Packshot position overrides (in inches). 0 = use default from layout.
    packshot_left: float = 0.0
    packshot_top: float = 0.0
    packshot_width: float = 0.0
    packshot_height: float = 0.0
    # Promo decoration toggles — both default OFF so a fresh promo slide is
    # just the two packshots. Users opt in per-side via these flags. When a
    # decoration is on:
    #   - the carton is rendered BEHIND the packshot (packshot in front)
    #   - the ribbon is rendered as a corner overlay on the bag
    promo_carton_left: bool = False
    promo_carton_right: bool = False
    promo_ribbon_left: bool = False
    promo_ribbon_right: bool = False
    # Optional image overrides (empty → fall back to assets/builtin/default_*.png)
    promo_carton_image: Optional[str] = None
    promo_ribbon_image: Optional[str] = None
    # Per-role product images. Sometimes the offered product on the right
    # is a different SKU than the bought one on the left, and in
    # `remise+gratuite` mode there can even be TWO distinct products on the
    # right (one earning the discount, one given for free). Empty values
    # fall back to `packshot_path` (the bought product).
    promo_remise_image: Optional[str] = None     # product receiving the remise
    promo_gratuite_image: Optional[str] = None   # product offered for free


@dataclass
class SubGroup:
    nom: str = ""
    produits: List[Product] = field(default_factory=list)


@dataclass
class Group:
    nom: str = ""
    logo_path: Optional[str] = None
    sous_groupes: List[SubGroup] = field(default_factory=list)


@dataclass
class Deck:
    titre: str = "Plan Commercial"
    canal: str = "Canal Gros"
    mois: str = "Avril 2026"
    banner_path: Optional[str] = None
    background_path: Optional[str] = None
    cover_photo_path: Optional[str] = None
    groupes: List[Group] = field(default_factory=list)

    def iter_products(self):
        for g in self.groupes:
            for sg in g.sous_groupes:
                for p in sg.produits:
                    yield g, sg, p
