import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ImageOff, Search, Upload, X } from 'lucide-react';
import { ImagePicker, type ImageAsset } from '../../molecules/ImagePicker/ImagePicker';
import {
  PACKSHOT_STATUS_OPTIONS, type BrandRow,
} from '../BrandWorkflow/BrandWorkflow';

export interface MissingPackshotsModalProps {
  open: boolean;
  rows: BrandRow[];
  images: ImageAsset[];
  resolveImageUrl: (filename: string) => string;
  onClose: () => void;
  /** Pick an existing image from the library and assign as packshot. */
  onPickSkuPackshot: (skuIndex: number, filename: string) => void;
  /** Upload a NEW file and assign as packshot for this SKU. */
  onUploadSkuPackshot: (skuIndex: number, brand: string, file: File) => void;
  /** Categorise a row — fires when the user picks a value from the
   *  per-card dropdown. `status` is one of the machine codes from
   *  `PACKSHOT_STATUS_OPTIONS` (or '' for the placeholder). Optional —
   *  when omitted, the dropdown is hidden on every card. */
  onCategorize?: (skuIndex: number, status: string) => void;
  /** Optional: download URL for an Excel list of these SKUs. When provided
   *  a "Télécharger Excel" button appears in the modal header. */
  exportXlsxUrl?: string;
  accent?: string;
}

/** Modal that lists every SKU still missing a packshot, grouped by brand,
 *  with a per-card "pick from library OR upload" affordance. Same UX as
 *  the per-card flow on the Marques page — just scoped to whatever rows
 *  the caller passes in (typically pre-filtered to those with no packshot).
 */
export function MissingPackshotsModal({
  open, rows, images, resolveImageUrl, onClose,
  onPickSkuPackshot, onUploadSkuPackshot, onCategorize,
  exportXlsxUrl,
  accent = '#dc2626',
}: MissingPackshotsModalProps) {
  // Which SKU's per-card picker is open. null = grid view only.
  const [pickerSkuIdx, setPickerSkuIdx] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  // Pick the brand for a row the same way BrandWorkflow does — prefer
  // `sous_groupe` when at least one row in the dataset uses it, else
  // fall back to `groupe`. Keeps the per-SKU upload's brand subfolder
  // consistent with the rest of the app.
  const brandField: 'groupe' | 'sous_groupe' = useMemo(
    () => rows.some((r) => (r.sous_groupe || '').trim()) ? 'sous_groupe' : 'groupe',
    [rows],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.nom.toLowerCase().includes(s)
      || r.groupe.toLowerCase().includes(s)
      || r.sous_groupe.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const groupedByBrand = useMemo(() => {
    const m = new Map<string, BrandRow[]>();
    for (const r of filtered) {
      const b = (r[brandField] || '(sans marque)').trim() || '(sans marque)';
      const arr = m.get(b);
      if (arr) arr.push(r); else m.set(b, [r]);
    }
    // Sort by largest group first so the most actionable brands surface.
    return Array.from(m.entries()).sort(([, a], [, b]) => b.length - a.length);
  }, [filtered, brandField]);

  const activeRow = pickerSkuIdx !== null
    ? rows.find((r) => r.index === pickerSkuIdx) ?? null
    : null;
  const activeBrand = activeRow
    ? ((activeRow[brandField] || '').trim() || '(sans marque)')
    : '';

  if (!open) return null;
  if (typeof document === 'undefined') return null; // SSR safety

  // Portaled to document.body so the modal escapes the app shell's
  // `transform`/`filter` containing block — without this, the overlay only
  // covers the main content area (sidebar + topbar bleed through, see the
  // ImagesPage screenshot bug) instead of the whole viewport.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 8900,
        background: 'rgba(15, 15, 18, 0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1100px, 100%)', maxHeight: '88vh',
          background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 14,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.22)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #f4f4f5', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ImageOff size={18} style={{ color: accent }} />
            <div>
              <div style={{ color: '#18181b', fontWeight: 700, fontSize: 14 }}>
                SKUs sans packshot
              </div>
              <div style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {rows.length} SKU(s) à compléter — cliquez sur une carte pour choisir une image.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {exportXlsxUrl && rows.length > 0 && (
              <a
                href={exportXlsxUrl}
                download
                title={`Télécharger la liste des ${rows.length} SKU(s) sans packshot au format Excel`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 11px', borderRadius: 8,
                  background: accent, color: '#ffffff',
                  fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
                  border: 'none',
                }}
              >
                <Download size={13} /> Télécharger Excel
              </a>
            )}
            <button
              onClick={onClose}
              aria-label="Fermer"
              style={{
                background: 'transparent', border: 'none', color: '#71717a',
                cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 6,
              }}
            ><X size={18} /></button>
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: 14, borderBottom: '1px solid #f4f4f5' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{
              position: 'absolute', left: 11, top: '50%',
              transform: 'translateY(-50%)', color: '#a1a1aa',
            }} />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un SKU ou une marque…"
              style={{
                width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
                border: '1px solid #e4e4e7', background: '#fafafa', color: '#18181b',
                fontSize: 13, outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Body — grouped grid */}
        <div style={{ overflowY: 'auto', padding: '14px 18px 18px' }}>
          {filtered.length === 0 ? (
            <div style={{
              color: '#16a34a', textAlign: 'center', padding: 48, fontSize: 14,
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10,
            }}>
              ✓ Tous les SKUs ont un packshot.
            </div>
          ) : groupedByBrand.map(([brand, brandRows]) => (
            <div key={brand} style={{ marginBottom: 22 }}>
              <div style={{
                color: '#3f3f46', fontSize: 12, fontWeight: 700, marginBottom: 8,
                letterSpacing: 0.4, textTransform: 'uppercase',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                {brand}
                <span style={{
                  background: '#f4f4f5', color: '#71717a', padding: '2px 8px',
                  borderRadius: 999, fontSize: 10.5, letterSpacing: 0,
                  textTransform: 'none', fontWeight: 600,
                }}>
                  {brandRows.length}
                </span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10,
              }}>
                {brandRows.map((r) => (
                  <MissingCard
                    key={r.index} row={r} brand={brand} accent={accent}
                    onClick={() => setPickerSkuIdx(r.index)}
                    onDropFile={(file) => onUploadSkuPackshot(r.index, brand, file)}
                    onCategorize={onCategorize
                      ? (status) => onCategorize(r.index, status)
                      : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-SKU picker — opened on top of the modal */}
      <ImagePicker
        open={pickerSkuIdx !== null}
        title={activeRow
          ? `Choisir une image — ${activeRow.nom || activeBrand}`
          : 'Choisir une image'}
        emptyHint={`Aucune image enregistrée. Téléversez-en une avec le bouton ci-dessus.`}
        assets={activeBrand ? [
          ...images.filter((a) => (a.brand || '').toUpperCase() === activeBrand.toUpperCase()),
          ...images.filter((a) => (a.brand || '').toUpperCase() !== activeBrand.toUpperCase()),
        ] : images}
        resolveUrl={resolveImageUrl}
        initialSearch={activeBrand}
        onPick={(filename) => {
          if (pickerSkuIdx !== null) onPickSkuPackshot(pickerSkuIdx, filename);
        }}
        onUpload={(file) => {
          if (pickerSkuIdx !== null) onUploadSkuPackshot(pickerSkuIdx, activeBrand, file);
        }}
        uploadAccent={accent}
        onClose={() => setPickerSkuIdx(null)}
      />
    </div>,
    document.body,
  );
}

function MissingCard({
  row, brand, accent, onClick, onDropFile, onCategorize,
}: {
  row: BrandRow;
  brand: string;
  accent: string;
  onClick: () => void;
  onDropFile: (file: File) => void;
  /** Optional — when omitted, the category dropdown is hidden. */
  onCategorize?: (status: string) => void;
}) {
  const [hover, setHover] = useState(false);
  const currentStatus = row.packshot_status || '';
  // Tint the card's left border by status so a glance shows the bulk
  // state of the brand group at a distance.
  const statusBorder = currentStatus === 'discontinued' ? '#dc2626'   // red
    : currentStatus === 'in_progress' ? '#2563eb'                     // blue
    : currentStatus === 'other'       ? '#9333ea'                     // purple
    : 'transparent';

  return (
    <div
      style={{
        textAlign: 'left',
        border: `1px ${hover ? 'dashed' : 'solid'} ${hover ? accent : '#e4e4e7'}`,
        borderLeft: statusBorder !== 'transparent'
          ? `3px solid ${statusBorder}`
          : `1px ${hover ? 'dashed' : 'solid'} ${hover ? accent : '#e4e4e7'}`,
        borderRadius: 10,
        background: hover ? `${accent}0a` : '#ffffff',
        padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        transition: 'all 140ms',
      }}
    >
      {/* The drop / click area only — kept separate from the dropdown so
          clicking the <select> doesn't fire onClick (which opens the
          picker modal). */}
      <button
        type="button"
        onClick={onClick}
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault(); setHover(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onDropFile(f);
        }}
        title={`Choisir une image pour ${row.nom}`}
        style={{
          all: 'unset',
          height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fafafa', borderRadius: 6, overflow: 'hidden',
          border: '1px dashed #e4e4e7',
          color: '#a1a1aa', fontSize: 11, gap: 6, flexDirection: 'column',
          cursor: 'pointer',
        }}
      >
        <Upload size={16} />
        Cliquez ou glissez
      </button>

      <div style={{
        color: '#18181b', fontSize: 12, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {row.nom || '(sans nom)'}{row.is_promo ? ' 🔥' : ''}
      </div>
      <div style={{ color: '#71717a', fontSize: 10.5 }}>
        {brand} · PG: {row.prix_gros}
      </div>

      {onCategorize && (
        <select
          value={currentStatus}
          onChange={(e) => onCategorize(e.target.value)}
          // Don't let mouseup/click on the native picker bubble up to the
          // card — without this, picking an option also opens the image
          // picker modal in some browsers.
          onClick={(e) => e.stopPropagation()}
          title="Catégoriser ce SKU"
          style={{
            marginTop: 2,
            padding: '5px 8px', fontSize: 11.5,
            border: `1px solid ${statusBorder !== 'transparent' ? statusBorder : '#e4e4e7'}`,
            borderRadius: 6,
            background: '#ffffff',
            color: currentStatus ? '#18181b' : '#71717a',
            cursor: 'pointer', width: '100%',
            outline: 'none',
          }}
        >
          {PACKSHOT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
