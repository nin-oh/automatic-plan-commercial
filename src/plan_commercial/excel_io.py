from io import BytesIO
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple

import pandas as pd

from .model import Deck, Group, Product, SubGroup

PRODUIT_COLS = [
    "groupe", "sous_groupe", "nom",
    "packshot", "nom_image",
    "prix_gros", "prix_gros_net",
    "colisage", "colisage_prix_gros", "colisage_prix_gros_net",
    "logo_groupe",
    # Promo fields
    "is_promo", "type_promo",
    "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct",
    "promo_texte",
]


def write_template(output_path: Optional[str] = None) -> bytes:
    """Write a blank Excel template (Meta + Produits sheets)."""
    meta_df = pd.DataFrame({
        "cle": ["titre", "canal", "mois"],
        "valeur": ["Plan Commercial", "Canal Gros", "Avril 2026"],
    })
    example = [
        {
            "groupe": "MIO", "sous_groupe": "Poudre Main",
            "nom": "Mio Poudre Main 10 Kg",
            "packshot": "mio_poudre_10kg.png", "nom_image": "",
            "prix_gros": 127.0, "prix_gros_net": 127.0,
            "colisage": "SAC", "colisage_prix_gros": 127.0, "colisage_prix_gros_net": 127.0,
            "logo_groupe": "mio_logo.png",
            "is_promo": False, "type_promo": "",
            "promo_achat_qte": 0, "promo_gratuit_qte": 0, "promo_remise_pct": 0.0,
            "promo_texte": "",
        },
        {
            "groupe": "IRIS", "sous_groupe": "Poudre Main",
            "nom": "IRIS Poudre main 1 KG x12",
            "packshot": "iris_1kg.png", "nom_image": "",
            "prix_gros": 11.80, "prix_gros_net": 10.73,
            "colisage": "SAC de 12",
            "colisage_prix_gros": 141.6, "colisage_prix_gros_net": 128.73,
            "logo_groupe": "iris_logo.png",
            "is_promo": True, "type_promo": "gratuite",
            "promo_achat_qte": 10, "promo_gratuit_qte": 1, "promo_remise_pct": 0.0,
            "promo_texte": "",
        },
    ]
    produits_df = pd.DataFrame(example, columns=PRODUIT_COLS)

    buf = BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        meta_df.to_excel(writer, sheet_name="Meta", index=False)
        produits_df.to_excel(writer, sheet_name="Produits", index=False)
    data = buf.getvalue()
    if output_path:
        Path(output_path).write_bytes(data)
    return data


def _num(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _clean(v) -> str:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def _bool(v) -> bool:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return False
    if isinstance(v, bool):
        return v
    s = str(v).strip().lower()
    return s in {"1", "true", "vrai", "yes", "oui", "x"}


def read_excel(source, image_resolver: Optional[Callable[[str], Optional[str]]] = None) -> Deck:
    """Parse workbook (path, file-like, or bytes) into a Deck.

    image_resolver maps a filename in the Excel to a real image path;
    return None to skip the image.
    """
    if isinstance(source, (bytes, bytearray)):
        source = BytesIO(source)

    meta = pd.read_excel(source, sheet_name="Meta")
    if hasattr(source, "seek"):
        source.seek(0)
    prods = pd.read_excel(source, sheet_name="Produits")

    meta_kv = {_clean(k): _clean(v) for k, v in zip(meta["cle"], meta["valeur"])}
    deck = Deck(
        titre=meta_kv.get("titre", "Plan Commercial") or "Plan Commercial",
        canal=meta_kv.get("canal", "Canal Gros") or "Canal Gros",
        mois=meta_kv.get("mois", ""),
    )

    def resolve(name: str) -> Optional[str]:
        name = _clean(name)
        if not name:
            return None
        return image_resolver(name) if image_resolver else name

    groups: Dict[str, Group] = {}
    subgroups: Dict[Tuple[str, str], SubGroup] = {}

    for _, row in prods.iterrows():
        gname = _clean(row.get("groupe")) or "Sans groupe"
        sgname = _clean(row.get("sous_groupe")) or "Sans sous-groupe"

        if gname not in groups:
            groups[gname] = Group(nom=gname, logo_path=resolve(row.get("logo_groupe")))
            deck.groupes.append(groups[gname])
        elif not groups[gname].logo_path:
            groups[gname].logo_path = resolve(row.get("logo_groupe"))

        key = (gname, sgname)
        if key not in subgroups:
            subgroups[key] = SubGroup(nom=sgname)
            groups[gname].sous_groupes.append(subgroups[key])

        subgroups[key].produits.append(Product(
            nom=_clean(row.get("nom")),
            packshot_path=resolve(row.get("packshot")),
            nom_image_path=resolve(row.get("nom_image")),
            prix_gros=_num(row.get("prix_gros")),
            prix_gros_net=_num(row.get("prix_gros_net")),
            colisage=_clean(row.get("colisage")),
            colisage_prix_gros=_num(row.get("colisage_prix_gros")),
            colisage_prix_gros_net=_num(row.get("colisage_prix_gros_net")),
            is_promo=_bool(row.get("is_promo")),
            type_promo=_clean(row.get("type_promo")),
            promo_achat_qte=int(_num(row.get("promo_achat_qte"))),
            promo_gratuit_qte=int(_num(row.get("promo_gratuit_qte"))),
            promo_remise_pct=_num(row.get("promo_remise_pct")),
            promo_texte=_clean(row.get("promo_texte")),
        ))

    return deck
