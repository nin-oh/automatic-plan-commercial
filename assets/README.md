# assets/

Folder layout expected by `generate_deck.py`:

- `stable/` — pieces that appear on EVERY applicable slide (loaded once,
  embedded once in the output). Filenames are fixed:
    - `header_ribbon_canal_gros.png`   (top-left red ribbon, 4.96×1.66 in)
    - `corner_tr_logo.png`             (top-right brand logo, 2.66×2.29 in)
    - `corner_bl_logo.png`             (bottom-left brand logo, 2.40×2.19 in)
    - `wood_backdrop.png`              (bottom scene, full width, 13.33×3.73 in)
    - `red_underline.png`              (title underline, 1.42×0.20 in)

- `categories/` — one PNG per Excel Category value, filename = category name
  with spaces replaced by underscores. Example: `Detergent_Pdr_Main.png`.

- `brands/` — one PNG per Excel Brand value, filename = brand. Examples:
  `MIO.png`, `FIX.png`, `IRIS.png`, `MALA.png`, `ZEN.png`, `BANO.png`,
  `A+.png`, `QZI.png`.

- `products/` — one PNG per SKU (packshot). Filename = the exact SKU
  string from the Excel BySKU sheet. Example: `MIO-PDR-10KG.png`.

Missing packshots fall back to `brands/<Brand>.png`, then are skipped with a
log warning.
