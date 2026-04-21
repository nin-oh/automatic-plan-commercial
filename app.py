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

IMAGE_DIR = Path(tempfile.gettempdir()) / "plan_commercial_images"
IMAGE_DIR.mkdir(exist_ok=True)


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

tab_deck, tab_content, tab_images, tab_generate = st.tabs(
    ["1. Deck", "2. Content", "3. Images", "4. Generate"]
)

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
                "Upload filled Excel (Meta/Produits template OR PL_Changes ByFPC)",
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

                if "ByFPC" in sheet_names:
                    # Real PL_Changes workbook
                    try:
                        tmp = Path(tempfile.gettempdir()) / "_uploaded.xlsx"
                        tmp.write_bytes(data)
                        products = byfpc_reader.read_byfpc(tmp)
                        rows = [{
                            "groupe": p.category or "Sans catégorie",
                            "sous_groupe": p.brand or "Sans marque",
                            "nom": p.description or p.sku or p.item_code,
                            "packshot": f"{p.item_code}.png",
                            "nom_image": "",
                            "prix_gros": p.bp_new or 0.0,
                            "prix_gros_net": p.net_new or 0.0,
                            "colisage": "",
                            "colisage_prix_gros": p.bp_new or 0.0,
                            "colisage_prix_gros_net": p.net_new or 0.0,
                            "logo_groupe": f"{p.brand}.png" if p.brand else "",
                        } for p in products]
                        ss.products_df = pd.DataFrame(rows, columns=PRODUIT_COLS)
                        st.success(
                            f"Loaded {len(rows)} products from ByFPC "
                            f"({ss.products_df['groupe'].nunique()} categories, "
                            f"{ss.products_df['sous_groupe'].nunique()} brands)."
                        )
                        st.info(
                            "Packshot filenames are set to `<Item Code>.png` and brand "
                            "logos to `<Brand>.png`. Upload matching images in the "
                            "Images tab."
                        )
                    except Exception as exc:
                        st.error(f"Failed to read ByFPC sheet: {exc}")
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
                        "Expected either `ByFPC` (PL_Changes) or `Meta`+`Produits` "
                        "(app template)."
                    )

    st.markdown("#### Products table")
    st.caption(
        "Add rows, edit values. `packshot`, `nom_image`, `logo_groupe` are filenames of "
        "images uploaded in the Images tab."
    )
    edited = st.data_editor(
        ss.products_df,
        num_rows="dynamic",
        use_container_width=True,
        column_config={
            "prix_gros": st.column_config.NumberColumn(format="%.2f"),
            "prix_gros_net": st.column_config.NumberColumn(format="%.2f"),
            "colisage_prix_gros": st.column_config.NumberColumn(format="%.2f"),
            "colisage_prix_gros_net": st.column_config.NumberColumn(format="%.2f"),
        },
        key="products_editor",
    )
    ss.products_df = edited

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
                st.image(render_cover(deck), use_column_width=True)
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
            )
            with preview_col:
                st.image(render_product(deck, group, product), use_column_width=True)
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

                # -- Brand logo (applies to all rows with same group name) --
                brand = str(row.get("groupe") or "")
                logo_name = str(row.get("logo_groupe") or "").strip() \
                    or (f"{brand}_logo.png" if brand else f"row{idx+1}_logo.png")
                st.markdown(f"**Brand logo** — _{brand or '(no group)'}_")
                if group.logo_path:
                    st.image(group.logo_path, width=160)
                up_logo = st.file_uploader(
                    f"Drop logo for {brand or 'group'}",
                    type=["png", "jpg", "jpeg"],
                    key=f"up_logo_{idx}",
                    label_visibility="collapsed",
                )
                if up_logo is not None:
                    target_name = logo_name
                    if not target_name.lower().endswith((".png", ".jpg", ".jpeg")):
                        target_name += Path(up_logo.name).suffix or ".png"
                    (IMAGE_DIR / target_name).write_bytes(up_logo.getbuffer())
                    # Apply to every row sharing this group name
                    if brand:
                        mask = ss.products_df["groupe"] == brand
                        ss.products_df.loc[mask, "logo_groupe"] = target_name
                    else:
                        ss.products_df.at[df.index[idx], "logo_groupe"] = target_name
                    st.rerun()

# ---- Tab 3: Images ---------------------------------------------------------
with tab_images:
    st.subheader("Image pool")
    st.caption(
        "Upload logos, packshots and (optional) product-name PNGs. "
        "Reference them by filename in the Products table."
    )
    ups = st.file_uploader(
        "Upload images", type=["png", "jpg", "jpeg"],
        accept_multiple_files=True, key="up_pool",
    )
    if ups:
        for f in ups:
            (IMAGE_DIR / f.name).write_bytes(f.getbuffer())
        st.success(f"Saved {len(ups)} image(s).")

    existing = sorted(p.name for p in IMAGE_DIR.iterdir() if p.is_file())
    if existing:
        st.markdown(f"**{len(existing)} image(s) in pool:**")
        cols = st.columns(4)
        for i, name in enumerate(existing):
            with cols[i % 4]:
                st.image(str(IMAGE_DIR / name), caption=name, width=180)
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
            ))

        data = build_pptx(deck, with_subgroup_dividers=with_dividers)
        st.success(f"Generated {len(deck.groupes)} group(s), "
                   f"{sum(len(g.sous_groupes) for g in deck.groupes)} sub-group(s), "
                   f"{sum(1 for _ in deck.iter_products())} product slide(s).")
        st.download_button(
            "Download PPTX",
            data=data,
            file_name=f"{ss.titre.replace(' ', '_')}_{ss.canal.replace(' ', '_')}.pptx",
            mime="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )
