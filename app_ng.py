"""NiceGUI version of the Plan Commercial app.

Single-page layout. Re-uses every backend module (model, generator,
preview, excel_io, image_assets, excel_reader) from the Streamlit app —
only the UI layer is replaced. Each `@ui.refreshable` block re-renders
on its own when its data changes, so editing one slide does NOT cause
the whole page to repaint.
"""
from __future__ import annotations

import io
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import openpyxl

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))
sys.path.insert(0, str(ROOT))

from PIL import Image
from nicegui import app as ng_app, events, ui

from plan_commercial import (  # noqa: E402
    Deck, Group, Product, SubGroup,
    build_pptx, read_excel, write_template,
    render_product, render_cover, export_pdf,
)
from plan_commercial.excel_io import PRODUIT_COLS  # noqa: E402
import excel_reader as byfpc_reader  # noqa: E402
import image_assets  # noqa: E402

IMAGE_DIR = ROOT / "assets" / "images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR = ROOT / "archive"
ARCHIVE_DIR.mkdir(exist_ok=True)

# Serve the assets/images folder as a static URL so ui.image can show
# uploaded packshots directly from disk.
ng_app.add_static_files("/assets-images", str(IMAGE_DIR))


# ---------------------------------------------------------------------------
# State (per-process; NiceGUI is single-user-local in default config)
# ---------------------------------------------------------------------------
class State:
    titre: str = "Plan Commercial"
    canal: str = "Canal Gros"
    mois: str = "Avril 2026"
    products: list[dict[str, Any]] = []
    current_idx: int = 0


S = State()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def resolve_image(name: Any) -> Optional[str]:
    if not name:
        return None
    p = IMAGE_DIR / str(name)
    return str(p) if p.exists() else None


def _row_to_product(row: dict, group: Group) -> Product:
    return Product(
        nom=str(row.get("nom") or ""),
        packshot_path=resolve_image(row.get("packshot")),
        nom_image_path=resolve_image(row.get("nom_image")),
        prix_gros=float(row.get("prix_gros") or 0),
        prix_gros_net=float(row.get("prix_gros_net") or 0),
        colisage=str(row.get("colisage") or ""),
        colisage_prix_gros=float(row.get("colisage_prix_gros") or 0),
        colisage_prix_gros_net=float(row.get("colisage_prix_gros_net") or 0),
        is_promo=bool(row.get("is_promo")),
        type_promo=str(row.get("type_promo") or ""),
        promo_achat_qte=int(row.get("promo_achat_qte") or 0),
        promo_gratuit_qte=int(row.get("promo_gratuit_qte") or 0),
        promo_remise_pct=float(row.get("promo_remise_pct") or 0),
        promo_texte=str(row.get("promo_texte") or ""),
        packshot_left=float(row.get("packshot_left") or 0),
        packshot_top=float(row.get("packshot_top") or 0),
        packshot_width=float(row.get("packshot_width") or 0),
        packshot_height=float(row.get("packshot_height") or 0),
    )


def _png_to_pil(data: bytes) -> Image.Image:
    return Image.open(io.BytesIO(data))


def _build_deck() -> Deck:
    """Build a full Deck from the current state for generation."""
    deck = Deck(titre=S.titre, canal=S.canal, mois=S.mois)
    groups: dict[str, Group] = {}
    subgroups: dict[tuple, SubGroup] = {}
    for row in S.products:
        gname = str(row.get("groupe") or "Sans groupe").strip()
        sgname = str(row.get("sous_groupe") or "Sans sous-groupe").strip()
        if gname not in groups:
            groups[gname] = Group(
                nom=gname,
                logo_path=resolve_image(row.get("logo_groupe")),
            )
            deck.groupes.append(groups[gname])
        elif not groups[gname].logo_path:
            groups[gname].logo_path = resolve_image(row.get("logo_groupe"))
        key = (gname, sgname)
        if key not in subgroups:
            subgroups[key] = SubGroup(nom=sgname)
            groups[gname].sous_groupes.append(subgroups[key])
        subgroups[key].produits.append(_row_to_product(row, groups[gname]))
    return deck


def _slug(s: str) -> str:
    keep = [c if c.isalnum() else "_" for c in (s or "").strip()]
    return "".join(keep).strip("_") or "plan"


# ---------------------------------------------------------------------------
# UI: Deck metadata
# ---------------------------------------------------------------------------
@ui.refreshable
def render_deck_form():
    with ui.card().classes("w-full"):
        ui.label("Deck").classes("text-h6 text-red-700")
        with ui.row().classes("gap-2 items-center"):
            ui.input("Titre", value=S.titre,
                     on_change=lambda e: setattr(S, "titre", e.value)) \
                .classes("w-64")
            ui.input("Canal", value=S.canal,
                     on_change=lambda e: setattr(S, "canal", e.value)) \
                .classes("w-48")
            ui.input("Mois", value=S.mois,
                     on_change=lambda e: setattr(S, "mois", e.value)) \
                .classes("w-32")


# ---------------------------------------------------------------------------
# UI: Excel upload
# ---------------------------------------------------------------------------
def render_excel_uploader():
    with ui.card().classes("w-full"):
        ui.label("Charger les données").classes("text-h6 text-red-700")
        ui.label("Uploadez la feuille BySKU (PL_Changes) ou un export "
                 "Meta/Produits téléchargé depuis cette app.").classes("text-sm text-gray-500")

        def on_upload(e: events.UploadEventArguments):
            data = e.content.read()
            try:
                names = openpyxl.load_workbook(
                    io.BytesIO(data), read_only=True
                ).sheetnames
            except Exception as exc:
                ui.notify(f"Fichier illisible: {exc}", type="negative")
                return

            if "BySKU" in names:
                tmp = Path(tempfile.gettempdir()) / "_uploaded.xlsx"
                tmp.write_bytes(data)
                prods = byfpc_reader.read_bysku(tmp)
                S.products = [{
                    "groupe": p.category or "Sans catégorie",
                    "sous_groupe": p.brand or "Sans marque",
                    "nom": p.sku,
                    "packshot": f"{p.sku}.png",
                    "nom_image": "",
                    "prix_gros": p.bp_new or 0.0,
                    "prix_gros_net": p.net_new or 0.0,
                    "colisage": "",
                    "colisage_prix_gros": p.bp_new or 0.0,
                    "colisage_prix_gros_net": p.net_new or 0.0,
                    "logo_groupe": f"{p.brand}.png" if p.brand else "",
                    "is_promo": False, "type_promo": "",
                    "promo_achat_qte": 0, "promo_gratuit_qte": 0,
                    "promo_remise_pct": 0.0, "promo_texte": "",
                    "packshot_left": 0.0, "packshot_top": 0.0,
                    "packshot_width": 0.0, "packshot_height": 0.0,
                } for p in prods]
                ui.notify(f"Chargé {len(S.products)} SKUs depuis BySKU.")
            elif "Produits" in names and "Meta" in names:
                deck = read_excel(data, image_resolver=lambda n: n)
                S.titre = deck.titre
                S.canal = deck.canal
                S.mois = deck.mois
                S.products = []
                for g in deck.groupes:
                    for sg in g.sous_groupes:
                        for p in sg.produits:
                            S.products.append({
                                "groupe": g.nom, "sous_groupe": sg.nom,
                                "nom": p.nom,
                                "packshot": p.packshot_path or "",
                                "nom_image": p.nom_image_path or "",
                                "prix_gros": p.prix_gros,
                                "prix_gros_net": p.prix_gros_net,
                                "colisage": p.colisage,
                                "colisage_prix_gros": p.colisage_prix_gros,
                                "colisage_prix_gros_net": p.colisage_prix_gros_net,
                                "logo_groupe": g.logo_path or "",
                                "is_promo": p.is_promo,
                                "type_promo": p.type_promo,
                                "promo_achat_qte": p.promo_achat_qte,
                                "promo_gratuit_qte": p.promo_gratuit_qte,
                                "promo_remise_pct": p.promo_remise_pct,
                                "promo_texte": p.promo_texte,
                                "packshot_left": p.packshot_left,
                                "packshot_top": p.packshot_top,
                                "packshot_width": p.packshot_width,
                                "packshot_height": p.packshot_height,
                            })
                ui.notify(f"Chargé {len(S.products)} produits.")
            else:
                ui.notify(
                    f"Feuilles inconnues: {names}. Attendu BySKU ou Meta+Produits.",
                    type="negative",
                )
                return

            S.current_idx = 0
            render_products_table.refresh()
            render_preview.refresh()
            render_summary.refresh()

        ui.upload(on_upload=on_upload, auto_upload=True,
                  max_file_size=200 * 1024 * 1024) \
            .props('accept=".xlsx" label="Glissez le fichier .xlsx"').classes("w-full")


# ---------------------------------------------------------------------------
# UI: Products table
# ---------------------------------------------------------------------------
@ui.refreshable
def render_products_table():
    with ui.card().classes("w-full"):
        with ui.row().classes("items-center justify-between w-full"):
            ui.label("Produits").classes("text-h6 text-red-700")
            ui.label(f"{len(S.products)} SKUs").classes("text-sm text-gray-500")

        if not S.products:
            ui.label("Aucun produit chargé. Uploadez un Excel ci-dessus.") \
                .classes("text-gray-500 italic")
            return

        rows = [{
            "id": i,
            "nom": p.get("nom", ""),
            "groupe": p.get("groupe", ""),
            "sous_groupe": p.get("sous_groupe", ""),
            "prix_gros": float(p.get("prix_gros") or 0),
            "prix_gros_net": float(p.get("prix_gros_net") or 0),
            "promo": "🔥" if bool(p.get("is_promo")) else "",
        } for i, p in enumerate(S.products)]

        cols = [
            {"name": "id", "label": "#", "field": "id",
             "align": "right", "sortable": True},
            {"name": "nom", "label": "Nom", "field": "nom",
             "align": "left", "sortable": True},
            {"name": "groupe", "label": "Catégorie", "field": "groupe",
             "align": "left", "sortable": True},
            {"name": "sous_groupe", "label": "Marque", "field": "sous_groupe",
             "align": "left", "sortable": True},
            {"name": "prix_gros", "label": "Prix Gros", "field": "prix_gros",
             "align": "right", "sortable": True, "format": "function(v) { return v.toFixed(2); }"},
            {"name": "prix_gros_net", "label": "Net", "field": "prix_gros_net",
             "align": "right", "sortable": True},
            {"name": "promo", "label": "🎁", "field": "promo", "align": "center"},
        ]

        table = ui.table(
            columns=cols, rows=rows, row_key="id",
            selection="single", pagination=20,
        ).classes("w-full")

        # Quick filter
        with ui.row().classes("items-center gap-2"):
            ui.label("Filtre:").classes("text-sm")
            search = ui.input(placeholder="nom, marque...") \
                .props("dense outlined").classes("w-64")
            search.on_value_change(lambda e: setattr(table, "filter", e.value or ""))

        def on_select():
            sel = table.selected
            if sel:
                S.current_idx = int(sel[0]["id"])
                render_preview.refresh()
        table.on("selection", on_select)


# ---------------------------------------------------------------------------
# UI: Live preview + per-slide inline editors
# ---------------------------------------------------------------------------
@ui.refreshable
def render_preview():
    with ui.card().classes("w-full"):
        ui.label("Aperçu live").classes("text-h6 text-red-700")
        if not S.products:
            ui.label("Pas de SKU sélectionné.").classes("text-gray-500")
            return

        idx = max(0, min(S.current_idx, len(S.products) - 1))
        row = S.products[idx]
        deck = Deck(titre=S.titre, canal=S.canal, mois=S.mois)
        group = Group(
            nom=str(row.get("sous_groupe") or row.get("groupe") or ""),
            logo_path=resolve_image(row.get("logo_groupe")),
        )
        product = _row_to_product(row, group)

        png = render_product(deck, group, product)
        ui.image(_png_to_pil(png)).classes("w-full")
        ui.label(f"Slide #{idx + 1} — {row.get('nom', '')}") \
            .classes("text-subtitle1 text-center")

        # Inline editors — bind directly to the dict, refresh preview only.
        def bind(field: str, *, kind: str = "number", **kw):
            def set_and_refresh(e):
                row[field] = e.value
                render_preview.refresh()
                render_products_table.refresh()
            if kind == "number":
                w = ui.number(value=float(row.get(field) or 0),
                              on_change=set_and_refresh, **kw)
            elif kind == "int":
                w = ui.number(value=int(row.get(field) or 0),
                              on_change=set_and_refresh, **kw)
            elif kind == "checkbox":
                w = ui.checkbox(value=bool(row.get(field)),
                                on_change=set_and_refresh, **kw)
            elif kind == "text":
                w = ui.input(value=str(row.get(field) or ""),
                             on_change=set_and_refresh, **kw)
            elif kind == "select":
                w = ui.select(options=kw.pop("options"),
                              value=str(row.get(field) or ""),
                              on_change=set_and_refresh, **kw)
            return w

        with ui.expansion("✏ Prix & colisage", value=True).classes("w-full"):
            with ui.row().classes("gap-2 w-full"):
                bind("prix_gros", label="Prix Gros (unité)", format="%.2f").classes("w-40")
                bind("prix_gros_net", label="Net (unité)", format="%.2f").classes("w-40")
            bind("colisage", kind="text", label="Colisage (ex. SAC de 16)") \
                .classes("w-full")
            with ui.row().classes("gap-2 w-full"):
                bind("colisage_prix_gros", label="Prix Gros caisse", format="%.2f").classes("w-40")
                bind("colisage_prix_gros_net", label="Net caisse", format="%.2f").classes("w-40")

        with ui.expansion("🎁 Promo",
                          value=bool(row.get("is_promo"))).classes("w-full"):
            bind("is_promo", kind="checkbox", text="Cette slide est une promo")
            bind("type_promo", kind="select",
                 options=["", "gratuite", "remise", "remise+gratuite"],
                 label="Type")
            with ui.row().classes("gap-2 w-full"):
                bind("promo_achat_qte", kind="int",
                     label="Acheter N caisses").classes("w-32")
                bind("promo_gratuit_qte", kind="int",
                     label="X gratuites").classes("w-32")
                bind("promo_remise_pct",
                     label="Remise %", format="%.1f").classes("w-32")

        with ui.expansion("🖼 Packshot", value=False).classes("w-full"):
            existing = (IMAGE_DIR / str(row.get("packshot") or "")) \
                if row.get("packshot") else None
            if existing and existing.exists():
                ui.image(str(existing)).classes("w-32")

            def on_packshot(e: events.UploadEventArguments):
                fname = str(row.get("packshot") or "").strip() or e.name
                image_assets.register_upload(
                    IMAGE_DIR, fname, e.content.read(),
                    brand=str(row.get("sous_groupe") or row.get("groupe") or ""),
                    type_="packshot",
                )
                row["packshot"] = fname
                render_preview.refresh()
                ui.notify(f"Packshot enregistré: {fname}")

            ui.upload(on_upload=on_packshot, auto_upload=True) \
                .props('label="Drop packshot" accept=".png,.jpg,.jpeg"').classes("w-full")


# ---------------------------------------------------------------------------
# UI: Summary + Generate
# ---------------------------------------------------------------------------
@ui.refreshable
def render_summary():
    with ui.card().classes("w-full"):
        ui.label("Génération").classes("text-h6 text-red-700")
        if not S.products:
            ui.label("Pas de données à générer.").classes("text-gray-500")
            return
        n = len(S.products)
        groupes = {p.get("groupe") for p in S.products}
        ui.label(f"{n} produits  ·  {len(groupes)} catégories").classes("text-sm")

        async def export_pptx():
            deck = _build_deck()
            data = build_pptx(deck)
            stem = f"{_slug(S.titre)}_{_slug(S.canal)}_{_slug(S.mois)}_" \
                   f"{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            # Auto-archive into archive/<YYYY-MM>/
            month = _archive_month(S.mois)
            folder = ARCHIVE_DIR / month
            folder.mkdir(parents=True, exist_ok=True)
            (folder / f"{stem}.pptx").write_bytes(data)
            # Snapshot xlsx so the deck can be reloaded later
            snapshot = write_template(
                titre=S.titre, canal=S.canal, mois=S.mois, rows=S.products,
            )
            (folder / f"{stem}.xlsx").write_bytes(snapshot)
            ui.download(data, f"{stem}.pptx")
            ui.notify(f"PPTX généré et archivé dans archive/{month}/")

        async def export_pdf_now():
            deck = _build_deck()
            with ui.notification("Rendu PDF...", spinner=True):
                data = export_pdf(deck)
            ui.download(data,
                        f"{_slug(S.titre)}_{_slug(S.canal)}_{_slug(S.mois)}.pdf")

        async def download_excel():
            data = write_template(
                titre=S.titre, canal=S.canal, mois=S.mois, rows=S.products,
            )
            ui.download(data,
                        f"{_slug(S.titre)}_{_slug(S.canal)}_{_slug(S.mois)}.xlsx")

        with ui.row().classes("gap-2"):
            ui.button("⬇ PPTX", on_click=export_pptx).props("color=red")
            ui.button("⬇ PDF",  on_click=export_pdf_now).props("color=red outline")
            ui.button("⬇ Excel (mes données)", on_click=download_excel).props("outline")


_FR_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
}


def _archive_month(mois: str) -> str:
    parts = (mois or "").lower().split()
    m = next((_FR_MONTHS[p] for p in parts if p in _FR_MONTHS), None)
    y = next((int(p) for p in parts if p.isdigit() and len(p) == 4), None)
    if m and y:
        return f"{y}-{m:02d}"
    return datetime.now().strftime("%Y-%m")


# ---------------------------------------------------------------------------
# Page
# ---------------------------------------------------------------------------
def _load_archived_xlsx(xlsx: Path) -> int:
    """Reload an archived plan into S. Returns the row count."""
    deck = read_excel(xlsx.read_bytes(), image_resolver=lambda n: n)
    S.titre, S.canal, S.mois = deck.titre, deck.canal, deck.mois
    S.products = []
    for g in deck.groupes:
        for sg in g.sous_groupes:
            for p in sg.produits:
                S.products.append({
                    "groupe": g.nom, "sous_groupe": sg.nom, "nom": p.nom,
                    "packshot": p.packshot_path or "",
                    "nom_image": p.nom_image_path or "",
                    "prix_gros": p.prix_gros,
                    "prix_gros_net": p.prix_gros_net,
                    "colisage": p.colisage,
                    "colisage_prix_gros": p.colisage_prix_gros,
                    "colisage_prix_gros_net": p.colisage_prix_gros_net,
                    "logo_groupe": g.logo_path or "",
                    "is_promo": p.is_promo, "type_promo": p.type_promo,
                    "promo_achat_qte": p.promo_achat_qte,
                    "promo_gratuit_qte": p.promo_gratuit_qte,
                    "promo_remise_pct": p.promo_remise_pct,
                    "promo_texte": p.promo_texte,
                    "packshot_left": p.packshot_left,
                    "packshot_top": p.packshot_top,
                    "packshot_width": p.packshot_width,
                    "packshot_height": p.packshot_height,
                })
    S.current_idx = 0
    return len(S.products)


def _deck_thumbnail(pptx_path: Path) -> Optional[bytes]:
    """Return cached PNG thumbnail bytes (built lazily from sidecar xlsx)."""
    thumb = pptx_path.with_suffix(".thumb.png")
    if thumb.exists():
        try:
            return thumb.read_bytes()
        except OSError:
            pass
    xlsx = pptx_path.with_suffix(".xlsx")
    if not xlsx.exists():
        return None
    try:
        deck = read_excel(xlsx.read_bytes(), image_resolver=resolve_image)
        first = next(deck.iter_products(), None)
        if first:
            g, _, p = first
            png = render_product(deck, g, p)
        else:
            png = render_cover(deck)
        im = Image.open(io.BytesIO(png))
        ratio = 400 / im.width
        im = im.resize((400, int(im.height * ratio)), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        thumb.write_bytes(data)
        return data
    except Exception:
        return None


# ---------------------------------------------------------------------------
# UI: 🏠 Home / Archive
# ---------------------------------------------------------------------------
@ui.refreshable
def render_home_tab():
    ui.label("Plans archivés par mois").classes("text-h5 text-red-700")
    ui.label(
        "Chaque génération est sauvegardée dans archive/<année-mois>/. "
        "Téléchargez une archive, rechargez-la dans l'éditeur ou supprimez-la."
    ).classes("text-sm text-gray-500")

    month_dirs = sorted(
        [p for p in ARCHIVE_DIR.iterdir() if p.is_dir()], reverse=True,
    )
    if not month_dirs:
        ui.label("Aucun plan archivé pour le moment. Générez-en un dans l'onglet "
                 "✏ Édition.").classes("italic text-gray-500")
        return

    total_decks = sum(len(list(m.glob('*.pptx'))) for m in month_dirs)
    total_size = sum(p.stat().st_size for m in month_dirs for p in m.glob('*.pptx'))
    ui.label(f"{total_decks} deck(s) sur {len(month_dirs)} mois — "
             f"{total_size/1024/1024:.1f} MB").classes("text-sm text-gray-600")

    for mdir in month_dirs:
        ppt_files = sorted(mdir.glob("*.pptx"), reverse=True)
        if not ppt_files:
            continue
        m_size = sum(p.stat().st_size for p in ppt_files) / 1024 / 1024
        with ui.expansion(
            f"📅 {mdir.name} — {len(ppt_files)} deck(s), {m_size:.1f} MB",
            value=True,
        ).classes("w-full"):
            for ppt in ppt_files:
                xlsx = ppt.with_suffix(".xlsx")
                with ui.card().classes("w-full"):
                    with ui.row().classes("items-start gap-4 w-full no-wrap"):
                        thumb = _deck_thumbnail(ppt)
                        if thumb:
                            ui.image(_png_to_pil(thumb)).classes("w-48")
                        else:
                            ui.label("(pas d'aperçu)").classes("text-gray-400 italic")

                        with ui.column().classes("grow"):
                            ui.label(ppt.stem).classes("text-subtitle1")
                            ui.label(f"{ppt.stat().st_size/1024:.0f} KB") \
                                .classes("text-sm text-gray-500")

                            with ui.row().classes("gap-2"):
                                _btn_download_pptx(ppt)
                                if xlsx.exists():
                                    _btn_edit_archive(xlsx)
                                    _btn_duplicate_archive(xlsx)
                                _btn_delete_archive(ppt, xlsx)


def _btn_download_pptx(ppt: Path):
    def go():
        ui.download(ppt.read_bytes(), ppt.name)
    ui.button("⬇ PPTX", on_click=go).props("color=red")


def _btn_edit_archive(xlsx: Path):
    def go():
        try:
            n = _load_archived_xlsx(xlsx)
            ui.notify(f"Chargé {n} produits. Allez dans ✏ Édition.")
            render_products_table.refresh()
            render_preview.refresh()
            render_summary.refresh()
        except Exception as exc:
            ui.notify(f"Échec: {exc}", type="negative")
    ui.button("✏ Éditer", on_click=go).props("flat color=red")


def _btn_duplicate_archive(xlsx: Path):
    def go():
        try:
            n = _load_archived_xlsx(xlsx)
            S.mois = datetime.now().strftime("%B %Y")
            ui.notify(f"Dupliqué — {n} produits, mois → {S.mois}")
            render_products_table.refresh()
            render_preview.refresh()
            render_summary.refresh()
            render_deck_form.refresh()
        except Exception as exc:
            ui.notify(f"Échec: {exc}", type="negative")
    ui.button("📄 Dupliquer", on_click=go).props("flat")


def _btn_delete_archive(ppt: Path, xlsx: Path):
    def confirm_delete():
        with ui.dialog() as dialog, ui.card():
            ui.label(f"Supprimer définitivement {ppt.name} ?")
            with ui.row().classes("gap-2"):
                ui.button("Annuler", on_click=dialog.close).props("flat")
                def do():
                    ppt.unlink(missing_ok=True)
                    xlsx.unlink(missing_ok=True)
                    ppt.with_suffix(".thumb.png").unlink(missing_ok=True)
                    ui.notify(f"Supprimé : {ppt.name}")
                    dialog.close()
                    render_home_tab.refresh()
                ui.button("Supprimer", on_click=do).props("color=red")
        dialog.open()
    ui.button("🗑", on_click=confirm_delete).props("flat color=grey")


# ---------------------------------------------------------------------------
# UI: 🏷 Brands
# ---------------------------------------------------------------------------
@ui.refreshable
def render_brands_tab():
    ui.label("Travail par marque").classes("text-h5 text-red-700")
    ui.label(
        "Choisissez une marque, déposez plusieurs packshots d'un coup — "
        "associés aux SKUs existants ou utilisés pour créer de nouvelles slides."
    ).classes("text-sm text-gray-500")

    if not S.products:
        ui.label("Aucun produit chargé. Importez un Excel dans ✏ Édition.") \
            .classes("italic text-gray-500")
        return

    # Brand lives in sous_groupe (ByFPC) or groupe (manual template)
    brand_col = "sous_groupe"
    if not any(str(p.get("sous_groupe") or "").strip() for p in S.products):
        brand_col = "groupe"

    brand_counts: dict[str, int] = {}
    for p in S.products:
        b = str(p.get(brand_col) or "Sans marque")
        brand_counts[b] = brand_counts.get(b, 0) + 1
    brands = sorted(brand_counts.keys())

    sel_brand_holder = {"v": brands[0]}

    def on_brand_change(e):
        sel_brand_holder["v"] = e.value
        render_brand_panel.refresh()

    ui.select(
        options={b: f"{b} ({brand_counts[b]} SKUs)" for b in brands},
        value=brands[0],
        on_change=on_brand_change,
        label="Marque",
    ).classes("w-80")

    @ui.refreshable
    def render_brand_panel():
        sel = sel_brand_holder["v"]
        rows = [(i, p) for i, p in enumerate(S.products)
                if str(p.get(brand_col) or "") == sel]
        n_with_pack = sum(
            1 for _, p in rows if resolve_image(p.get("packshot"))
        )

        with ui.row().classes("w-full gap-4"):
            with ui.card().classes("min-w-32"):
                ui.label(str(len(rows))).classes("text-h4 text-red-700")
                ui.label("SKUs").classes("text-caption")
            with ui.card().classes("min-w-32"):
                ui.label(str(n_with_pack)).classes("text-h4 text-green-700")
                ui.label("avec packshot").classes("text-caption")
            with ui.card().classes("min-w-32"):
                ui.label(str(len(rows) - n_with_pack)).classes("text-h4 text-orange-600")
                ui.label("sans packshot").classes("text-caption")

        # Brand logo
        with ui.card().classes("w-full"):
            ui.label("Logo de la marque").classes("text-subtitle1")
            with ui.row().classes("items-center gap-4"):
                logo_path = next(
                    (resolve_image(p.get("logo_groupe")) for _, p in rows
                     if resolve_image(p.get("logo_groupe"))),
                    None,
                )
                if logo_path:
                    ui.image(logo_path).classes("w-32")
                else:
                    ui.label("(aucun)").classes("text-gray-400 italic")

                def on_logo_upload(e: events.UploadEventArguments):
                    target = f"{_slug(sel)}.png"
                    image_assets.register_upload(
                        IMAGE_DIR, target, e.content.read(),
                        brand=sel, type_="logo",
                    )
                    cnt = 0
                    for _, p in rows:
                        p["logo_groupe"] = target
                        cnt += 1
                    ui.notify(f"Logo appliqué à {cnt} SKU(s).")
                    render_brand_panel.refresh()
                    render_preview.refresh()

                ui.upload(on_upload=on_logo_upload, auto_upload=True) \
                    .props('label="Drop logo"  accept=".png,.jpg,.jpeg"').classes("w-80")

        # Bulk packshot upload
        with ui.card().classes("w-full"):
            ui.label("Dépôt en masse de packshots").classes("text-subtitle1")
            mode_holder = {"v": "match"}

            def on_mode(e):
                mode_holder["v"] = e.value

            ui.toggle(
                {"match": "Matcher par nom de fichier",
                 "create": "Créer une nouvelle slide pour chaque image"},
                value="match", on_change=on_mode,
            )

            def on_bulk(e: events.MultiUploadEventArguments):
                mode = mode_holder["v"]
                matched = missed = created = 0
                for name, content in zip(e.names, e.contents):
                    data = content.read()
                    image_assets.register_upload(
                        IMAGE_DIR, name, data, brand=sel, type_="packshot",
                    )
                    stem = Path(name).stem.lower()
                    if mode == "match":
                        target = None
                        for i, p in rows:
                            if str(p.get("packshot")) == name:
                                target = i; break
                        if target is None:
                            for i, p in rows:
                                sku = str(p.get("nom") or "").lower()
                                if sku and (sku in stem or stem in sku):
                                    target = i; break
                        if target is not None:
                            S.products[target]["packshot"] = name
                            matched += 1
                        else:
                            missed += 1
                    else:
                        # Create blank SKU row
                        first_row = rows[0][1] if rows else {}
                        blank = {c: "" for c in PRODUIT_COLS}
                        for c in ("prix_gros", "prix_gros_net",
                                  "colisage_prix_gros", "colisage_prix_gros_net",
                                  "promo_achat_qte", "promo_gratuit_qte",
                                  "promo_remise_pct",
                                  "packshot_left", "packshot_top",
                                  "packshot_width", "packshot_height"):
                            blank[c] = 0
                        blank["is_promo"] = False
                        blank[brand_col] = sel
                        blank["groupe"] = first_row.get("groupe", "") if brand_col == "sous_groupe" else sel
                        blank["nom"] = Path(name).stem
                        blank["packshot"] = name
                        S.products.append(blank)
                        created += 1
                msgs = []
                if matched: msgs.append(f"{matched} matchés")
                if missed:  msgs.append(f"{missed} sans correspondance")
                if created: msgs.append(f"{created} nouvelles slides")
                ui.notify(", ".join(msgs) or "Rien à faire.")
                render_brand_panel.refresh()
                render_products_table.refresh()
                render_preview.refresh()
                render_summary.refresh()

            ui.upload(on_multi_upload=on_bulk, multiple=True, auto_upload=True) \
                .props('accept=".png,.jpg,.jpeg" label="Glissez plusieurs packshots"') \
                .classes("w-full")

        # Grid of SKUs in this brand
        with ui.card().classes("w-full"):
            ui.label(f"SKUs — {sel}").classes("text-subtitle1")
            with ui.grid(columns=4).classes("w-full gap-2"):
                for i, p in rows:
                    pack = resolve_image(p.get("packshot"))
                    with ui.card().classes("p-2"):
                        if pack:
                            ui.image(pack).classes("h-24")
                        else:
                            ui.label("(pas d'image)") \
                                .classes("text-gray-400 italic h-24 flex items-center")
                        ui.label(p.get("nom") or "(sans nom)") \
                            .classes("text-caption truncate")
                        promo = " 🔥" if p.get("is_promo") else ""
                        ui.label(
                            f"PG {float(p.get('prix_gros') or 0):.2f} ·"
                            f" Net {float(p.get('prix_gros_net') or 0):.2f}{promo}"
                        ).classes("text-caption text-gray-500")

    render_brand_panel()


# ---------------------------------------------------------------------------
# UI: 📚 Images library
# ---------------------------------------------------------------------------
@ui.refreshable
def render_images_tab():
    ui.label("Bibliothèque d'images").classes("text-h5 text-red-700")
    ui.label(
        "Tous les packshots, logos et badges. Sauvegardés en permanence et "
        "réutilisables dans n'importe quel plan."
    ).classes("text-sm text-gray-500")

    # Mass upload
    def on_pool_upload(e: events.MultiUploadEventArguments):
        for name, content in zip(e.names, e.contents):
            image_assets.register_upload(IMAGE_DIR, name, content.read())
        ui.notify(f"{len(e.names)} image(s) ajoutée(s).")
        render_images_tab.refresh()

    with ui.card().classes("w-full"):
        ui.upload(on_multi_upload=on_pool_upload, multiple=True, auto_upload=True) \
            .props('accept=".png,.jpg,.jpeg,.webp" '
                   'label="📥 Glissez autant d\'images que vous voulez"').classes("w-full")

    assets = image_assets.load_metadata(IMAGE_DIR)
    if not assets:
        ui.label("Aucune image. Déposez-en ci-dessus.").classes("italic")
        return

    total_kb = sum(m.size for m in assets.values()) / 1024
    brand_counts: dict[str, int] = {}
    for m in assets.values():
        brand_counts[m.brand or "?"] = brand_counts.get(m.brand or "?", 0) + 1
    brands_opts = [""] + sorted(brand_counts.keys())
    types_opts = ["", "packshot", "logo", "badge", "other"]

    filt = {"search": "", "brand": "", "type": ""}

    def refresh_grid():
        render_images_grid.refresh()

    with ui.card().classes("w-full"):
        ui.label(f"{len(assets)} images — {total_kb:.0f} KB total") \
            .classes("text-subtitle1")
        with ui.row().classes("items-center gap-2 w-full"):
            ui.input(label="🔎 Recherche", placeholder="nom, marque, tag",
                     on_change=lambda e: (filt.update(search=e.value or ""),
                                          refresh_grid())) \
                .props("dense outlined").classes("w-64")
            ui.select(
                options={"": "Toutes marques", **{b: b for b in brands_opts if b}},
                value="",
                on_change=lambda e: (filt.update(brand=e.value or ""), refresh_grid()),
                label="Marque",
            ).classes("w-40")
            ui.select(
                options={"": "Tous types", **{t: t for t in types_opts if t}},
                value="",
                on_change=lambda e: (filt.update(type=e.value or ""), refresh_grid()),
                label="Type",
            ).classes("w-40")

            def bulk_delete():
                rows = image_assets.list_assets(
                    IMAGE_DIR,
                    brand=filt["brand"] or None,
                    type_=filt["type"] or None,
                    search=filt["search"] or None,
                )
                with ui.dialog() as dlg, ui.card():
                    ui.label(f"Supprimer définitivement les "
                             f"{len(rows)} images filtrées ?")
                    with ui.row():
                        ui.button("Annuler", on_click=dlg.close).props("flat")
                        def do():
                            for m in rows:
                                image_assets.delete_asset(IMAGE_DIR, m.filename)
                            ui.notify(f"{len(rows)} image(s) supprimée(s).")
                            dlg.close()
                            render_images_tab.refresh()
                        ui.button("Supprimer", on_click=do).props("color=red")
                dlg.open()
            ui.button("🗑 Supprimer la sélection filtrée",
                      on_click=bulk_delete).props("flat color=grey")

    @ui.refreshable
    def render_images_grid():
        rows = image_assets.list_assets(
            IMAGE_DIR,
            brand=filt["brand"] or None,
            type_=filt["type"] or None,
            search=filt["search"] or None,
        )
        if not rows:
            ui.label("Aucune image ne correspond.").classes("italic")
            return
        with ui.grid(columns=4).classes("w-full gap-2"):
            for m in rows:
                with ui.card().classes("p-2"):
                    p = IMAGE_DIR / m.filename
                    if p.exists():
                        ui.image(str(p)).classes("h-32")
                    ui.label(m.filename).classes("text-caption truncate")
                    used = image_assets.count_usage(m.filename, _products_df())
                    used_str = f" · utilisé {used}×" if used else ""
                    ui.label(f"{m.brand or '?'} · {m.type}{used_str}") \
                        .classes("text-caption text-gray-500")

                    def delete_one(filename=m.filename):
                        image_assets.delete_asset(IMAGE_DIR, filename)
                        render_images_tab.refresh()

                    with ui.row().classes("gap-1"):
                        ui.button("🗑", on_click=delete_one).props("flat dense color=grey")

    render_images_grid()


def _products_df():
    """Tiny shim: image_assets.count_usage expects a pandas DataFrame, but
    our state uses list-of-dicts. Build a temporary DataFrame here."""
    import pandas as pd
    return pd.DataFrame(S.products) if S.products else pd.DataFrame()


# ---------------------------------------------------------------------------
# Page with tabs
# ---------------------------------------------------------------------------
@ui.page("/")
def main():
    ui.colors(primary="#C8102E")
    with ui.header().classes("items-center justify-between"):
        ui.label("Plan Commercial — PPTX Generator").classes("text-h5 text-white")
        ui.label("NiceGUI build").classes("text-caption text-white opacity-80")

    with ui.tabs().classes("w-full") as tabs:
        t_home    = ui.tab("🏠 Home")
        t_edit    = ui.tab("✏ Édition")
        t_brands  = ui.tab("🏷 Marques")
        t_images  = ui.tab("📚 Images")

    with ui.tab_panels(tabs, value=t_edit).classes("w-full"):
        with ui.tab_panel(t_home):
            render_home_tab()
        with ui.tab_panel(t_edit):
            with ui.row().classes("w-full no-wrap gap-4 q-pa-md"):
                with ui.column().classes("w-1/2 gap-3"):
                    render_deck_form()
                    render_excel_uploader()
                    render_products_table()
                    render_summary()
                with ui.column().classes("w-1/2 gap-3"):
                    render_preview()
        with ui.tab_panel(t_brands):
            render_brands_tab()
        with ui.tab_panel(t_images):
            render_images_tab()


ui.run(
    title="Plan Commercial Generator",
    port=8502,
    reload=False,
    show=False,
    storage_secret="plan-commercial-local",
)
