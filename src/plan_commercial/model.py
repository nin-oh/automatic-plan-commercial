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
