import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SmartTable, SlideEditor, SectionCard, Toast,
  type ColumnDef, type SlideProductRow, type PackshotRect,
} from '@amafin/ui';
// PromoCanvasEditor (Konva-based) is parked — see organisms/index.ts.
import {
  Plus, Trash2, Download, Upload, FileSpreadsheet, Table2, Edit3,
  Search, Tag, ChevronUp, ChevronDown, LayoutGrid, History, RotateCcw, X,
  Presentation,
} from 'lucide-react';
import { PageShell, PC_ACCENT, PC_GRADIENT, pcButton } from './PageShell';
import * as api from '../api';
import { usePlanCommercial } from '../store/usePlanCommercial';

const COLUMNS: ColumnDef[] = [
  { key: 'groupe',                 label: 'Groupe',         type: 'text',     editable: true,  minWidth: 120 },
  { key: 'sous_groupe',            label: 'Sous-groupe',    type: 'text',     editable: true,  minWidth: 130 },
  { key: 'nom',                    label: 'Nom',            type: 'text',     editable: true,  minWidth: 160 },
  { key: 'item_code',              label: 'ItemCode',       type: 'text',     editable: true,  minWidth: 110 },
  { key: 'packshot',               label: 'Packshot',       type: 'text',     editable: true,  minWidth: 140 },
  { key: 'prix_gros',              label: 'Prix Gros',      type: 'number',   editable: true,  format: 'plain' },
  { key: 'prix_gros_net',          label: 'Prix Gros Net',  type: 'number',   editable: true,  format: 'plain' },
  { key: 'prix_detail',            label: 'Prix Détail',    type: 'number',   editable: true,  format: 'plain' },
  { key: 'prix_detail_net',        label: 'Prix Détail Net', type: 'number',  editable: true,  format: 'plain' },
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
  // Container word for the "Pour N …" caption. Empty = use the channel
  // default ("caisse" for Gros, "unité" for Détail). Per-row override so
  // a promo on a SAC product can say "Pour 20 sacs" instead of caisses.
  { key: 'promo_unit',             label: 'Unité promo',    type: 'select',   editable: true, minWidth: 110,
    choices: [
      { value: '', label: '— (auto)' },
      { value: 'sac',    label: 'sac' },
      { value: 'carton', label: 'carton' },
      { value: 'caisse', label: 'caisse' },
      { value: 'unité',  label: 'unité' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────
// Product rail — the master list on the left of the editor view. Grouped by
// brand (consecutive runs, so the visual order always matches slide order),
// searchable, with packshot thumbnails and promo badges.
// ─────────────────────────────────────────────────────────────────────────

interface RailGroup {
  brand: string;
  items: { idx: number; row: any }[];
}

function groupConsecutive(products: any[]): RailGroup[] {
  const groups: RailGroup[] = [];
  products.forEach((row, idx) => {
    const brand = ((row.sous_groupe || row.groupe || '') as string).trim() || 'Sans marque';
    const last = groups[groups.length - 1];
    if (last && last.brand === brand) last.items.push({ idx, row });
    else groups.push({ brand, items: [{ idx, row }] });
  });
  return groups;
}

function ProductRail({
  products, slideIdx, onSelect, onAdd, previewBust,
}: {
  products: any[];
  slideIdx: number;
  onSelect: (idx: number) => void;
  onAdd: () => void;
  previewBust: number;
}) {
  const [query, setQuery] = useState('');
  const selectedRef = useRef<HTMLButtonElement>(null);

  // Keep the selected item visible when navigating with the keyboard.
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [slideIdx]);

  const groups = useMemo(() => {
    const all = groupConsecutive(products);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((g) => ({
        ...g,
        items: g.items.filter(({ row }) =>
          `${row.nom || ''} ${g.brand}`.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [products, query]);

  const shown = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#ffffff', border: '1px solid #ececee', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden',
      position: 'sticky', top: 12, maxHeight: 'calc(100vh - 110px)',
    }}>
      {/* Search */}
      <div style={{ padding: 10, borderBottom: '1px solid #f1f1f3' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{
            position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)',
            color: '#a1a1aa', pointerEvents: 'none',
          }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Rechercher (${products.length} produits)…`}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 8px 7px 28px', borderRadius: 8,
              border: '1px solid #e4e4e7', fontSize: 12, fontFamily: 'Inter, sans-serif',
              outline: 'none', background: '#fafafa',
            }}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 10px' }}>
        {groups.length === 0 && (
          <div style={{ padding: 20, fontSize: 12, color: '#a1a1aa', textAlign: 'center' }}>
            Aucun produit ne correspond.
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={`${g.brand}-${gi}`}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 8px 4px', fontSize: 10.5, fontWeight: 700,
              letterSpacing: 0.6, textTransform: 'uppercase', color: '#9a3412',
            }}>
              <Tag size={10} />
              {g.brand}
              <span style={{ color: '#d4d4d8', fontWeight: 500 }}>· {g.items.length}</span>
            </div>
            {g.items.map(({ idx, row }) => {
              const active = idx === slideIdx;
              return (
                <button
                  key={idx}
                  ref={active ? selectedRef : undefined}
                  onClick={() => onSelect(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                    padding: '6px 8px', marginBottom: 2, borderRadius: 9,
                    border: '1px solid transparent', textAlign: 'left',
                    cursor: 'pointer', transition: 'background 120ms',
                    background: active ? `${PC_ACCENT}14` : 'transparent',
                    borderColor: active ? `${PC_ACCENT}55` : 'transparent',
                  }}
                >
                  {/* Mini slide preview (server-cached, 128px render) */}
                  <div style={{
                    width: 62, height: 35, borderRadius: 5, flexShrink: 0,
                    background: '#f8f8f8', border: '1px solid #ececee',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}>
                    <img
                      src={api.previewProductUrl(idx, previewBust, 0, 128)}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                  {/* Name + badges */}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                      fontSize: 12, fontWeight: active ? 700 : 500,
                      color: active ? '#7c2d12' : '#3f3f46',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {(row.nom || '').trim() || '(sans nom)'}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 2, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#a1a1aa' }}>#{idx + 1}</span>
                      {row.is_promo && (
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px',
                          borderRadius: 999, letterSpacing: 0.4,
                          background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
                        }}>
                          PROMO{row.type_promo ? ` · ${row.type_promo}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 10px', borderTop: '1px solid #f1f1f3', background: '#fcfcfc',
      }}>
        <span style={{ fontSize: 11, color: '#a1a1aa' }}>
          {shown}/{products.length} · <kbd style={{
            padding: '1px 4px', borderRadius: 4, border: '1px solid #e4e4e7',
            background: '#fff', fontSize: 9.5,
          }}>↑</kbd> <kbd style={{
            padding: '1px 4px', borderRadius: 4, border: '1px solid #e4e4e7',
            background: '#fff', fontSize: 9.5,
          }}>↓</kbd>
        </span>
        <button onClick={onAdd} style={{ ...pcButton.base, ...pcButton.primary, padding: '5px 10px', fontSize: 11.5 }}>
          <Plus size={12} /> Ajouter
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

export function PlanCommercialContentPage() {
  const {
    state, products, images, previewBust,
    refreshState, refreshProducts, refreshImages,
    patchProduct, bumpPreview,
    slideIdx: rawSlideIdx, setSlideIdx,
    contentView, setContentView,
  } = usePlanCommercial();

  // Clamp in case products shrank while we were on another page.
  const slideIdx = Math.min(rawSlideIdx, Math.max(0, products.length - 1));

  const [promoIdx, setPromoIdx] = useState(0);
  const [promoCount, setPromoCount] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // ── Snapshots panel (safety net) ──
  const [snapsOpen, setSnapsOpen] = useState(false);
  const [snaps, setSnaps] = useState<api.Snapshot[]>([]);
  async function refreshSnaps() {
    try { setSnaps(await api.listSnapshots()); } catch { setSnaps([]); }
  }
  useEffect(() => { if (snapsOpen) refreshSnaps(); }, [snapsOpen]);
  async function handleRestoreSnapshot(id: number) {
    if (!confirm('Restaurer cette sauvegarde ? La session actuelle sera remplacée.')) return;
    try {
      const r = await api.restoreSnapshot(id);
      await refreshProducts(); await refreshState();
      setSlideIdx(0); bumpPreview();
      setToast({ message: `${r.restored} produits restaurés`, type: 'success' });
      setSnapsOpen(false);
    } catch (e: any) {
      setToast({ message: e?.response?.data?.detail ?? 'Échec de la restauration', type: 'error' });
    }
  }

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

  // ── Keyboard: ↑/↓ move through products in editor view. Ignored while
  // typing in an input so table cells and search stay usable. ──
  useEffect(() => {
    if (contentView !== 'editor') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const el = e.target as HTMLElement;
      if (el.closest('input, select, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      const total = usePlanCommercial.getState().products.length;
      const cur = usePlanCommercial.getState().slideIdx;
      const next = e.key === 'ArrowDown' ? Math.min(total - 1, cur + 1) : Math.max(0, cur - 1);
      setSlideIdx(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contentView, setSlideIdx]);

  // ── Prefetch neighbours: while the user edits slide n, warm the browser
  // + server render cache for n−1 / n+1 so ↑/↓ navigation feels instant. ──
  useEffect(() => {
    if (contentView !== 'editor') return;
    const total = products.length;
    for (const n of [slideIdx - 1, slideIdx + 1]) {
      if (n < 0 || n >= total) continue;
      const img = new Image();
      img.src = api.previewProductUrl(n, previewBust, 0);
    }
  }, [slideIdx, contentView, products.length, previewBust]);

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

  // Fields that should ALWAYS commit immediately — discrete events
  // (picker click, dropdown select, checkbox toggle) shouldn't wait. The
  // 300ms debounce only makes sense for text typing, otherwise the user
  // picks an image and the preview keeps showing the stale frame because
  // the server hasn't been told yet by the time the preview img refetches.
  // Symptoms: gratuite picker showed packshot until type_promo was toggled
  // — every toggle of type_promo immediate-committed and bumped previewBust,
  // which masked the underlying debounce delay on the picker fields.
  const IMMEDIATE_FIELDS = new Set<string>([
    // image pickers / uploads
    'packshot', 'nom_image', 'logo_groupe',
    // scent slots — picked from the library, so commit on the spot like
    // every other image picker (a debounce here leaves a stale preview)
    'packshot2', 'packshot3', 'packshot4', 'packshot5', 'packshot6',
    'promo_carton_image', 'promo_ribbon_image',
    'promo_remise_image', 'promo_gratuite_image',
    'promo_gratuite_image_2', 'promo_gratuite_image_3', 'promo_gratuite_image_4',
    // toggles & dropdowns
    'is_promo', 'type_promo',
    'promo_gratuite_nom', 'promo_gratuite_nom_2',
    'promo_gratuite_nom_3', 'promo_gratuite_nom_4',
    'promo_carton_left', 'promo_carton_right',
    'promo_ribbon_left', 'promo_ribbon_right',
  ]);

  // ── Patch dispatcher — immediate commit for discrete events,
  //    300ms-debounced commit for text typing (so keystrokes don't flood
  //    the server). Either way, patchProductLocal runs first so the input
  //    UI stays responsive. ──
  const debounceTimers = useRef<Map<string, number>>(new Map());
  const debouncedPatch = useCallback((idx: number, patch: Record<string, any>) => {
    // Apply local change immediately so the input stays responsive
    usePlanCommercial.getState().patchProductLocal(idx, patch);

    const isImmediate = Object.keys(patch).some((k) => IMMEDIATE_FIELDS.has(k));
    if (isImmediate) {
      // Cancel any pending debounce on this idx so the immediate write
      // can't be overwritten 300ms later by a stale typed value.
      for (const [key, handle] of debounceTimers.current.entries()) {
        if (key.startsWith(`${idx}:`)) {
          window.clearTimeout(handle);
          debounceTimers.current.delete(key);
        }
      }
      patchProduct(idx, patch);
      return;
    }

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
  // ── PPT image import ──
  const [pptxReport, setPptxReport] = useState<api.PptxImportReport | null>(null);
  const [pptxBusy, setPptxBusy] = useState(false);
  const [pptxPhase, setPptxPhase] = useState<'upload' | 'processing'>('upload');
  const [pptxPct, setPptxPct] = useState(0);
  const [pptxName, setPptxName] = useState('');
  const [pptxProg, setPptxProg] = useState<api.PptxProgress | null>(null);
  async function handleImportPptx(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    setPptxBusy(true);
    setPptxPhase('upload');
    setPptxPct(0);
    setPptxProg(null);
    setPptxName(f.name);
    try {
      const r = await api.importPptx(
        f,
        (pct) => {
          setPptxPct(pct);
          if (pct >= 100) setPptxPhase('processing');
        },
        (p) => { setPptxPhase('processing'); setPptxProg(p); },
      );
      await refreshProducts(); await refreshImages();
      bumpPreview();
      setPptxReport(r);
      setToast({
        message: `PPT importé — ${r.packshots_set} packshots, ${r.gratuites_set ?? 0} gratuites, ${r.logos_set} logos sur ${r.matched}/${r.slides} slides`,
        type: 'success',
      });
    } catch (err: any) {
      setToast({ message: err?.response?.data?.detail ?? 'Erreur import PPT', type: 'error' });
    } finally {
      setPptxBusy(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const r = await api.importExcel(f);
      await refreshProducts(); await refreshState();
      setSlideIdx(0); bumpPreview();
      setToast({
        message: r.enriched
          ? `${r.loaded} produits chargés (${r.kind}) — ${r.enriched} enrichis depuis la mémoire (packshots, promos…)`
          : `${r.loaded} produits chargés (${r.kind})`,
        type: 'success',
      });
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

  // ── View toggle (Éditeur / Tableau) ──
  const viewToggle = (
    <div style={{
      display: 'inline-flex', padding: 3, gap: 2, borderRadius: 10,
      background: '#f4f4f5', border: '1px solid #e9e9eb',
    }}>
      {([
        { key: 'editor' as const, label: 'Éditeur', icon: <Edit3 size={13} /> },
        { key: 'grid' as const,   label: 'Planche', icon: <LayoutGrid size={13} /> },
        { key: 'table' as const,  label: 'Tableau', icon: <Table2 size={13} /> },
      ]).map((v) => {
        const active = contentView === v.key;
        return (
          <button
            key={v.key}
            onClick={() => setContentView(v.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              fontFamily: 'Inter, sans-serif', cursor: 'pointer',
              border: 'none', transition: 'all 140ms',
              background: active ? PC_GRADIENT : 'transparent',
              color: active ? '#fff' : '#71717a',
              boxShadow: active ? `0 3px 10px ${PC_ACCENT}40` : 'none',
            }}
          >
            {v.icon} {v.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <PageShell
      title="Contenu"
      subtitle="Choisissez un produit à gauche, modifiez-le dans l'éditeur — ou passez en mode Tableau pour l'édition en masse."
      actions={
        <>
          {viewToggle}
          <a href={api.downloadTemplateUrl} download style={{ ...pcButton.base, ...pcButton.secondary }}>
            <FileSpreadsheet size={13} /> Template
          </a>
          <a href={api.exportXlsxUrl} download style={{ ...pcButton.base, ...pcButton.secondary }}>
            <Download size={13} /> Export
          </a>
          <a href={api.priceListUrl} download style={{ ...pcButton.base, ...pcButton.secondary }}
             title="Liste de prix de TOUS les produits, tous projets — dédupliquée par Item Code, prix Détail et Gros les plus récents (produits supprimés exclus)">
            <FileSpreadsheet size={13} /> Liste de prix
          </a>
          <label style={{ ...pcButton.base, ...pcButton.secondary }}>
            <Upload size={13} /> Importer Excel
            <input type="file" accept=".xlsx" onChange={handleImport} style={{ display: 'none' }} />
          </label>
          <label
            style={{ ...pcButton.base, ...pcButton.secondary, opacity: pptxBusy ? 0.6 : 1 }}
            title="Importer les packshots (position + taille), logos et images depuis un PowerPoint, associés aux produits par nom"
          >
            <Presentation size={13} /> {pptxBusy ? 'Import PPT…' : 'Importer PPT'}
            <input type="file" accept=".pptx" disabled={pptxBusy}
                   onChange={handleImportPptx} style={{ display: 'none' }} />
          </label>
          <button onClick={handleAddProduct} style={{ ...pcButton.base, ...pcButton.primary }}>
            <Plus size={13} /> Ajouter
          </button>
          <button onClick={handleClearAll} style={{ ...pcButton.base, ...pcButton.danger }}>
            <Trash2 size={13} /> Effacer
          </button>
          <button
            onClick={() => setSnapsOpen((v) => !v)}
            title="Sauvegardes automatiques (avant chaque import / effacement)"
            style={{
              ...pcButton.base,
              ...(snapsOpen ? pcButton.primary : pcButton.secondary),
            }}
          >
            <History size={13} /> Historique
          </button>
        </>
      }
    >
      {/* ── Snapshots panel ── */}
      {snapsOpen && (
        <div style={{
          marginBottom: 14, padding: 12, background: '#ffffff',
          border: '1px solid #ececee', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f3f46' }}>
              Sauvegardes ({snaps.length}) — créées automatiquement avant chaque import ou effacement
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={async () => {
                  const s = await api.createSnapshot('Sauvegarde manuelle');
                  if (s) { setToast({ message: 'Sauvegarde créée', type: 'success' }); refreshSnaps(); }
                  else setToast({ message: 'Rien à sauvegarder (session vide)', type: 'error' });
                }}
                style={{ ...pcButton.base, ...pcButton.secondary, padding: '4px 10px', fontSize: 11.5 }}
              >
                <Plus size={12} /> Sauvegarder maintenant
              </button>
              <button
                onClick={() => setSnapsOpen(false)}
                style={{ ...pcButton.base, ...pcButton.ghost, padding: '4px 8px' }}
              >
                <X size={13} />
              </button>
            </div>
          </div>
          {snaps.length === 0 ? (
            <div style={{ fontSize: 12, color: '#a1a1aa', padding: '8px 0' }}>
              Aucune sauvegarde pour l'instant. Elles apparaîtront après votre premier import.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 240, overflowY: 'auto' }}>
              {snaps.map((s) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 10px', borderRadius: 8, background: '#fafafa',
                  border: '1px solid #f1f1f3', fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: '#3f3f46', flex: 1 }}>{s.label}</span>
                  <span style={{ color: '#a1a1aa' }}>{s.products} produits</span>
                  <span style={{ color: '#a1a1aa', fontSize: 11 }}>{s.created_at} UTC</span>
                  <button
                    onClick={() => handleRestoreSnapshot(s.id)}
                    style={{ ...pcButton.base, ...pcButton.secondary, padding: '3px 9px', fontSize: 11 }}
                  >
                    <RotateCcw size={11} /> Restaurer
                  </button>
                  <button
                    onClick={async () => { await api.deleteSnapshot(s.id); refreshSnaps(); }}
                    title="Supprimer cette sauvegarde"
                    style={{ ...pcButton.base, ...pcButton.ghost, padding: '3px 6px', fontSize: 11 }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PPT import progress overlay ── */}
      {pptxBusy && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(24,24,27,0.45)', backdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <style>{`
            @keyframes pcIndet { 0% { left: -40%; } 100% { left: 100%; } }
            @keyframes pcSpin { to { transform: rotate(360deg); } }
          `}</style>
          <div style={{
            width: 380, maxWidth: '90vw', background: '#fff', borderRadius: 14,
            padding: '22px 24px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{
                width: 16, height: 16, borderRadius: '50%',
                border: '2px solid #f97316', borderTopColor: 'transparent',
                display: 'inline-block', animation: 'pcSpin 0.7s linear infinite',
              }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#27272a' }}>
                {pptxPhase === 'upload' ? 'Téléversement du PPT…' : 'Analyse du PPT…'}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: '#a1a1aa', marginBottom: 12, marginLeft: 26 }}>
              {pptxName}
            </div>

            {/* Bar: real % during upload; real slide-progress once the server
                starts streaming; indeterminate only in the brief gap between. */}
            {(() => {
              const analysing = pptxPhase === 'processing';
              const haveSlides = analysing && pptxProg && pptxProg.total > 0;
              const pct = pptxPhase === 'upload'
                ? pptxPct
                : haveSlides ? Math.round((pptxProg!.slide / pptxProg!.total) * 100) : 0;
              return (
                <>
                  <div style={{
                    position: 'relative', height: 8, borderRadius: 6,
                    background: '#f4f4f5', overflow: 'hidden',
                  }}>
                    {(pptxPhase === 'upload' || haveSlides) ? (
                      <div style={{
                        height: '100%', width: `${pct}%`, borderRadius: 6,
                        background: '#f97316', transition: 'width 0.15s ease',
                      }} />
                    ) : (
                      <div style={{
                        position: 'absolute', top: 0, height: '100%', width: '40%',
                        borderRadius: 6, background: '#f97316',
                        animation: 'pcIndet 1.1s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#71717a', marginTop: 8 }}>
                    {pptxPhase === 'upload' && `${pptxPct}% envoyé`}
                    {analysing && haveSlides && (
                      <>Slide {pptxProg!.slide}/{pptxProg!.total} ({pct}%) — {pptxProg!.matched} produits, {pptxProg!.packshots} packshots, {pptxProg!.saved} images</>
                    )}
                    {analysing && !haveSlides && 'Lecture du fichier PowerPoint…'}
                  </div>
                  {analysing && haveSlides && pptxProg!.title && (
                    <div style={{
                      fontSize: 11, color: '#a1a1aa', marginTop: 3,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {pptxProg!.title}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── PPT import report ── */}
      {pptxReport && (
        <div style={{
          marginBottom: 14, padding: 12, background: '#ffffff',
          border: '1px solid #ececee', borderRadius: 12,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
          }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#3f3f46' }}>
              Import PPT — {pptxReport.matched}/{pptxReport.slides} slides associées ·
              {' '}{pptxReport.packshots_set} packshots · {pptxReport.gratuites_set ?? 0} gratuites ·
              {' '}{pptxReport.logos_set} logos · {pptxReport.saved_images} images
            </span>
            <button onClick={() => setPptxReport(null)}
                    style={{ ...pcButton.base, ...pcButton.ghost, padding: '4px 8px' }}>
              <X size={13} />
            </button>
          </div>
          {pptxReport.unmatched.length > 0 && (
            <div style={{ fontSize: 12, color: '#7c2d12', marginBottom: 6 }}>
              <b>{pptxReport.unmatched.length} slide(s) sans produit correspondant</b>
              {' '}(leurs images sont dans la bibliothèque, à placer manuellement) :
              <div style={{ color: '#a1a1aa', marginTop: 3 }}>
                {pptxReport.unmatched.slice(0, 12).join(' · ')}
                {pptxReport.unmatched.length > 12 ? ` … +${pptxReport.unmatched.length - 12}` : ''}
              </div>
            </div>
          )}
          {pptxReport.extras.length > 0 && (
            <div style={{ fontSize: 12, color: '#71717a' }}>
              <b>{pptxReport.extras.reduce((n, e) => n + e.files.length, 0)} image(s) supplémentaire(s)</b>
              {' '}non placées automatiquement (sauvegardées sous <code>imported/</code> dans la bibliothèque).
            </div>
          )}
          {pptxReport.unmatched.length === 0 && pptxReport.extras.length === 0 && (
            <div style={{ fontSize: 12, color: '#16a34a' }}>
              Toutes les slides ont été associées, aucune image en attente.
            </div>
          )}
        </div>
      )}

      {contentView === 'table' ? (
        /* ── Bulk table view ─────────────────────────────────────────── */
        <SectionCard
          icon={<Table2 size={16} />}
          accent={PC_ACCENT}
          title="Produits"
          subtitle={`${products.length} ligne(s) — modifiez directement dans les cellules ; le bouton ↗ ouvre la ligne dans l'éditeur visuel.`}
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
            onRowClick={(id) => {
              setSlideIdx(Number(id));
              setContentView('editor');
            }}
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
      ) : contentView === 'grid' ? (
        /* ── Planche contact: every slide as a thumbnail ─────────────── */
        <SectionCard
          icon={<LayoutGrid size={16} />}
          accent={PC_ACCENT}
          title="Planche contact"
          subtitle={`${products.length} slide(s) — cliquez sur une vignette pour l'ouvrir dans l'éditeur.`}
        >
          {products.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#a1a1aa', fontSize: 13 }}>
              Aucun produit à afficher.
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}>
              {products.map((row: any, idx: number) => (
                <button
                  key={idx}
                  onClick={() => { setSlideIdx(idx); setContentView('editor'); }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 0,
                    padding: 0, borderRadius: 10, overflow: 'hidden',
                    cursor: 'pointer', textAlign: 'left', background: '#fff',
                    border: idx === slideIdx ? `2px solid ${PC_ACCENT}` : '1px solid #ececee',
                    boxShadow: idx === slideIdx
                      ? `0 4px 14px ${PC_ACCENT}30` : '0 1px 3px rgba(0,0,0,0.05)',
                    transition: 'box-shadow 140ms, transform 140ms',
                  }}
                >
                  <div style={{ aspectRatio: '16 / 9', background: '#f8f8f8', width: '100%' }}>
                    <img
                      src={api.previewProductUrl(idx, previewBust, 0, 320)}
                      alt=""
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
                    />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 10px', borderTop: '1px solid #f1f1f3', width: '100%',
                  }}>
                    <span style={{ fontSize: 10.5, color: '#a1a1aa', flexShrink: 0 }}>#{idx + 1}</span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: '#3f3f46', minWidth: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
                    }}>
                      {(row.nom || '').trim() || '(sans nom)'}
                    </span>
                    {row.is_promo && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', flexShrink: 0,
                        borderRadius: 999, background: '#fef2f2', color: '#b91c1c',
                        border: '1px solid #fecaca',
                      }}>
                        PROMO
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      ) : (
        /* ── Master-detail editor view ───────────────────────────────── */
        <div style={{
          display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr)',
          gap: 14, alignItems: 'start',
        }}>
          <ProductRail
            products={products}
            slideIdx={slideIdx}
            onSelect={setSlideIdx}
            onAdd={handleAddProduct}
            previewBust={previewBust}
          />

          <div style={{ minWidth: 0 }}>
            {/* Current-slide header strip */}
            {currentRow && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                padding: '8px 12px', background: '#ffffff',
                border: '1px solid #ececee', borderRadius: 12,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setSlideIdx(Math.max(0, slideIdx - 1))}
                    disabled={slideIdx === 0}
                    title="Produit précédent (↑)"
                    style={{
                      ...pcButton.base, ...pcButton.secondary, padding: '4px 8px',
                      opacity: slideIdx === 0 ? 0.4 : 1,
                    }}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => setSlideIdx(Math.min(products.length - 1, slideIdx + 1))}
                    disabled={slideIdx >= products.length - 1}
                    title="Produit suivant (↓)"
                    style={{
                      ...pcButton.base, ...pcButton.secondary, padding: '4px 8px',
                      opacity: slideIdx >= products.length - 1 ? 0.4 : 1,
                    }}
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 13.5, fontWeight: 700, color: '#27272a',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {(currentRow.nom || '').trim() || '(sans nom)'}
                  </div>
                  <div style={{ fontSize: 11, color: '#a1a1aa' }}>
                    Slide {slideIdx + 1} / {products.length}
                    {brand ? ` · ${brand}` : ''}
                  </div>
                </div>
                {currentRow.is_promo && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 999, letterSpacing: 0.5,
                    background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca',
                  }}>
                    PROMO{currentRow.type_promo ? ` · ${currentRow.type_promo}` : ''}
                  </span>
                )}
              </div>
            )}

            {/* Multi-promo sub-slide chips */}
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
                canal={state?.canal}
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
                onUploadPackshot2={async (file) => {
                  const target = currentRow.packshot2 || file.name;
                  const newName = /\.(png|jpe?g|webp)$/i.test(target) ? target : `${target}.png`;
                  const renamed = new File([file], newName, { type: file.type });
                  await api.uploadImages([renamed], brand, 'packshot');
                  await patchProduct(slideIdx, { packshot2: newName });
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
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </PageShell>
  );
}
