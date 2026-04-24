from io import BytesIO
from pathlib import Path
from typing import Callable, Dict, Optional, Tuple

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

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


_RED = "C8102E"
_LIGHT = "FDECEE"
_INK = "1F1F1F"


def _style_header(ws, n_cols: int) -> None:
    """Red bold header row, white text, centered, with bottom border."""
    fill = PatternFill("solid", fgColor=_RED)
    font = Font(name="Calibri", bold=True, color="FFFFFF", size=11)
    align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(style="thin", color="999999")
    border = Border(bottom=thin)
    for col in range(1, n_cols + 1):
        c = ws.cell(row=1, column=col)
        c.fill = fill
        c.font = font
        c.alignment = align
        c.border = border
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "A2"


def _apply_column_widths(ws, widths: Dict[str, int]) -> None:
    for letter, w in widths.items():
        ws.column_dimensions[letter].width = w


def _band_rows(ws, n_rows: int, n_cols: int, start_row: int = 2) -> None:
    """Light-red banding on even data rows for readability."""
    fill = PatternFill("solid", fgColor=_LIGHT)
    for r in range(start_row, start_row + n_rows):
        if (r - start_row) % 2 == 1:
            for col in range(1, n_cols + 1):
                ws.cell(row=r, column=col).fill = fill


def _add_bool_validation(ws, col_letter: str, n_rows: int) -> None:
    dv = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    dv.add(f"{col_letter}2:{col_letter}{1 + n_rows}")
    ws.add_data_validation(dv)


def _add_type_promo_validation(ws, col_letter: str, n_rows: int) -> None:
    dv = DataValidation(
        type="list",
        formula1='"gratuite,remise,remise+gratuite"',
        allow_blank=True,
        showErrorMessage=True,
        errorTitle="Type promo invalide",
        error="Choisissez: gratuite, remise, ou remise+gratuite",
    )
    dv.add(f"{col_letter}2:{col_letter}{1 + n_rows}")
    ws.add_data_validation(dv)


_TEMPLATE_ROWS = [
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


def write_template(output_path: Optional[str] = None) -> bytes:
    """Styled Excel template with Meta + Produits sheets + dropdowns.

    The output is a valid input for ``read_excel`` so users can round-trip:
    download → edit → upload → regenerate.
    """
    wb = Workbook()

    # ---- Meta sheet ----
    ws_meta = wb.active
    ws_meta.title = "Meta"
    ws_meta.append(["cle", "valeur"])
    for cle, val in [
        ("titre", "Plan Commercial"),
        ("canal", "Canal Gros"),
        ("mois", "Avril 2026"),
    ]:
        ws_meta.append([cle, val])
    _style_header(ws_meta, 2)
    _apply_column_widths(ws_meta, {"A": 16, "B": 34})

    # ---- Produits sheet ----
    ws = wb.create_sheet("Produits")
    ws.append(PRODUIT_COLS)
    for r in _TEMPLATE_ROWS:
        ws.append([r[c] for c in PRODUIT_COLS])
    _style_header(ws, len(PRODUIT_COLS))
    _band_rows(ws, n_rows=len(_TEMPLATE_ROWS), n_cols=len(PRODUIT_COLS))

    # Column widths tuned for readability
    widths = {
        "A": 14, "B": 16, "C": 34,          # groupe / sous_groupe / nom
        "D": 24, "E": 20,                   # packshot / nom_image
        "F": 11, "G": 13,                   # prix_gros / net
        "H": 13, "I": 11, "J": 13,          # colisage / caisse prix
        "K": 20,                            # logo_groupe
        "L": 10, "M": 17,                   # is_promo / type_promo
        "N": 11, "O": 12, "P": 11,          # promo qtes / remise
        "Q": 28,                            # promo_texte
    }
    _apply_column_widths(ws, widths)

    # Dropdowns on is_promo + type_promo (1000 rows ahead)
    idx_is_promo = PRODUIT_COLS.index("is_promo")
    idx_type_promo = PRODUIT_COLS.index("type_promo")
    _add_bool_validation(ws, get_column_letter(idx_is_promo + 1), n_rows=1000)
    _add_type_promo_validation(ws, get_column_letter(idx_type_promo + 1), n_rows=1000)

    buf = BytesIO()
    wb.save(buf)
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
