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
    # Packshot position overrides (inches; 0 = use default)
    "packshot_left", "packshot_top", "packshot_width", "packshot_height",
]


_RED       = "C8102E"
_RED_DARK  = "8B0A1F"
_ROSE      = "FDECEE"
_INK       = "1F1F1F"
_WHITE     = "FFFFFF"
_HEADER_GRAY = "F3F3F3"

# Section colors for the grouped header row
_SECTION_COLOR = {
    "Identification":  "1F3A5F",
    "Prix à l'unité":  "2C7A3D",
    "Prix à la caisse":"2C7A3D",
    "Logo":            "555555",
    "Promo":           "C8102E",
}

# Column -> section mapping (for the grouped header above the column names)
_COL_TO_SECTION = {
    "groupe": "Identification", "sous_groupe": "Identification",
    "nom": "Identification", "packshot": "Identification", "nom_image": "Identification",
    "prix_gros": "Prix à l'unité", "prix_gros_net": "Prix à l'unité",
    "colisage": "Prix à la caisse",
    "colisage_prix_gros": "Prix à la caisse",
    "colisage_prix_gros_net": "Prix à la caisse",
    "logo_groupe": "Logo",
    "is_promo": "Promo", "type_promo": "Promo",
    "promo_achat_qte": "Promo", "promo_gratuit_qte": "Promo",
    "promo_remise_pct": "Promo", "promo_texte": "Promo",
}

# Columns that should be right-aligned / number-formatted as prices
_PRICE_COLS = {"prix_gros", "prix_gros_net",
               "colisage_prix_gros", "colisage_prix_gros_net"}
_INT_COLS   = {"promo_achat_qte", "promo_gratuit_qte"}
_PCT_COLS   = {"promo_remise_pct"}


def _apply_column_widths(ws, widths: Dict[str, int]) -> None:
    for letter, w in widths.items():
        ws.column_dimensions[letter].width = w


def _thin_border(color: str = "BBBBBB") -> Border:
    s = Side(style="thin", color=color)
    return Border(left=s, right=s, top=s, bottom=s)


def _add_bool_validation(ws, col_letter: str, n_rows: int, start_row: int) -> None:
    dv = DataValidation(type="list", formula1='"TRUE,FALSE"', allow_blank=True)
    dv.add(f"{col_letter}{start_row}:{col_letter}{start_row + n_rows - 1}")
    ws.add_data_validation(dv)


def _add_type_promo_validation(ws, col_letter: str, n_rows: int, start_row: int) -> None:
    dv = DataValidation(
        type="list",
        formula1='"gratuite,remise,remise+gratuite"',
        allow_blank=True,
        showErrorMessage=True,
        errorTitle="Type promo invalide",
        error="Choisissez: gratuite, remise, ou remise+gratuite",
    )
    dv.add(f"{col_letter}{start_row}:{col_letter}{start_row + n_rows - 1}")
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
        "packshot_left": 0.0, "packshot_top": 0.0,
        "packshot_width": 0.0, "packshot_height": 0.0,
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
        "packshot_left": 0.0, "packshot_top": 0.0,
        "packshot_width": 0.0, "packshot_height": 0.0,
    },
]


def write_template(output_path: Optional[str] = None,
                   titre: str = "Plan Commercial",
                   canal: str = "Canal Gros",
                   mois: str = "Avril 2026") -> bytes:
    """Polished Excel template with Meta + Produits + Instructions sheets.

    Layout of the Produits sheet:
      Row 1   merged title "Plan Commercial — Canal Gros — <mois>"
      Row 2   grouped section headers (Identification / Prix à l'unité / ...)
      Row 3   column names (matches ``PRODUIT_COLS``)
      Row 4+  data rows (two seed rows including one promo example)

    The output stays a valid input for ``read_excel``: the reader already
    calls ``pd.read_excel(..., sheet_name='Produits')`` which honours the
    header on whatever row pandas detects; we pass the explicit column names
    unchanged so the round-trip is stable.
    """
    wb = Workbook()

    # ---- Meta sheet ----
    ws_meta = wb.active
    ws_meta.title = "Meta"
    ws_meta.append(["cle", "valeur"])
    for cle, val in [("titre", titre), ("canal", canal), ("mois", mois)]:
        ws_meta.append([cle, val])
    # Style the meta header
    for col in range(1, 3):
        c = ws_meta.cell(row=1, column=col)
        c.fill = PatternFill("solid", fgColor=_RED)
        c.font = Font(name="Calibri", bold=True, color=_WHITE, size=12)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = _thin_border()
    for row in range(2, 5):
        for col in range(1, 3):
            ws_meta.cell(row=row, column=col).border = _thin_border("DDDDDD")
    ws_meta.row_dimensions[1].height = 26
    _apply_column_widths(ws_meta, {"A": 16, "B": 36})
    ws_meta.freeze_panes = "A2"

    # ---- Produits sheet ----
    ws = wb.create_sheet("Produits")
    n_cols = len(PRODUIT_COLS)

    # Row 1 — big title
    last_letter = get_column_letter(n_cols)
    ws.merge_cells(f"A1:{last_letter}1")
    title_cell = ws.cell(row=1, column=1)
    title_cell.value = f"Plan Commercial — {canal} — {mois}"
    title_cell.fill = PatternFill("solid", fgColor=_RED)
    title_cell.font = Font(name="Calibri", bold=True, color=_WHITE, size=18)
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 36

    # Row 2 — grouped section headers
    cur = 1
    while cur <= n_cols:
        section = _COL_TO_SECTION.get(PRODUIT_COLS[cur - 1])
        run = cur
        while run < n_cols and _COL_TO_SECTION.get(PRODUIT_COLS[run]) == section:
            run += 1
        start_letter = get_column_letter(cur)
        end_letter = get_column_letter(run)
        if cur != run:
            ws.merge_cells(f"{start_letter}2:{end_letter}2")
        c = ws.cell(row=2, column=cur)
        c.value = section or ""
        c.fill = PatternFill("solid", fgColor=_SECTION_COLOR.get(section, "555555"))
        c.font = Font(name="Calibri", bold=True, color=_WHITE, size=11)
        c.alignment = Alignment(horizontal="center", vertical="center")
        for col in range(cur, run + 1):
            ws.cell(row=2, column=col).border = _thin_border("999999")
        cur = run + 1
    ws.row_dimensions[2].height = 22

    # Row 3 — column names
    for col, name in enumerate(PRODUIT_COLS, start=1):
        c = ws.cell(row=3, column=col, value=name)
        c.fill = PatternFill("solid", fgColor=_HEADER_GRAY)
        c.font = Font(name="Calibri", bold=True, color=_INK, size=10)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = _thin_border("999999")
    ws.row_dimensions[3].height = 32
    ws.freeze_panes = "A4"
    ws.auto_filter.ref = f"A3:{last_letter}3"

    # Data rows (seed) + formatting
    data_start = 4
    for r_idx, row in enumerate(_TEMPLATE_ROWS, start=data_start):
        for c_idx, col_name in enumerate(PRODUIT_COLS, start=1):
            cell = ws.cell(row=r_idx, column=c_idx, value=row[col_name])
            cell.alignment = Alignment(
                horizontal="right" if col_name in _PRICE_COLS | _INT_COLS | _PCT_COLS
                else ("center" if col_name in {"is_promo", "type_promo"}
                      else "left"),
                vertical="center",
            )
            cell.font = Font(name="Calibri", size=10, color=_INK)
            cell.border = _thin_border("DDDDDD")
            if col_name in _PRICE_COLS:
                cell.number_format = '#,##0.00'
            elif col_name in _INT_COLS:
                cell.number_format = '0'
            elif col_name in _PCT_COLS:
                cell.number_format = '0.0'
            if col_name == "is_promo" and row[col_name]:
                cell.font = Font(name="Calibri", size=10, color=_RED_DARK, bold=True)
        if (r_idx - data_start) % 2 == 1:
            for c_idx in range(1, n_cols + 1):
                ws.cell(row=r_idx, column=c_idx).fill = PatternFill("solid", fgColor=_ROSE)

    # Column widths
    widths = {
        "A": 14, "B": 16, "C": 36,
        "D": 26, "E": 22,
        "F": 12, "G": 14,
        "H": 14, "I": 12, "J": 14,
        "K": 22,
        "L": 10, "M": 17,
        "N": 12, "O": 13, "P": 11,
        "Q": 28,
    }
    _apply_column_widths(ws, widths)

    # Dropdown validations (1000 rows ahead)
    _add_bool_validation(
        ws, get_column_letter(PRODUIT_COLS.index("is_promo") + 1),
        n_rows=1000, start_row=data_start)
    _add_type_promo_validation(
        ws, get_column_letter(PRODUIT_COLS.index("type_promo") + 1),
        n_rows=1000, start_row=data_start)

    # ---- Instructions sheet ----
    ws_info = wb.create_sheet("Instructions")
    ws_info.column_dimensions["A"].width = 100
    ws_info.append(["Comment remplir ce template"])
    ws_info.append([""])
    for line in [
        "• Meta : titre / canal / mois du plan.",
        "• Produits : une ligne = une slide.",
        "",
        "Colonnes principales :",
        "  groupe        → Catégorie (ex. « Detergent Pdr Main »)",
        "  sous_groupe   → Marque (ex. « MIO »)",
        "  nom           → Titre de la slide",
        "  packshot      → Nom du fichier image du produit (ex. MIO-PDR-10KG.png)",
        "  logo_groupe   → Logo de la marque (ex. MIO.png)",
        "",
        "Prix à l'unité :",
        "  prix_gros, prix_gros_net (2 décimales)",
        "",
        "Prix à la caisse :",
        "  colisage (ex. « SAC de 16 »), colisage_prix_gros, colisage_prix_gros_net",
        "",
        "Promo :",
        "  is_promo       → TRUE / FALSE  (menu déroulant)",
        "  type_promo     → gratuite / remise / remise+gratuite",
        "  promo_achat_qte    → nombre de caisses à acheter",
        "  promo_gratuit_qte  → caisses offertes (type 'gratuite' ou mixte)",
        "  promo_remise_pct   → pourcentage de remise (type 'remise' ou mixte)",
        "  promo_texte        → texte personnalisé (facultatif, remplace le texte auto)",
        "",
        "Astuce : téléchargez ce template, complétez-le, puis ré-uploadez-le ",
        "dans l'app — tous les champs sont reconnus automatiquement.",
    ]:
        ws_info.append([line])
    ws_info.cell(row=1, column=1).font = Font(name="Calibri", bold=True, size=16, color=_RED)

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

    # The Produits sheet may have a decorative title/section rows above the
    # actual column-name row. Auto-detect the header row by scanning the
    # first 5 rows for one containing "groupe".
    raw = pd.read_excel(source, sheet_name="Produits", header=None, nrows=10)
    header_row = 0
    for i in range(min(5, len(raw))):
        values = [str(v).strip().lower() for v in raw.iloc[i].tolist()]
        if "groupe" in values:
            header_row = i
            break
    if hasattr(source, "seek"):
        source.seek(0)
    prods = pd.read_excel(source, sheet_name="Produits", header=header_row)

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
            packshot_left=_num(row.get("packshot_left")),
            packshot_top=_num(row.get("packshot_top")),
            packshot_width=_num(row.get("packshot_width")),
            packshot_height=_num(row.get("packshot_height")),
        ))

    return deck
