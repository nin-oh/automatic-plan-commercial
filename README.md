# automatic-plan-commercial

Streamlit app that generates a *plan commercial* PowerPoint deck (cover + one slide per product) from either an uploaded Excel file or a form filled directly in the UI.

Product slides mirror the layout of the reference MIO Canal Gros deck: Canal banner top-left, brand logo top-right, product name, two price tables (*Prix à l'unité* / *Prix à la caisse*), packshot on the wood background.

## Run

```
pip install -r requirements.txt
streamlit run app.py
```

Then open the URL Streamlit prints.

## Workflow

1. **Deck** — set title, canal, mois. Optionally upload custom banner / background / cover photo (defaults extracted from the reference deck).
2. **Content** — either:
   - **Excel upload**: download the template, fill it, upload back.
   - **Manual**: edit the products table in-place (add rows, fill prices, reference image filenames).
3. **Images** — upload packshots / logos / optional product-name PNGs. Reference them by filename in the products table.
4. **Generate** — click, preview the slide count, download the `.pptx`.

## Excel template

Two sheets:

- `Meta` — key/value: `titre`, `canal`, `mois`.
- `Produits` — columns: `groupe`, `sous_groupe`, `nom`, `packshot`, `nom_image`, `prix_gros`, `prix_gros_net`, `colisage`, `colisage_prix_gros`, `colisage_prix_gros_net`, `logo_groupe`.

Image columns hold filenames; matching images must be uploaded in the Images tab.

## Layout

```
automatic-plan-commercial/
├── app.py                              # Streamlit UI
├── requirements.txt
├── assets/builtin/                     # defaults extracted from sample
│   ├── banner_canal_gros.png
│   ├── mio_logo.png
│   ├── label_prix_unite.png
│   ├── label_prix_caisse.png
│   └── wood_background.png
├── samples/                            # reference deck(s)
└── src/plan_commercial/
    ├── model.py                        # Deck, Group, SubGroup, Product
    ├── generator.py                    # build_pptx()
    └── excel_io.py                     # read_excel, write_template
```
