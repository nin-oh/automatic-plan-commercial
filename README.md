# automatic-plan-commercial

Two ways to build the Groupe Enosis *Plan Commercial Canal Gros* PowerPoint deck:

- **CLI** — `generate_deck.py` turns the monthly `PL_Changes_*.xlsx` directly into a full `.pptx` (cover → category intros → brand intros → one slide per SKU → closing), pulling packshots from a folder on disk. Designed for automation.
- **Streamlit app** — `app.py` gives a GUI with manual editing and a live slide preview. Good for one-off decks or when no Excel is available.

Both share the same layout: Canal Gros ribbon top-left, MIO logos at top-right and bottom-left, wood backdrop, product title, two price tables (*Prix à l'unité* / *Prix à la caisse*), centered packshot.

## CLI — the production path

```
pip install python-pptx openpyxl Pillow

python generate_deck.py \
    --excel PL_Changes_260415_-_Gros.xlsx \
    --assets ./assets \
    --month "Avril 2026" \
    --out ./output/Plan_commercial_Gros_Avril_2026.pptx
```

Quick tree preview of what's in the workbook (no .pptx written):

```
python generate_deck.py --excel PL_Changes_260415_-_Gros.xlsx --tree
```

### Excel schema

Sheet `BySKU`, header on row 5, data from row 6:

| A | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SKU | Category | Brand | Change | _blank_ | Gros_BP_new | Promo_Txt_new | Gros_Net_new | _blank_ | Gros_BP_old | Promo_Txt_old | Gros_Net_old |

Categories render in order: *Detergent Pdr Main*, *Detergent Pdr Matic*, *Detergent Liquide*, *Liquide Vaisselle*, *Pâte*, *Javel*. Unknown categories appear at the end.

### Assets folder

```
assets/
├── stable/                             # loaded ONCE, embedded ONCE in the .pptx
│   ├── header_ribbon_canal_gros.png    # TL red ribbon, 4.96 × 1.66 in
│   ├── corner_tr_logo.png              # TR brand logo, 2.66 × 2.29 in
│   ├── corner_bl_logo.png              # BL brand logo, 2.40 × 2.19 in
│   ├── wood_backdrop.png               # bottom scene, 13.33 × 3.73 in
│   └── red_underline.png               # title underline, 1.42 × 0.20 in
├── categories/                         # one PNG per Category (spaces → '_')
│   └── Detergent_Pdr_Main.png ...
├── brands/                             # one PNG per Brand
│   └── MIO.png  FIX.png  IRIS.png ...
└── products/                           # one PNG per SKU
    ├── MIO-PDR-10KG.png
    └── ...
```

Missing packshot (`products/<SKU>.png`) → falls back to `brands/<Brand>.png`, then skipped with a warning.

### Price formatting

- Moroccan style: space thousands separator, comma decimal, two decimals (`127,00`).
- When new ≠ old: new in **bold red**, old below in gray with strikethrough.
- `Promo_Txt` prints as a small italic caption under the net price.

### Output size

The reference deck was 175 MB because Office re-embedded each media item per slide. This generator caches every stable asset as a single `BytesIO` and reuses the stream — python-pptx content-hashes it and embeds once. A 140-product deck is typically under 20 MB.

## GUI — two builds

Two interchangeable interfaces; pick the one that feels best on your machine.

|              | Streamlit (`app.py`)             | NiceGUI (`app_ng.py`)           |
|--------------|-----------------------------------|----------------------------------|
| Launcher     | `run.bat` / `run.sh`              | `run_ng.bat` / `run_ng.sh`       |
| URL          | `http://localhost:8501`           | `http://localhost:8502`          |
| Re-run model | Whole-page on every input         | Component-level (`@ui.refreshable`) |
| Tabs         | Home / Deck / Content / Brands / Images / Generate | Single page (MVP — Brands/Images/Home archived in Streamlit for now) |
| Best for     | Familiar look, all features today | Snappier when editing 100+ SKUs  |

```
pip install -r requirements.txt
streamlit run app.py     # or python app_ng.py
```

Both reuse the same backend — `python-pptx` generator, Pillow preview, Excel I/O, image library. Only the UI layer differs.

### Streamlit four tabs
**Deck** (metadata, banner / background / cover overrides), **Content** (Excel upload *or* editable products table + live PNG preview of any slide), **Images** (pool of uploaded logos/packshots referenced by filename), **Generate** (slide count + download).

The app uses a simpler, self-contained Excel template (`Meta` + `Produits` sheets) — see **"Excel template"** section below. It's decoupled from the CLI's `PL_Changes_*.xlsx` schema.

### Streamlit Excel template

- `Meta` — key/value: `titre`, `canal`, `mois`.
- `Produits` — columns: `groupe`, `sous_groupe`, `nom`, `packshot`, `nom_image`, `prix_gros`, `prix_gros_net`, `colisage`, `colisage_prix_gros`, `colisage_prix_gros_net`, `logo_groupe`.

## Layout

```
automatic-plan-commercial/
├── generate_deck.py          # CLI entrypoint
├── excel_reader.py           # ByFPC parser, Product dataclass
├── stable_layer.py           # cached stable branding
├── product_layer.py          # title + price tables + packshot
├── app.py                    # Streamlit UI
├── run.bat / run.sh          # Streamlit one-click launchers
├── app_ng.py                 # NiceGUI build (alt UI)
├── run_ng.bat / run_ng.sh    # NiceGUI one-click launchers
├── requirements.txt
├── assets/
│   ├── stable/  categories/  brands/  products/
│   └── builtin/              # legacy names kept for the Streamlit app
├── samples/                  # reference .pptx (for asset extraction)
└── src/plan_commercial/      # Streamlit generator / model / excel_io / preview
```
