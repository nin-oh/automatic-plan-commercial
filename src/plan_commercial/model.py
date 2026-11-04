from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class Product:
    nom: str = ""
    item_code: str = ""               # SAP ItemCode (primary key for SAP verification)
    packshot_path: Optional[str] = None
    # Optional 2nd-scent packshot. When set, the slide shows BOTH bottles
    # overlapping (back-left + front-right) — one diapo for two parfums.
    packshot2_path: Optional[str] = None
    # Scents 3-6. From three scents up the layout switches from the
    # overlapping pair to "hero + row": packshot_path stays full size and
    # every other scent is rendered smaller beside it, sharing one floor
    # line — sellers see the whole range on a single diapo.
    packshot3_path: Optional[str] = None
    packshot4_path: Optional[str] = None
    packshot5_path: Optional[str] = None
    packshot6_path: Optional[str] = None
    nom_image_path: Optional[str] = None
    prix_gros: float = 0.0
    prix_gros_net: float = 0.0
    prix_detail: float = 0.0
    prix_detail_net: float = 0.0
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
    # Per-product container word for the promo wording.
    # Allowed values: "" (empty = use channel default — "caisse" for Gros,
    #                     "unité" for Détail), "sac", "carton", "caisse",
    #                     "unité". The renderer pluralises automatically.
    # Lets the user override the default on a per-row basis when a promo
    # is in sacs instead of cartons, etc.
    promo_unit: str = ""
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
    promo_gratuite_image: Optional[str] = None   # primary product offered for free
    # Up to 3 additional "free" items for gratuite-with-many-items promos
    # (e.g. "16 caisses → 1 MIO MAIN 215 + 2 MIO 500g"). The renderer
    # collects every non-empty slot and subdivides the right-side zone
    # so each item gets its own bottom-anchored cell. Empty slots are
    # ignored, so a 1-item promo still renders identically to before.
    promo_gratuite_image_2: Optional[str] = None
    promo_gratuite_image_3: Optional[str] = None
    promo_gratuite_image_4: Optional[str] = None
    # Name of the SKU handed out free, per gratuite slot. Rendered as a
    # caption under its image so the slide states WHAT is free, not just
    # how many — the photo alone left sellers guessing.
    promo_gratuite_nom: str = ""
    promo_gratuite_nom_2: str = ""
    promo_gratuite_nom_3: str = ""
    promo_gratuite_nom_4: str = ""
    # Raise the free item(s) above the floor line, in inches. 0 = stand on
    # the floor like the bought pack (the default, unchanged).
    # A flat, wide free item (a wipes pack) is width-limited in its cell, so
    # bottom-anchoring leaves it sunken with dead air above while the tall
    # bought pack fills its own cell — and the arrow then points over it
    # rather than at it. Note transparent padding CANNOT do this: promo
    # packshots render with trim=True, which crops the padding straight off.
    promo_gratuite_lift: float = 0.0
    # Per-PRODUCT "nouveau" ribbon. Deck.nouveau_lancement stamps every slide
    # and drops the cover — fine for a one-product launch deck, useless for
    # flagging a single new SKU inside a full catalogue (which is why past
    # launches were pasted into the PDF as flattened images). This marks just
    # this slide.
    nouveau: bool = False


@dataclass
class SubGroup:
    nom: str = ""
    # Per-sub-group logo. Populated by `build_deck` from the row's
    # `logo_groupe` field. Used when the actual brand identifier is the
    # `sous_groupe` (e.g. groupe="Gros" / sous_groupe="MIO") — every
    # slide in the brand then gets its own logo instead of inheriting
    # whatever the parent Group ended up with from its first product.
    # The renderer falls back to `Group.logo_path` when this is None.
    logo_path: Optional[str] = None
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
    # "Nouveau lancement" mode — when True, every product slide gets a red
    # "جديد / Nouveau" ribbon in the top-centre. Off for normal decks.
    nouveau_lancement: bool = False
    groupes: List[Group] = field(default_factory=list)

    def iter_products(self):
        for g in self.groupes:
            for sg in g.sous_groupes:
                for p in sg.produits:
                    yield g, sg, p
