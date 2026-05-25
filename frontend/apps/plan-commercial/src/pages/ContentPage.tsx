import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SmartTable, SlideEditor, SectionCard, Toast,
  type ColumnDef, type SlideProductRow, type PackshotRect,
} from '@amafin/ui';
// PromoCanvasEditor (Konva-based) is parked — see organisms/index.ts.
// import { PromoCanvasEditor, type PromoLayout } from '@amafin/ui';
import { Plus, Trash2, Download, Upload, FileSpreadsheet, Table2, Edit3 } from 'lucide-react';
import { PageShell, PC_ACCENT, pcButton } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

const COLUMNS: ColumnDef[] = [
  { key: 'groupe',                 label: 'Groupe',         type: 'text',     editable: true,  minWidth: 120 },
  { key: 'sous_groupe',            label: 'Sous-groupe',    type: 'text',     editable: true,  minWidth: 130 },
  { key: 'nom',                    label: 'Nom',            type: 'text',     editable: true,  minWidth: 160 },
  { key: 'packshot',               label: 'Packshot',       type: 'text',     editable: true,  minWidth: 140 },
  { key: 'prix_gros',              label: 'Prix Gros',      type: 'number',   editable: true,  format: 'plain' },
  { key: 'prix_gros_net',          label: 'Prix Gros Net',  type: 'number',   editable: true,  format: 'plain' },
  { key: 'colisage',               label: 'Colisage',       type: 'text',     editable: true,  minWidth: 110 },
  { key: 'colisage_prix_gros',     label: 'PG (caisse)',    type: 'number',   editable: true,  format: 'plain' },
  { key: 'colisage_prix_gros_net', label: 'Net (caisse)',   type: 'number',   editable: true,  format: 'plain' },
  { key: 'logo_groupe',            label: 'Logo marque',    type: 'text',     editable: true,  minWidth: 130 },
  { key: 'is_promo',               label: 'Promo ?',        type: 'checkbox', editable: true },
  { key: 'type_promo',             label: 'Type promo',     type: 'select',   editable: true,
    choices: [
      { value: '', label: '—' },
      { value: 'gratuite', label: 'gratuite' },
      { value: 'remise', label: 'remise' },
      { value: 'remise+gratuite', label: 'remise+gratuite' },
    ],
  },
  { key: 'promo_achat_qte',        label: 'Achat (N)',      type: 'number',   editable: true },
  { key: 'promo_gratuit_qte',      label: 'Gratuit (X)',    type: 'number',   editable: true },
  { key: 'promo_remise_pct',       label: 'Remise %',       type: 'number',   editable: true,  format: 'percent' },
];

export function PlanCommercialContentPage() {
  const {
    products, images, previewBust,
    refreshState, refreshProducts, refreshImages,
    patchProduct, bumpPreview,
  } = usePlanCommercial();

  const [slideIdx, setSlideIdx] = useState(0);
  const [promoIdx, setPromoIdx] = useState(0);
  const [promoCount, setPromoCount] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    refreshState();
    refreshProducts();
    refreshImages();
  }, [refreshState, refreshProducts, refreshImages]);

  // SmartTable expects each row to have a stable id. We can't use array index
  // because the SmartTable is paginated — synthesize one based on the row's
  // position so callbacks know which product to mutate.
  const tableData = useMemo(
    () => products.map((p, i) => ({ ...p, id: i })),
    [products],
  );

  const currentRow = products[slideIdx];

  // Labels for the slide-picker dropdown — "MIO MAIN 1kg · MIO / Pdr Main"
  const slideLabels = useMemo(
    () => products.map((p: any) => {
      const nom = (p.nom || '').trim() || '(sans nom)';
      const tag = [p.groupe, p.sous_groupe].filter(Boolean).join(' / ');
      return tag ? `${nom} · ${tag}` : nom;
    }),
    [products],
  );

  // ── Effective packshot rect for the current slide ──
  // Pulled from the API so we know the layout defaults without hardcoding.
  // Refetched whenever the slide changes or the row's packshot fields change.
  const [packshotRect, setPackshotRect] = useState<PackshotRect | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!currentRow || currentRow.is_promo) { setPackshotRect(null); return; }
    api.getPackshotRect(slideIdx).then((r) => {
      if (!cancelled) setPackshotRect(r);
    }).catch(() => { if (!cancelled) setPackshotRect(null); });
    return () => { cancelled = true; };
  }, [
    slideIdx,
    // re-run if any of these change for the current row
    currentRow?.is_promo,
    currentRow?.packshot_left, currentRow?.packshot_top,
    currentRow?.packshot_width, currentRow?.packshot_height,
  ]);

  // ── Multi-promo: when the row's promo_texte has `//` separators, the
  // backend emits one slide per segment. Fetch the count, reset sub-index
  // whenever the row changes. ──
  useEffect(() => {
    let cancelled = false;
    setPromoIdx(0);
    if (!currentRow) { setPromoCount(1); return; }
    api.getProductPromoCount(slideIdx).then((n) => {
      if (!cancelled) setPromoCount(Math.max(1, n));
    }).catch(() => { if (!cancelled) setPromoCount(1); });
    return () => { cancelled = true; };
  }, [
    slideIdx,
    currentRow?.is_promo,
    currentRow?.promo_texte,
  ]);

  // ── Debounced patch — text edits don't kick off a preview re-render on
  //    every keystroke; instead we wait 300ms of quiet then commit. ──
  const debounceTimers = useRef<Map<string, number>>(new Map());
  const debouncedPatch = useCallback((idx: number, patch: Record<string, any>) => {
    // Apply local change immediately so the input stays responsive
    usePlanCommercial.getState().patchProductLocal(idx, patch);
    // Coalesce per (idx + field-set) — last write wins
    const key = `${idx}:${Object.keys(patch).sort().join(',')}`;
    const prev = debounceTimers.current.get(key);
    if (prev) window.clearTimeout(prev);
    const handle = window.setTimeout(() => {
      debounceTimers.current.delete(key);
      patchProduct(idx, patch);
    }, 300);
    debounceTimers.current.set(key, handle);
  }, [patchProduct]);

  // Brand context for the picker filters
  const brand = currentRow
    ? (currentRow.sous_groupe || currentRow.groupe || '').trim()
    : '';
  const packshots = useMemo(
    () => images.filter((a) => a.type === 'packshot' && (!brand || a.brand === brand.toUpperCase())),
    [images, brand],
  );
  const logos = useMemo(
    () => images.filter((a) => a.type === 'logo'),
    [images],
  );

  // ---- Excel I/O ----
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const r = await api.importExcel(f);
      await refreshProducts(); await refreshState();
      setSlideIdx(0); bumpPreview();
      setToast({ message: `${r.loaded} produits chargés (${r.kind})`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail ?? 'Erreur d\'import', type: 'error' });
    }
  }

  async function handleAddProduct() {
    await api.createProduct();
    await refreshProducts();
    setSlideIdx(products.length);    // jump to the newly added row
    bumpPreview();
  }

  async function handleClearAll() {
    if (!confirm('Supprimer tous les produits ?')) return;
    await api.clearProducts();
    await refreshProducts();
    setSlideIdx(0);
  }

  return (
    <PageShell
      title="Contenu"
      subtitle="Tableau des produits et éditeur de slide. Modifiez en ligne ou via l'éditeur visuel."
      actions={
        <>
          <a href={api.downloadTemplateUrl} download style={{ ...pcButton.base, ...pcButton.secondary }}>
            <FileSpreadsheet size={13} /> Template
          </a>
          <a href={api.exportXlsxUrl} download style={{ ...pcButton.base, ...pcButton.secondary }}>
            <Download size={13} /> Export
          </a>
          <label style={{ ...pcButton.base, ...pcButton.secondary }}>
            <Upload size={13} /> Importer Excel
            <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <button onClick={handleAddProduct} style={{ ...pcButton.base, ...pcButton.primary }}>
            <Plus size={13} /> Ajouter
          </button>
          <button onClick={handleClearAll} style={{ ...pcButton.base, ...pcButton.danger }}>
            <Trash2 size={13} /> Effacer
          </button>
        </>
      }
    >
      {/* Products table */}
      <SectionCard
        icon={<Table2 size={16} />}
        accent={PC_ACCENT}
        title="Produits"
        subtitle={`${products.length} ligne(s) — double-cliquez sur une cellule pour modifier en ligne.`}
        flush
      >
        <SmartTable
          columns={COLUMNS}
          data={tableData}
          headerColor={PC_ACCENT}
          searchable
          sortable
          paginated
          pageSize={25}
          onCellEdit={async (id, field, value) => {
            const idx = Number(id);
            await patchProduct(idx, { [field]: value });
          }}
          onRowDelete={async (id) => {
            await api.deleteProduct(Number(id));
            await refreshProducts();
            if (slideIdx >= products.length - 1) setSlideIdx(Math.max(0, products.length - 2));
          }}
        />
      </SectionCard>

      {/* Slide editor */}
      <SectionCard
        icon={<Edit3 size={16} />}
        accent={PC_ACCENT}
        title="Éditeur de slide"
        subtitle="Aperçu en direct, glisser-déposer du packshot et du logo, et édition rapide des prix et de la promo."
      >
        {currentRow && promoCount > 1 ? (
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8,
            padding: '6px 10px', background: '#FEF3F2', border: `1px solid ${PC_ACCENT}33`,
            borderRadius: 6, fontSize: 12, color: '#7B1F2C', flexWrap: 'wrap',
          }}>
            <span style={{ fontWeight: 600 }}>
              {promoCount} promos détectées (séparateur «&nbsp;//&nbsp;») :
            </span>
            {Array.from({ length: promoCount }).map((_, i) => (
              <button
                key={i}
                onClick={() => setPromoIdx(i)}
                style={{
                  padding: '3px 10px', borderRadius: 4, fontSize: 11,
                  border: `1px solid ${i === promoIdx ? PC_ACCENT : '#D8B4BC'}`,
                  background: i === promoIdx ? PC_ACCENT : '#FFFFFF',
                  color: i === promoIdx ? '#FFFFFF' : '#7B1F2C',
                  cursor: 'pointer', fontWeight: i === promoIdx ? 600 : 400,
                }}
              >
                Offre {i + 1}
              </button>
            ))}
          </div>
        ) : null}
        {currentRow ? (
          <SlideEditor
            index={slideIdx}
            total={products.length}
            row={currentRow as SlideProductRow}
            slideLabels={slideLabels}
            previewUrl={api.previewProductUrl(slideIdx, previewBust, promoIdx)}
            resolveImageUrl={api.imageUrl}
            packshots={packshots}
            logos={logos}
            allImages={images}
            accent={PC_ACCENT}
            packshotRect={packshotRect}
            onGoTo={setSlideIdx}
            onChange={(patch) => debouncedPatch(slideIdx, patch)}
            onPlacePackshot={async (x, y) => {
              try {
                const r = await api.placePackshot(slideIdx, x, y);
                usePlanCommercial.getState().patchProductLocal(slideIdx, r);
                setPackshotRect((p) => p ? { ...p, left: r.packshot_left, top: r.packshot_top } : p);
                bumpPreview();
              } catch (e: any) {
                setToast({ message: e?.message ?? 'Erreur', type: 'error' });
              }
            }}
            onMoveOrResizePackshot={(rect) => {
              // Immediate local update so the box stays where the user put it
              usePlanCommercial.getState().patchProductLocal(slideIdx, {
                packshot_left: rect.left, packshot_top: rect.top,
                packshot_width: rect.width, packshot_height: rect.height,
              });
              setPackshotRect(rect);
              // Commit to server (no debounce — drag/release is already a
              // discrete user gesture)
              patchProduct(slideIdx, {
                packshot_left: rect.left, packshot_top: rect.top,
                packshot_width: rect.width, packshot_height: rect.height,
              });
            }}
            onResetPosition={() =>
              patchProduct(slideIdx, {
                packshot_left: 0, packshot_top: 0,
                packshot_width: 0, packshot_height: 0,
              })
            }
            onUploadPackshot={async (file) => {
              const target = currentRow.packshot || file.name;
              const newName = /\.(png|jpe?g|webp)$/i.test(target) ? target : `${target}.png`;
              const renamed = new File([file], newName, { type: file.type });
              await api.uploadImages([renamed], brand, 'packshot');
              await patchProduct(slideIdx, { packshot: newName });
              await refreshImages();
              bumpPreview();
            }}
            onUploadBrandLogo={async (file) => {
              const target = currentRow.logo_groupe || `${brand || 'logo'}.png`;
              const newName = /\.(png|jpe?g|webp)$/i.test(target) ? target : `${target}.png`;
              const renamed = new File([file], newName, { type: file.type });
              await api.uploadImages([renamed], brand, 'logo');
              if (brand) {
                const field = currentRow.sous_groupe ? 'sous_groupe' : 'groupe';
                await api.applyBrandLogo(brand, field, newName);
              } else {
                await patchProduct(slideIdx, { logo_groupe: newName });
              }
              await refreshProducts();
              await refreshImages();
              bumpPreview();
            }}
            onPickPackshot={async (filename) => {
              await patchProduct(slideIdx, { packshot: filename });
            }}
            onPickBrandLogo={async (filename) => {
              if (brand) {
                const field = currentRow.sous_groupe ? 'sous_groupe' : 'groupe';
                await api.applyBrandLogo(brand, field, filename);
                await refreshProducts();
                bumpPreview();
              } else {
                await patchProduct(slideIdx, { logo_groupe: filename });
              }
            }}
          />
        ) : (
          <div style={{
            padding: 40, border: '1px dashed #27272a', borderRadius: 12,
            color: '#71717a', textAlign: 'center', fontSize: 13,
            background: 'rgba(249, 115, 22, 0.03)',
          }}>
            Aucun produit. Cliquez sur <b style={{ color: '#fb923c' }}>+ Ajouter</b> ou
            {' '}<b style={{ color: '#fb923c' }}>Importer Excel</b> pour commencer.
          </div>
        )}
      </SectionCard>

      {/* ── PromoCanvasEditor (Konva-based) — PARKED ─────────────────────
          Re-enable by:
            1. Adding `konva` + `react-konva` to apps/plan-commercial/package.json
            2. Re-importing PromoCanvasEditor + PromoLayout at the top of this file
            3. Re-enabling the export in packages/ui/src/organisms/index.ts
            4. Uncommenting the JSX block below + the parsePromoLayout helper
          Backend support (promo_layout JSON field, _layout_pos helper) is still
          in place — when the editor is re-enabled, the Python renderers will
          honor the layout overrides immediately.

          {currentRow?.is_promo && (
            <SectionCard
              icon={<Move3D size={16} />}
              accent={PC_ACCENT}
              title="Disposition manuelle (canvas)"
              subtitle="Glissez et redimensionnez chaque élément. Les positions remplacent les valeurs par défaut."
              actions={
                <button
                  onClick={() => patchProduct(slideIdx, { promo_layout: '' })}
                  style={{ ...pcButton.base, ...pcButton.secondary }}
                  title="Restaure les positions par défaut du modèle"
                >
                  <RotateCcw size={13} /> Réinitialiser
                </button>
              }
            >
              <PromoCanvasEditor
                width={880}
                layout={parsePromoLayout(currentRow?.promo_layout)}
                enabled={{
                  leftCarton:  !!currentRow?.promo_carton_left,
                  rightCarton: !!currentRow?.promo_carton_right,
                  leftRibbon:  !!currentRow?.promo_ribbon_left,
                  rightRibbon: !!currentRow?.promo_ribbon_right,
                }}
                packshotSrc={currentRow?.packshot || ''}
                cartonSrc={currentRow?.promo_carton_image || 'default_carton.png'}
                ribbonSrc={currentRow?.promo_ribbon_image || 'default_ribbon.png'}
                resolveImageUrl={(filename) =>
                  filename === 'default_carton.png' || filename === 'default_ribbon.png'
                    ? `/files/${filename}`
                    : api.imageUrl(filename)
                }
                onChange={(next) => {
                  patchProduct(slideIdx, { promo_layout: JSON.stringify(next) });
                }}
              />
            </SectionCard>
          )}

          function parsePromoLayout(raw: unknown): PromoLayout {
            if (!raw || typeof raw !== 'string') return {};
            try {
              const parsed = JSON.parse(raw);
              return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
              return {};
            }
          }
      */}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
