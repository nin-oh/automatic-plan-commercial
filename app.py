"""Streamlit UI for the Plan Commercial PPTX generator."""
from __future__ import annotations

import sys
import tempfile
from io import BytesIO
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))  # for excel_reader

from plan_commercial import (  # noqa: E402
    Deck, Group, Product, SubGroup, build_pptx, read_excel, write_template,
    render_product, render_cover,
)
from plan_commercial.excel_io import PRODUIT_COLS  # noqa: E402
import excel_reader as byfpc_reader  # noqa: E402
import openpyxl  # noqa: E402

st.set_page_config(page_title="Plan Commercial Generator", layout="wide")

# Persistent image pool in the project so uploads survive restarts and
# can be reused across sessions.
IMAGE_DIR = Path(__file__).resolve().parent / "assets" / "images"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

# Archive directory (project-root-relative so users find it easily)
ARCHIVE_DIR = Path(__file__).resolve().parent / "archive"
ARCHIVE_DIR.mkdir(exist_ok=True)

_FR_MONTHS = {
    "janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12, "decembre": 12,
}


def archive_month(mois: str) -> str:
    """Return the YYYY-MM folder name for a mois string like 'Avril 2026'.
    Falls back to the current system YYYY-MM if parsing fails.
    """
    from datetime import datetime
    parts = (mois or "").lower().split()
    month = next((_FR_MONTHS[p] for p in parts if p in _FR_MONTHS), None)
    year = next((int(p) for p in parts if p.isdigit() and len(p) == 4), None)
    if month and year:
        return f"{year}-{month:02d}"
    return datetime.now().strftime("%Y-%m")


def _slug(s: str) -> str:
    keep = [c if c.isalnum() else "_" for c in (s or "").strip()]
    return "".join(keep).strip("_") or "plan"


def archive_deck(pptx_bytes: bytes, products_df, meta: dict, mois: str) -> Path:
    """Save pptx + a snapshot xlsx into archive/<YYYY-MM>/. Returns .pptx path."""
    from datetime import datetime
    folder = ARCHIVE_DIR / archive_month(mois)
    folder.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    stem = f"{_slug(meta.get('titre', 'Plan_Commercial'))}_" \
           f"{_slug(meta.get('canal', 'Canal_Gros'))}_" \
           f"{_slug(mois)}_{ts}"
    pptx_path = folder / f"{stem}.pptx"
    xlsx_path = folder / f"{stem}.xlsx"
    pptx_path.write_bytes(pptx_bytes)

    # Snapshot xlsx (Meta + Produits, same schema as the template)
    from openpyxl import Workbook
    wb = Workbook()
    ws_meta = wb.active
    ws_meta.title = "Meta"
    ws_meta.append(["cle", "valeur"])
    for k, v in meta.items():
        ws_meta.append([k, v])
    ws_p = wb.create_sheet("Produits")
    ws_p.append(PRODUIT_COLS)
    for _, row in products_df.iterrows():
        ws_p.append([row.get(c) for c in PRODUIT_COLS])
    wb.save(xlsx_path)
    return pptx_path


def resolve_image(name: str) -> str | None:
    if not name:
        return None
    path = IMAGE_DIR / str(name)
    return str(path) if path.exists() else None


def save_upload(uploaded) -> str | None:
    if uploaded is None:
        return None
    path = IMAGE_DIR / uploaded.name
    path.write_bytes(uploaded.getbuffer())
    return uploaded.name


def _blank_products_df() -> pd.DataFrame:
    return pd.DataFrame(columns=PRODUIT_COLS)


# ---- Session state ---------------------------------------------------------
ss = st.session_state
ss.setdefault("titre", "Plan Commercial")
ss.setdefault("canal", "Canal Gros")
ss.setdefault("mois", "Avril 2026")
ss.setdefault("banner", None)       # uploaded filename or None (use built-in)
ss.setdefault("background", None)
ss.setdefault("cover_photo", None)
ss.setdefault("products_df", _blank_products_df())
ss.setdefault("image_pool", [])     # list of filenames

# ---- Header ----------------------------------------------------------------
st.title("Plan Commercial — PPTX Generator")
st.caption("Upload images, fill in product info (Excel or manual), generate the deck.")

tab_home, tab_deck, tab_content, tab_brands, tab_images, tab_generate = st.tabs(
    ["🏠 Home", "1. Deck", "2. Content", "3. Brands", "4. Images", "5. Generate"]
)

# ---- Tab 0: Home / Archive -------------------------------------------------
with tab_home:
    st.subheader("Plans archivés par mois")
    st.caption(
        "Chaque génération est sauvegardée automatiquement dans "
        "`archive/<année-mois>/`. Téléchargez-la directement, ou chargez-la "
        "pour l'éditer à nouveau."
    )

    month_dirs = sorted(
        [p for p in ARCHIVE_DIR.iterdir() if p.is_dir()],
        reverse=True,
    )
    if not month_dirs:
        st.info("Aucun plan archivé pour le moment. Générez-en un dans l'onglet "
                "**4. Generate** — il apparaîtra ici.")
    else:
        for mdir in month_dirs:
            ppt_files = sorted(mdir.glob("*.pptx"), reverse=True)
            if not ppt_files:
                continue
            with st.expander(f"📅 {mdir.name} — {len(ppt_files)} deck(s)", expanded=True):
                for ppt in ppt_files:
                    xlsx = ppt.with_suffix(".xlsx")
                    c1, c2, c3 = st.columns([4, 1, 1])
                    c1.markdown(
                        f"**{ppt.stem}**  \n"
                        f"_{ppt.stat().st_size/1024:.0f} KB_"
                    )
                    c2.download_button(
                        "⬇ .pptx",
                        data=ppt.read_bytes(),
                        file_name=ppt.name,
                        mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                        key=f"dl_pptx_{ppt.name}",
                    )
                    if xlsx.exists() and c3.button("✏ Éditer", key=f"edit_{ppt.name}"):
                        try:
                            deck = read_excel(xlsx.read_bytes(),
                                              image_resolver=lambda n: n)
                            rows = []
                            for g in deck.groupes:
                                for sg in g.sous_groupes:
                                    for p in sg.produits:
                                        rows.append({
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
                                        })
                            ss.products_df = pd.DataFrame(rows, columns=PRODUIT_COLS)
                            ss.titre = deck.titre
                            ss.canal = deck.canal
                            ss.mois = deck.mois
                            st.success(
                                f"Chargé {len(rows)} produits depuis {xlsx.name}. "
                                "Ouvrez l'onglet **2. Content** pour éditer."
                            )
                        except Exception as exc:
                            st.error(f"Échec du chargement: {exc}")

# ---- Tab 1: Deck -----------------------------------------------------------
with tab_deck:
    st.subheader("Deck metadata")
    c1, c2, c3 = st.columns(3)
    ss.titre = c1.text_input("Titre", ss.titre)
    ss.canal = c2.text_input("Canal", ss.canal)
    ss.mois  = c3.text_input("Mois",  ss.mois)

    st.subheader("Deck-wide images (optional overrides)")
    st.caption("Leave empty to use the built-in defaults extracted from the reference deck.")
    c1, c2, c3 = st.columns(3)
    with c1:
        up = st.file_uploader("Banner (top-left)", type=["png", "jpg", "jpeg"], key="up_banner")
        if up:
            ss.banner = save_upload(up)
        st.caption(f"Current: {ss.banner or 'built-in banner_canal_gros.png'}")
    with c2:
        up = st.file_uploader("Background", type=["png", "jpg", "jpeg"], key="up_bg")
        if up:
            ss.background = save_upload(up)
        st.caption(f"Current: {ss.background or 'built-in wood_background.png'}")
    with c3:
        up = st.file_uploader("Cover photo", type=["png", "jpg", "jpeg"], key="up_cover")
        if up:
            ss.cover_photo = save_upload(up)
        st.caption(f"Current: {ss.cover_photo or '(none)'}")

# ---- Tab 2: Content --------------------------------------------------------
with tab_content:
    st.subheader("Product data")
    mode = st.radio("Input mode", ["Manual", "Excel upload"], horizontal=True)

    if mode == "Excel upload":
        col_a, col_b = st.columns([1, 2])
        with col_a:
            st.download_button(
                "Download Excel template",
                data=write_template(),
                file_name="plan_commercial_template.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        with col_b:
            xlsx = st.file_uploader(
                "Upload filled Excel (Meta/Produits template OR PL_Changes BySKU)",
                type=["xlsx"], key="up_xlsx",
            )
            if xlsx is not None:
                data = xlsx.getvalue()
                try:
                    sheet_names = openpyxl.load_workbook(
                        BytesIO(data), read_only=True
                    ).sheetnames
                except Exception as exc:
                    st.error(f"Can't open file: {exc}")
                    sheet_names = []

                if "BySKU" in sheet_names:
                    # PL_Changes workbook — use the aggregated BySKU sheet
                    try:
                        tmp = Path(tempfile.gettempdir()) / "_uploaded.xlsx"
                        tmp.write_bytes(data)
                        products = byfpc_reader.read_bysku(tmp)
                        rows = [{
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
                        } for p in products]
                        ss.products_df = pd.DataFrame(rows, columns=PRODUIT_COLS)
                        st.success(
                            f"Loaded {len(rows)} SKUs from BySKU "
                            f"({ss.products_df['groupe'].nunique()} categories, "
                            f"{ss.products_df['sous_groupe'].nunique()} brands)."
                        )
                        st.info(
                            "Packshot filenames are set to `<SKU>.png` and brand "
                            "logos to `<Brand>.png`. Upload matching images via "
                            "drag-and-drop under the preview."
                        )
                    except Exception as exc:
                        st.error(f"Failed to read BySKU sheet: {exc}")
                elif "Meta" in sheet_names and "Produits" in sheet_names:
                    try:
                        deck = read_excel(data, image_resolver=lambda n: n)
                        rows = []
                        for g in deck.groupes:
                            for sg in g.sous_groupes:
                                for p in sg.produits:
                                    rows.append({
                                        "groupe": g.nom,
                                        "sous_groupe": sg.nom,
                                        "nom": p.nom,
                                        "packshot": p.packshot_path or "",
                                        "nom_image": p.nom_image_path or "",
                                        "prix_gros": p.prix_gros,
                                        "prix_gros_net": p.prix_gros_net,
                                        "colisage": p.colisage,
                                        "colisage_prix_gros": p.colisage_prix_gros,
                                        "colisage_prix_gros_net": p.colisage_prix_gros_net,
                                        "logo_groupe": g.logo_path or "",
                                    })
                        ss.products_df = pd.DataFrame(rows, columns=PRODUIT_COLS)
                        ss.titre, ss.canal, ss.mois = deck.titre, deck.canal, deck.mois
                        st.success(f"Loaded {len(rows)} products from Meta/Produits template.")
                    except Exception as exc:
                        st.error(f"Failed to read template: {exc}")
                elif sheet_names:
                    st.error(
                        f"Unrecognized workbook. Found sheets: {sheet_names}. "
                        "Expected either `BySKU` (PL_Changes) or `Meta`+`Produits` "
                        "(app template)."
                    )

    st.markdown("#### Products table")

    # ---- Filters ----
    with st.expander("Filtres & recherche", expanded=False):
        col_s, col_b, col_c = st.columns([2, 2, 2])
        search = col_s.text_input("Recherche (nom / marque / catégorie)", "")
        brand_opts = sorted(
            {str(v) for v in ss.products_df["sous_groupe"].dropna().unique()}
        ) if len(ss.products_df) else []
        cat_opts = sorted(
            {str(v) for v in ss.products_df["groupe"].dropna().unique()}
        ) if len(ss.products_df) else []
        brand_filter = col_b.multiselect("Marque(s)", brand_opts)
        cat_filter = col_c.multiselect("Catégorie(s)", cat_opts)
        promo_only = st.checkbox("Afficher uniquement les promos", value=False)

    # Build filter mask
    df_full = ss.products_df
    if len(df_full):
        mask = pd.Series(True, index=df_full.index)
        if search:
            s = search.lower()
            mask &= df_full.apply(
                lambda r: s in str(r.get("nom") or "").lower()
                       or s in str(r.get("sous_groupe") or "").lower()
                       or s in str(r.get("groupe") or "").lower(),
                axis=1,
            )
        if brand_filter:
            mask &= df_full["sous_groupe"].astype(str).isin(brand_filter)
        if cat_filter:
            mask &= df_full["groupe"].astype(str).isin(cat_filter)
        if promo_only:
            mask &= df_full["is_promo"].astype(bool)
        df_filtered = df_full[mask]
    else:
        df_filtered = df_full

    # ---- Pagination ----
    col_ps, col_pg, col_info = st.columns([1, 1, 3])
    page_size = col_ps.selectbox(
        "Lignes / page", [25, 50, 100, 200], index=0, key="page_size"
    )
    n_pages = max(1, (len(df_filtered) + page_size - 1) // page_size)
    page = col_pg.number_input(
        f"Page (1-{n_pages})", min_value=1, max_value=n_pages, value=1, step=1,
        key="page_num",
    )
    start = (page - 1) * page_size
    end = start + page_size
    df_page = df_filtered.iloc[start:end]
    col_info.caption(
        f"{len(df_filtered)} / {len(df_full)} produits — "
        f"affichage {start + 1 if len(df_page) else 0}–{start + len(df_page)}"
    )

    edited = st.data_editor(
        df_page,
        num_rows="fixed",
        use_container_width=True,
        column_config={
            "prix_gros": st.column_config.NumberColumn(format="%.2f"),
            "prix_gros_net": st.column_config.NumberColumn(format="%.2f"),
            "colisage_prix_gros": st.column_config.NumberColumn(format="%.2f"),
            "colisage_prix_gros_net": st.column_config.NumberColumn(format="%.2f"),
            "is_promo": st.column_config.CheckboxColumn("Promo ?"),
            "type_promo": st.column_config.SelectboxColumn(
                "Type promo",
                options=["", "gratuite", "remise", "remise+gratuite"],
            ),
            "promo_achat_qte": st.column_config.NumberColumn("Achat (N)", format="%d"),
            "promo_gratuit_qte": st.column_config.NumberColumn("Gratuit (X)", format="%d"),
            "promo_remise_pct": st.column_config.NumberColumn("Remise %", format="%.1f"),
        },
        key=f"products_editor_p{page}",
    )

    # Write edits back to the full df (indices are preserved from the slice)
    for idx in edited.index:
        if idx in ss.products_df.index:
            for col in edited.columns:
                ss.products_df.at[idx, col] = edited.at[idx, col]

    # Manual row-add (replaces dynamic rows which don't play well with paging)
    col_add, col_del = st.columns([1, 1])
    if col_add.button("➕ Ajouter un produit vide"):
        blank = {c: "" for c in PRODUIT_COLS}
        for c in ["prix_gros", "prix_gros_net",
                  "colisage_prix_gros", "colisage_prix_gros_net",
                  "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct"]:
            blank[c] = 0
        blank["is_promo"] = False
        ss.products_df = pd.concat(
            [ss.products_df, pd.DataFrame([blank], columns=PRODUIT_COLS)],
            ignore_index=True,
        )
        st.rerun()
    if col_del.button("🗑️ Tout effacer", type="secondary"):
        ss.products_df = _blank_products_df()
        st.rerun()

    # ---- Live preview + per-row drag-drop uploads ----
    st.markdown("#### Preview + images")
    st.caption(
        "Pick a slide below. Drop a packshot / brand logo in the right column — "
        "it saves to the pool and updates the preview immediately."
    )
    df = ss.products_df
    if len(df) == 0:
        st.info("Add at least one product to see the preview.")
    else:
        labels = [
            f"#{i + 1}  {row.get('nom') or '(sans nom)'}"
            f"  —  {row.get('groupe') or ''} / {row.get('sous_groupe') or ''}"
            for i, (_, row) in enumerate(df.iterrows())
        ]
        labels = ["Cover"] + labels
        choice = st.selectbox("Slide", labels, index=min(1, len(labels) - 1))

        deck = Deck(
            titre=ss.titre, canal=ss.canal, mois=ss.mois,
            banner_path=resolve_image(ss.banner),
            background_path=resolve_image(ss.background),
            cover_photo_path=resolve_image(ss.cover_photo),
        )

        preview_col, upload_col = st.columns([3, 1])

        if choice == "Cover":
            with preview_col:
                st.image(render_cover(deck), use_container_width=True)
            with upload_col:
                st.caption("Cover photo")
                up = st.file_uploader(
                    "Drop cover photo here",
                    type=["png", "jpg", "jpeg"],
                    key="up_cover_inline",
                    label_visibility="collapsed",
                )
                if up is not None:
                    ss.cover_photo = save_upload(up)
                    st.rerun()
        else:
            idx = labels.index(choice) - 1
            row = df.iloc[idx]
            group = Group(
                nom=str(row.get("groupe") or ""),
                logo_path=resolve_image(row.get("logo_groupe")),
            )
            product = Product(
                nom=str(row.get("nom") or ""),
                packshot_path=resolve_image(row.get("packshot")),
                nom_image_path=resolve_image(row.get("nom_image")),
                prix_gros=float(row.get("prix_gros") or 0),
                prix_gros_net=float(row.get("prix_gros_net") or 0),
                colisage=str(row.get("colisage") or ""),
                colisage_prix_gros=float(row.get("colisage_prix_gros") or 0),
                colisage_prix_gros_net=float(row.get("colisage_prix_gros_net") or 0),
                is_promo=bool(row.get("is_promo") or False),
                type_promo=str(row.get("type_promo") or ""),
                promo_achat_qte=int(row.get("promo_achat_qte") or 0),
                promo_gratuit_qte=int(row.get("promo_gratuit_qte") or 0),
                promo_remise_pct=float(row.get("promo_remise_pct") or 0),
                promo_texte=str(row.get("promo_texte") or ""),
            )
            with preview_col:
                st.image(render_product(deck, group, product), use_container_width=True)

                # Inline price / colisage editors for this slide
                with st.expander("Edit prices & colisage for this slide", expanded=True):
                    row_idx = df.index[idx]
                    pg = st.number_input(
                        "Prix Gros (unité)",
                        value=float(row.get("prix_gros") or 0),
                        step=0.01, format="%.2f", key=f"ed_pg_{idx}",
                    )
                    pgn = st.number_input(
                        "Prix Gros Net (unité)",
                        value=float(row.get("prix_gros_net") or 0),
                        step=0.01, format="%.2f", key=f"ed_pgn_{idx}",
                    )
                    colisage = st.text_input(
                        "Colisage",
                        value=str(row.get("colisage") or ""),
                        placeholder="e.g. SAC de 16",
                        key=f"ed_col_{idx}",
                    )
                    cpg = st.number_input(
                        "Prix Gros (caisse)",
                        value=float(row.get("colisage_prix_gros") or 0),
                        step=0.01, format="%.2f", key=f"ed_cpg_{idx}",
                    )
                    cpgn = st.number_input(
                        "Prix Gros Net (caisse)",
                        value=float(row.get("colisage_prix_gros_net") or 0),
                        step=0.01, format="%.2f", key=f"ed_cpgn_{idx}",
                    )
                    # Write back on every rerun (cheap)
                    ss.products_df.at[row_idx, "prix_gros"] = pg
                    ss.products_df.at[row_idx, "prix_gros_net"] = pgn
                    ss.products_df.at[row_idx, "colisage"] = colisage
                    ss.products_df.at[row_idx, "colisage_prix_gros"] = cpg
                    ss.products_df.at[row_idx, "colisage_prix_gros_net"] = cpgn

                with st.expander("Promo", expanded=bool(product.is_promo)):
                    is_promo = st.checkbox(
                        "Cette slide est une promo",
                        value=bool(product.is_promo),
                        key=f"ed_ispromo_{idx}",
                    )
                    type_options = ["gratuite", "remise", "remise+gratuite"]
                    t_default = product.type_promo if product.type_promo in type_options else "gratuite"
                    type_promo = st.selectbox(
                        "Type de promo",
                        type_options,
                        index=type_options.index(t_default),
                        disabled=not is_promo,
                        key=f"ed_typepromo_{idx}",
                    )
                    achat = st.number_input(
                        "Acheter N caisses",
                        min_value=0, step=1,
                        value=int(product.promo_achat_qte),
                        disabled=not is_promo,
                        key=f"ed_achat_{idx}",
                    )
                    grat = st.number_input(
                        "X caisses gratuites",
                        min_value=0, step=1,
                        value=int(product.promo_gratuit_qte),
                        disabled=not is_promo or type_promo == "remise",
                        key=f"ed_grat_{idx}",
                    )
                    remise = st.number_input(
                        "Remise (%)",
                        min_value=0.0, step=0.5, format="%.1f",
                        value=float(product.promo_remise_pct),
                        disabled=not is_promo or type_promo == "gratuite",
                        key=f"ed_remise_{idx}",
                    )
                    texte = st.text_input(
                        "Texte personnalisé (optionnel, remplace le texte auto)",
                        value=product.promo_texte,
                        disabled=not is_promo,
                        key=f"ed_texte_{idx}",
                    )
                    ss.products_df.at[row_idx, "is_promo"] = is_promo
                    ss.products_df.at[row_idx, "type_promo"] = type_promo if is_promo else ""
                    ss.products_df.at[row_idx, "promo_achat_qte"] = achat
                    ss.products_df.at[row_idx, "promo_gratuit_qte"] = grat
                    ss.products_df.at[row_idx, "promo_remise_pct"] = remise
                    ss.products_df.at[row_idx, "promo_texte"] = texte

            with upload_col:
                # -- Packshot --
                packshot_name = str(row.get("packshot") or "").strip() or f"row{idx+1}_packshot.png"
                st.markdown("**Packshot**")
                if product.packshot_path:
                    st.image(product.packshot_path, width=160)
                up_packshot = st.file_uploader(
                    f"Drop packshot for #{idx+1}",
                    type=["png", "jpg", "jpeg"],
                    key=f"up_packshot_{idx}",
                    label_visibility="collapsed",
                )
                if up_packshot is not None:
                    # Save using the existing filename if set, else <row>_<original>
                    target_name = packshot_name
                    if not target_name.lower().endswith((".png", ".jpg", ".jpeg")):
                        target_name += Path(up_packshot.name).suffix or ".png"
                    (IMAGE_DIR / target_name).write_bytes(up_packshot.getbuffer())
                    ss.products_df.at[df.index[idx], "packshot"] = target_name
                    st.rerun()

                # -- Brand logo (propagates to every row sharing the brand) --
                # Brand lives in `sous_groupe` for ByFPC imports, in `groupe`
                # for the manual template — match whichever is non-empty.
                groupe_val = str(row.get("groupe") or "").strip()
                sous_val = str(row.get("sous_groupe") or "").strip()
                brand = sous_val or groupe_val
                logo_name = str(row.get("logo_groupe") or "").strip() \
                    or (f"{brand}_logo.png" if brand else f"row{idx+1}_logo.png")
                st.markdown(f"**Brand logo** — _{brand or '(no brand)'}_")
                if group.logo_path:
                    st.image(group.logo_path, width=160)
                up_logo = st.file_uploader(
                    f"Drop logo for {brand or 'brand'}",
                    type=["png", "jpg", "jpeg"],
                    key=f"up_logo_{idx}",
                    label_visibility="collapsed",
                )
                if up_logo is not None:
                    target_name = logo_name
                    if not target_name.lower().endswith((".png", ".jpg", ".jpeg")):
                        target_name += Path(up_logo.name).suffix or ".png"
                    (IMAGE_DIR / target_name).write_bytes(up_logo.getbuffer())
                    # Apply to every row sharing the same brand (sous_groupe
                    # primary, else groupe), regardless of category.
                    cur = ss.products_df
                    if sous_val:
                        mask = cur["sous_groupe"].astype(str).str.strip() == sous_val
                    elif groupe_val:
                        mask = cur["groupe"].astype(str).str.strip() == groupe_val
                    else:
                        mask = cur.index == df.index[idx]
                    ss.products_df.loc[mask, "logo_groupe"] = target_name
                    st.toast(f"Logo applied to {int(mask.sum())} row(s).")
                    st.rerun()

# ---- Tab: Brands (bulk packshot workflow) ----------------------------------
with tab_brands:
    st.subheader("Travail par marque")
    st.caption(
        "Choisissez une marque, déposez plusieurs packshots d'un coup — "
        "l'app les associe aux SKUs existants (par nom de fichier) ou crée "
        "de nouvelles slides."
    )

    df_all = ss.products_df
    if len(df_all) == 0:
        st.info("Ajoutez ou chargez des produits dans l'onglet **2. Content** "
                "pour pouvoir les regrouper par marque ici.")
    else:
        # Brands are sous_groupe (ByFPC mapping) — fall back to groupe.
        brand_col = "sous_groupe" if df_all["sous_groupe"].astype(str).str.strip().any() else "groupe"
        brand_counts = df_all[brand_col].value_counts()

        # Brand picker as a selectbox + badges
        brands = list(brand_counts.index)
        sel_brand = st.selectbox(
            "Marque",
            brands,
            format_func=lambda b: f"{b}  ({brand_counts[b]} SKUs)",
        )

        brand_mask = df_all[brand_col] == sel_brand
        brand_df = df_all[brand_mask]

        # Summary + brand logo uploader
        c1, c2, c3 = st.columns([2, 2, 2])
        n_with_pack = int(brand_df["packshot"].apply(
            lambda v: resolve_image(v) is not None
        ).sum())
        c1.metric("Total SKUs", len(brand_df))
        c2.metric("Avec packshot", n_with_pack)
        c3.metric("Sans packshot", len(brand_df) - n_with_pack)

        st.markdown("#### Logo de la marque")
        col_a, col_b = st.columns([1, 3])
        with col_a:
            existing_logo = brand_df["logo_groupe"].dropna().astype(str).str.strip()
            current_logo = next((resolve_image(v) for v in existing_logo if resolve_image(v)), None)
            if current_logo:
                st.image(current_logo, width=120)
            else:
                st.caption("_aucun_")
        with col_b:
            up_brand_logo = st.file_uploader(
                f"Drop logo for {sel_brand}",
                type=["png", "jpg", "jpeg"],
                key=f"up_brand_logo_{sel_brand}",
            )
            if up_brand_logo is not None:
                target = f"{_slug(sel_brand)}.png"
                (IMAGE_DIR / target).write_bytes(up_brand_logo.getbuffer())
                ss.products_df.loc[brand_mask, "logo_groupe"] = target
                st.toast(f"Logo appliqué à {int(brand_mask.sum())} SKUs.")
                st.rerun()

        st.markdown("#### Dépôt en masse de packshots")
        mode_bulk = st.radio(
            "Mode",
            ["Matcher par nom de fichier (ajoute l'image aux SKUs existants)",
             "Créer une nouvelle slide pour chaque image déposée"],
            horizontal=False,
            key="bulk_mode",
        )
        bulk = st.file_uploader(
            f"Glissez les packshots ici (plusieurs à la fois)",
            type=["png", "jpg", "jpeg"],
            accept_multiple_files=True,
            key=f"bulk_packshots_{sel_brand}",
        )
        if bulk:
            matched, missed, created = [], [], []
            sku_values = brand_df["nom"].astype(str).tolist()
            existing_packshots = brand_df["packshot"].astype(str).tolist()

            for f in bulk:
                fname = f.name
                save_name = fname
                (IMAGE_DIR / save_name).write_bytes(f.getbuffer())
                stem = Path(fname).stem

                if mode_bulk.startswith("Matcher"):
                    # Match by exact packshot filename, then by SKU-in-stem.
                    match_idx = None
                    eq = brand_df["packshot"].astype(str) == fname
                    if eq.any():
                        match_idx = brand_df.index[eq.tolist().index(True)]
                    else:
                        for i, sku in zip(brand_df.index, sku_values):
                            if sku and (sku.lower() in stem.lower()
                                        or stem.lower() in sku.lower()):
                                match_idx = i
                                break
                    if match_idx is not None:
                        ss.products_df.at[match_idx, "packshot"] = save_name
                        matched.append(fname)
                    else:
                        missed.append(fname)
                else:
                    # Create a new blank SKU row with the packshot set
                    blank = {c: "" for c in PRODUIT_COLS}
                    for c in ["prix_gros", "prix_gros_net",
                              "colisage_prix_gros", "colisage_prix_gros_net",
                              "promo_achat_qte", "promo_gratuit_qte", "promo_remise_pct"]:
                        blank[c] = 0
                    blank["is_promo"] = False
                    blank["sous_groupe" if brand_col == "sous_groupe" else "groupe"] = sel_brand
                    if brand_col == "sous_groupe":
                        # Inherit any category from the brand's first row
                        blank["groupe"] = brand_df.iloc[0]["groupe"] if len(brand_df) else ""
                    blank["nom"] = stem
                    blank["packshot"] = save_name
                    ss.products_df = pd.concat(
                        [ss.products_df, pd.DataFrame([blank], columns=PRODUIT_COLS)],
                        ignore_index=True,
                    )
                    created.append(fname)

            if matched:
                st.success(f"Appliqué à {len(matched)} SKU(s) existant(s).")
            if missed:
                st.warning(
                    f"{len(missed)} fichier(s) sans correspondance "
                    f"(images enregistrées dans le pool): {', '.join(missed[:5])}"
                    f"{'…' if len(missed) > 5 else ''}"
                )
            if created:
                st.success(f"{len(created)} nouvelle(s) slide(s) créée(s).")
            st.rerun()

        # Brand SKU preview grid
        st.markdown(f"#### SKUs — {sel_brand}")
        cols = st.columns(4)
        for i, (idx, row) in enumerate(brand_df.iterrows()):
            with cols[i % 4]:
                packshot = resolve_image(row.get("packshot"))
                if packshot:
                    st.image(packshot, caption=row["nom"], width=160)
                else:
                    st.markdown(f"**{row['nom']}**")
                    st.caption("_pas de packshot_")
                promo = " 🔥" if bool(row.get("is_promo")) else ""
                st.caption(
                    f"{row.get('groupe', '')}{promo} — "
                    f"PG: {row.get('prix_gros', 0)}  Net: {row.get('prix_gros_net', 0)}"
                )


# ---- Tab 3: Images ---------------------------------------------------------
with tab_images:
    st.subheader("Image pool (persistent)")
    st.caption(
        f"Uploaded images are stored in `{IMAGE_DIR.relative_to(Path(__file__).resolve().parent)}` "
        "and reused across app restarts. Reference them by filename in the "
        "Products table, or drop them in place via the preview's drag zones."
    )
    ups = st.file_uploader(
        "Upload images (drop many at once)",
        type=["png", "jpg", "jpeg"],
        accept_multiple_files=True, key="up_pool",
    )
    if ups:
        for f in ups:
            (IMAGE_DIR / f.name).write_bytes(f.getbuffer())
        st.success(f"Saved {len(ups)} image(s).")

    existing = sorted(
        [p for p in IMAGE_DIR.iterdir() if p.is_file()],
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    if existing:
        total_kb = sum(p.stat().st_size for p in existing) / 1024
        c1, c2 = st.columns([3, 1])
        c1.markdown(f"**{len(existing)} image(s) — {total_kb:.0f} KB total**")
        filt = c2.text_input("Filter", "", placeholder="e.g. MIO",
                             label_visibility="collapsed")
        if filt:
            existing = [p for p in existing if filt.lower() in p.name.lower()]

        cols = st.columns(4)
        from datetime import datetime as _dt
        for i, p in enumerate(existing):
            with cols[i % 4]:
                st.image(str(p), caption=p.name, width=180)
                mtime = _dt.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
                st.caption(f"↳ {mtime}")
                if st.button(f"🗑", key=f"del_img_{p.name}", help="Delete"):
                    p.unlink(missing_ok=True)
                    st.rerun()
    else:
        st.info("No images uploaded yet.")

# ---- Tab 4: Generate -------------------------------------------------------
with tab_generate:
    st.subheader("Summary")
    df = ss.products_df
    n_products = len(df)
    n_groups = df["groupe"].nunique() if n_products else 0
    n_subgroups = df.groupby(["groupe", "sous_groupe"]).ngroups if n_products else 0

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Products", n_products)
    c2.metric("Groups", n_groups)
    c3.metric("Sub-groups", n_subgroups)
    c4.metric("Slides", 1 + n_subgroups + n_products if n_products else 0)

    with_dividers = st.checkbox("Add sub-group divider slides", value=True)

    if st.button("Generate PPTX", type="primary", disabled=n_products == 0):
        deck = Deck(
            titre=ss.titre, canal=ss.canal, mois=ss.mois,
            banner_path=resolve_image(ss.banner),
            background_path=resolve_image(ss.background),
            cover_photo_path=resolve_image(ss.cover_photo),
        )
        groups: dict[str, Group] = {}
        subgroups: dict[tuple[str, str], SubGroup] = {}
        for _, row in df.iterrows():
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
            subgroups[key].produits.append(Product(
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
            ))

        data = build_pptx(deck, with_subgroup_dividers=with_dividers)
        # Auto-archive into archive/<YYYY-MM>/
        archived = archive_deck(
            data, ss.products_df,
            {"titre": ss.titre, "canal": ss.canal, "mois": ss.mois},
            mois=ss.mois,
        )
        st.success(
            f"Generated {len(deck.groupes)} group(s), "
            f"{sum(len(g.sous_groupes) for g in deck.groupes)} sub-group(s), "
            f"{sum(1 for _ in deck.iter_products())} product slide(s). "
            f"Archived at `{archived.relative_to(Path(__file__).resolve().parent)}`."
        )
        st.download_button(
            "Download PPTX",
            data=data,
            file_name=f"{ss.titre.replace(' ', '_')}_{ss.canal.replace(' ', '_')}.pptx",
            mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
