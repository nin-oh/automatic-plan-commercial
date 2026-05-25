import { useMemo, useState } from 'react';
import { Upload } from 'lucide-react';

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
}

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
  /** Brand accent color */
  accent?: string;
}

export function BrandWorkflow({
  rows, resolveImageUrl, onUploadBrandLogo, onBulkPackshots,
  accent = '#6366f1',
}: BrandWorkflowProps) {
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
              <div style={{
                height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: '#fafafa', borderRadius: 6, overflow: 'hidden',
                border: '1px solid #f4f4f5',
              }}>
                {r.packshot
                  ? <img src={resolveImageUrl(r.packshot)} alt={r.nom}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <span style={{ color: '#a1a1aa', fontSize: 11 }}>pas de packshot</span>}
              </div>
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
    </div>
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
