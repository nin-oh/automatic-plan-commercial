import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';
import { ImagePicker, type ImageAsset } from '../../molecules/ImagePicker/ImagePicker';

export interface BrandRow {
  index: number;
  groupe: string;
  sous_groupe: string;
  nom: string;
  packshot: string;
  logo_groupe: string;
  is_promo: boolean;
  prix_gros: number;
  prix_gros_net: number;
  /** Free-text status used by the "SKUs sans packshot" workflow. Empty when
   *  uncategorised. Other places that build BrandRow can leave this
   *  undefined — the dropdown in MissingPackshotsModal treats it as ''. */
  packshot_status?: string;
}

/** Categorisation options for the "no packshot" workflow. Machine values
 *  match those expected by the backend Excel export (api/routes/products.py
 *  `export_missing_packshots`). Adding a new option here + there is all
 *  that's needed — the field is a free-text column so no migration. */
export const PACKSHOT_STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '',             label: 'À catégoriser'      },
  { value: 'discontinued', label: "Produit n'existe plus" },
  { value: 'in_progress',  label: 'Packshot en cours'  },
  { value: 'other',        label: 'Autre'              },
];

export type BulkMode = 'match' | 'create';

export interface BrandWorkflowProps {
  rows: BrandRow[];
  resolveImageUrl: (filename: string) => string;
  onUploadBrandLogo: (brand: string, brandField: 'groupe' | 'sous_groupe', file: File) => void;
  onBulkPackshots: (
    brand: string,
    brandField: 'groupe' | 'sous_groupe',
    files: File[],
    mode: BulkMode,
  ) => void;
  /** Per-SKU packshot upload — fires when the user uploads a NEW file via
   *  the picker's "Téléverser" button or drops a file directly onto a card.
   *  The file is persisted under the brand and assigned as the SKU's
   *  packshot. Optional — when omitted, the upload affordances disappear. */
  onUploadSkuPackshot?: (skuIndex: number, brand: string, file: File) => void;
  /** Per-SKU pick-from-library — fires when the user picks an existing
   *  image from the brand's library inside the picker modal. The handler
   *  just needs to PATCH the SKU's `packshot` field to `filename`. Optional
   *  — when omitted (and `onUploadSkuPackshot` is also omitted), cards are
   *  read-only. When only `onUploadSkuPackshot` is set, clicking a card
   *  opens the file picker directly (old behaviour). */
  onPickSkuPackshot?: (skuIndex: number, filename: string) => void;
  /** Image library used when the picker opens. Filtered to the active
   *  brand inside the component. Pass [] to disable library picking. */
  images?: ImageAsset[];
  /** Brand accent color */
  accent?: string;
}

export function BrandWorkflow({
  rows, resolveImageUrl, onUploadBrandLogo, onBulkPackshots,
  onUploadSkuPackshot, onPickSkuPackshot, images = [],
  accent = '#6366f1',
}: BrandWorkflowProps) {
  // Which SKU's picker is open. `null` = closed. The picker decides whether
  // it can pick from library (onPickSkuPackshot set) and/or upload
  // (onUploadSkuPackshot set) from the bound callbacks below.
  const [pickerSkuIdx, setPickerSkuIdx] = useState<number | null>(null);
  const brandField: 'groupe' | 'sous_groupe' =
    rows.some((r) => (r.sous_groupe || '').trim()) ? 'sous_groupe' : 'groupe';

  const brandCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows) {
      const k = (r[brandField] || '').trim() || '(vide)';
      m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).sort(([, a], [, b]) => b - a);
  }, [rows, brandField]);

  const [brand, setBrand] = useState<string>(brandCounts[0]?.[0] ?? '');
  const [mode, setMode] = useState<BulkMode>('match');

  const brandRows = useMemo(
    () => rows.filter((r) => ((r[brandField] || '').trim() || '(vide)') === brand),
    [rows, brand, brandField],
  );
  const nWithPack = brandRows.filter((r) => !!r.packshot).length;

  if (rows.length === 0) {
    return (
      <div style={{
        color: '#71717a', textAlign: 'center', padding: 40,
        background: '#fafafa', borderRadius: 10, border: '1px dashed #e4e4e7',
      }}>
        Ajoutez ou chargez des produits dans l'onglet <b>Contenu</b> pour les regrouper par marque.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr 1fr 1fr', gap: 10 }}>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
          {brandCounts.map(([b, n]) => (
            <option key={b} value={b}>{b} ({n} SKUs)</option>
          ))}
        </select>
        <Kpi label="Total SKUs" value={brandRows.length} />
        <Kpi label="Avec packshot" value={nWithPack} accent={accent} />
        <Kpi label="Sans packshot" value={brandRows.length - nWithPack}
          accent={brandRows.length - nWithPack > 0 ? '#f59e0b' : undefined} />
      </div>

      <Section title={`Logo de la marque — ${brand}`}>
        <BrandLogoUpload
          brand={brand} brandField={brandField} rows={brandRows}
          resolveImageUrl={resolveImageUrl} onUpload={onUploadBrandLogo}
          accent={accent}
        />
      </Section>

      <Section title="Dépôt en masse de packshots">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div role="radiogroup" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ModeRadio
              checked={mode === 'match'} onChange={() => setMode('match')}
              accent={accent}
              label="Matcher par nom de fichier (associe l'image aux SKUs existants)" />
            <ModeRadio
              checked={mode === 'create'} onChange={() => setMode('create')}
              accent={accent}
              label="Créer une nouvelle slide pour chaque image" />
          </div>
          <BulkDrop
            accent={accent}
            onDrop={(files) => onBulkPackshots(brand, brandField, files, mode)} />
        </div>
      </Section>

      <Section title={`SKUs — ${brand}`}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12,
        }}>
          {brandRows.map((r) => (
            <div key={r.index} style={{
              border: '1px solid #e4e4e7', borderRadius: 10, background: '#ffffff',
              padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
            }}>
              <SkuThumb
                row={r} accent={accent}
                resolveImageUrl={resolveImageUrl}
                editable={!!onPickSkuPackshot || !!onUploadSkuPackshot}
                onOpenPicker={() => setPickerSkuIdx(r.index)}
                onDropFile={onUploadSkuPackshot
                  ? (file) => onUploadSkuPackshot(r.index, brand, file)
                  : undefined}
              />
              <div style={{
                color: '#18181b', fontSize: 12, fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {r.nom || '(sans nom)'}{r.is_promo ? ' 🔥' : ''}
              </div>
              <div style={{ color: '#71717a', fontSize: 10.5 }}>
                {r.groupe} · PG: {r.prix_gros} · Net: {r.prix_gros_net}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <ImagePicker
        open={pickerSkuIdx !== null}
        title={`Choisir une image — ${brand}`}
        emptyHint={`Aucune image enregistrée pour ${brand}. Téléversez-en une ci-dessus.`}
        // Show images tagged with this brand FIRST (case-insensitive match),
        // then everything else — lets the user fall back to a different brand
        // if they've stored an image under the wrong brand. The picker also
        // has a search box for further filtering.
        assets={[
          ...images.filter((a) => (a.brand || '').toUpperCase() === brand.toUpperCase()),
          ...images.filter((a) => (a.brand || '').toUpperCase() !== brand.toUpperCase()),
        ]}
        resolveUrl={resolveImageUrl}
        initialSearch={brand}
        onPick={(filename) => {
          if (pickerSkuIdx !== null && onPickSkuPackshot) {
            onPickSkuPackshot(pickerSkuIdx, filename);
          }
        }}
        onUpload={onUploadSkuPackshot ? (file) => {
          if (pickerSkuIdx !== null) onUploadSkuPackshot(pickerSkuIdx, brand, file);
        } : undefined}
        uploadAccent={accent}
        onClose={() => setPickerSkuIdx(null)}
      />
    </div>
  );
}

function SkuThumb({
  row, resolveImageUrl, editable, onOpenPicker, onDropFile, accent,
}: {
  row: BrandRow;
  resolveImageUrl: (n: string) => string;
  editable: boolean;
  /** Open the library/upload picker modal for this SKU. */
  onOpenPicker: () => void;
  /** When set, dropping a file directly onto the card bypasses the picker
   *  and uploads immediately. Hidden when null (drag-drop disabled). */
  onDropFile?: (file: File) => void;
  accent: string;
}) {
  const [hover, setHover] = useState(false);
  const thumb = row.packshot
    ? <img src={resolveImageUrl(row.packshot)} alt={row.nom}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
    : <span style={{ color: '#a1a1aa', fontSize: 11 }}>
        {editable ? 'Cliquez pour choisir une image' : 'pas de packshot'}
      </span>;

  const box: React.CSSProperties = {
    height: 110, width: '100%', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    background: hover && editable ? `${accent}0a` : '#fafafa',
    borderRadius: 6, overflow: 'hidden',
    border: `1px ${hover && editable ? 'dashed' : 'solid'} ${hover && editable ? accent : '#f4f4f5'}`,
    transition: 'all 140ms',
    cursor: editable ? 'pointer' : 'default',
    padding: 0,
  };

  if (!editable) {
    return <div style={box}>{thumb}</div>;
  }

  return (
    <button
      type="button"
      onClick={onOpenPicker}
      title={`Choisir l'image de ${row.nom}`}
      style={box}
      onDragOver={onDropFile ? (e) => { e.preventDefault(); setHover(true); } : undefined}
      onDragLeave={onDropFile ? () => setHover(false) : undefined}
      onDrop={onDropFile ? (e) => {
        e.preventDefault(); setHover(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onDropFile(f);
      } : undefined}
    >
      {thumb}
    </button>
  );
}

function BrandLogoUpload({
  brand, brandField, rows, resolveImageUrl, onUpload, accent,
}: {
  brand: string; brandField: 'groupe' | 'sous_groupe'; rows: BrandRow[];
  resolveImageUrl: (n: string) => string;
  onUpload: (b: string, f: 'groupe' | 'sous_groupe', file: File) => void;
  accent: string;
}) {
  const currentLogo = rows.find((r) => r.logo_groupe)?.logo_groupe || '';
  const [hover, setHover] = useState(false);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
      <div style={{
        height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', border: '1px solid #e4e4e7', borderRadius: 8,
      }}>
        {currentLogo
          ? <img src={resolveImageUrl(currentLogo)} alt="logo"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ color: '#a1a1aa', fontSize: 11 }}>aucun</span>}
      </div>
      <label
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={(e) => {
          e.preventDefault(); setHover(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onUpload(brand, brandField, f);
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          border: `1.5px dashed ${hover ? accent : '#d4d4d8'}`, borderRadius: 8,
          background: hover ? `${accent}0a` : '#fafafa',
          color: hover ? accent : '#52525b', fontSize: 12.5, cursor: 'pointer',
          transition: 'all 160ms', fontWeight: 500,
        }}>
        <Upload size={14} /> Déposer un logo pour {brand}
        <input type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(brand, brandField, f);
            e.target.value = '';
          }} />
      </label>
    </div>
  );
}

function BulkDrop({ onDrop, accent }: { onDrop: (files: File[]) => void; accent: string }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault(); setHover(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onDrop(files);
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: 28, borderRadius: 12,
        border: `1.5px dashed ${hover ? accent : '#d4d4d8'}`,
        background: hover
          ? `radial-gradient(ellipse at center, ${accent}14, transparent 70%), #ffffff`
          : '#fafafa',
        color: hover ? accent : '#52525b', fontSize: 13, cursor: 'pointer',
        transition: 'all 160ms', fontWeight: 500,
      }}
    >
      <Upload size={16} />
      <span>Glissez les packshots ici (plusieurs à la fois)</span>
      <input type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onDrop(files);
          e.target.value = '';
        }} />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        color: '#3f3f46', fontSize: 13, fontWeight: 700, marginBottom: 10,
        letterSpacing: -0.1,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number | string; accent?: string }) {
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 12,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 4,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        color: '#71717a', fontSize: 10.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>{label}</div>
      <div style={{
        color: accent || '#18181b', fontSize: 22, fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
      }}>{value}</div>
    </div>
  );
}

function ModeRadio({ checked, onChange, label, accent }: {
  checked: boolean; onChange: () => void; label: string; accent: string;
}) {
  return (
    <label style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 12px',
      border: `1px solid ${checked ? accent : '#e4e4e7'}`,
      borderRadius: 8, fontSize: 12.5, color: '#27272a', cursor: 'pointer',
      background: checked ? `${accent}10` : '#ffffff',
      transition: 'all 140ms',
      fontWeight: 500,
    }}>
      <input type="radio" checked={checked} onChange={onChange}
        style={{ margin: 0, accentColor: accent }} />
      {label}
    </label>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid #e4e4e7',
  background: '#ffffff', color: '#18181b', fontSize: 13,
  outline: 'none', cursor: 'pointer',
};
