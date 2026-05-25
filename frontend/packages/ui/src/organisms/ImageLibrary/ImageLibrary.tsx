import { useMemo, useState } from 'react';
import { Search, Trash2, Upload } from 'lucide-react';
import type { ImageAsset } from '../../molecules/ImagePicker';

export interface ImageLibraryProps {
  assets: ImageAsset[];
  resolveUrl: (filename: string) => string;
  onUpload: (files: File[]) => void;
  onUpdateMeta: (filename: string, brand: string, type: string) => void;
  onDelete: (filename: string) => void;
  /** Brand accent for hover/highlight states. */
  accent?: string;
}

const TYPES = ['packshot', 'logo', 'badge', 'other'] as const;

export function ImageLibrary({
  assets, resolveUrl, onUpload, onUpdateMeta, onDelete,
  accent = '#6366f1',
}: ImageLibraryProps) {
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [type, setType] = useState('');

  const brandOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of assets) {
      const b = a.brand || '?';
      counts[b] = (counts[b] || 0) + 1;
    }
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  }, [assets]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (brand && (a.brand || '?') !== brand) return false;
      if (type && a.type !== type) return false;
      if (s && !a.filename.toLowerCase().includes(s) &&
          !(a.brand || '').toLowerCase().includes(s)) return false;
      return true;
    });
  }, [assets, search, brand, type]);

  const totalKb = assets.reduce((sum, a) => sum + ((a.size || 0) / 1024), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <UploadStrip onUpload={onUpload} accent={accent} />

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 220px 180px', gap: 10,
        alignItems: 'center',
      }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 11, top: '50%',
            transform: 'translateY(-50%)', color: '#a1a1aa',
          }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={`Rechercher parmi ${assets.length} images…`}
            style={{
              width: '100%', padding: '9px 12px 9px 34px',
              borderRadius: 8, border: '1px solid #e4e4e7',
              background: '#fafafa', color: '#18181b', fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <select value={brand} onChange={(e) => setBrand(e.target.value)} style={selectStyle}>
          <option value="">Toutes les marques</option>
          {brandOptions.map(([b, n]) => (
            <option key={b} value={b}>{b} ({n})</option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} style={selectStyle}>
          <option value="">Tous les types</option>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div style={{ color: '#71717a', fontSize: 11.5 }}>
        {filtered.length} / {assets.length} images — {totalKb.toFixed(0)} KB total
      </div>

      {filtered.length === 0 ? (
        <div style={{
          color: '#71717a', textAlign: 'center', padding: 40,
          background: '#fafafa', borderRadius: 10, border: '1px dashed #e4e4e7',
        }}>
          Aucune image ne correspond à ce filtre.
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12,
        }}>
          {filtered.map((a) => (
            <AssetCard
              key={a.filename}
              asset={a}
              src={resolveUrl(a.filename)}
              accent={accent}
              onUpdateMeta={onUpdateMeta}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UploadStrip({ onUpload, accent }: { onUpload: (files: File[]) => void; accent: string }) {
  const [hover, setHover] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault(); setHover(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onUpload(files);
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: 22, borderRadius: 12,
        border: `1.5px dashed ${hover ? accent : '#d4d4d8'}`,
        background: hover
          ? `radial-gradient(ellipse at center, ${accent}14, transparent 70%), #ffffff`
          : '#fafafa',
        color: hover ? accent : '#52525b',
        fontSize: 13, fontWeight: 500, cursor: 'pointer',
        transition: 'all 160ms',
        boxShadow: hover ? `0 0 0 4px ${accent}1a` : 'none',
      }}
    >
      <Upload size={16} />
      <span>Glissez autant d'images que vous voulez (ou cliquez)</span>
      <input
        type="file" accept="image/*" multiple
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) onUpload(files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />
    </label>
  );
}

function AssetCard({
  asset, src, accent, onUpdateMeta, onDelete,
}: {
  asset: ImageAsset; src: string; accent: string;
  onUpdateMeta: (filename: string, brand: string, type: string) => void;
  onDelete: (filename: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [brand, setBrand] = useState(asset.brand);
  const [type, setType] = useState(asset.type);

  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 8,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', borderRadius: 6, overflow: 'hidden',
        border: '1px solid #f4f4f5',
      }}>
        <img src={src} alt={asset.filename}
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{
        color: '#18181b', fontSize: 11.5, fontWeight: 600,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {asset.filename}
      </div>
      <div style={{ color: '#71717a', fontSize: 10.5 }}>
        {asset.brand || '?'} · {asset.type}
        {asset.used_in ? <> · utilisé dans <b style={{ color: accent }}>{asset.used_in}</b></> : null}
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <input value={brand} onChange={(e) => setBrand(e.target.value)}
            placeholder="Marque" style={smallInput} />
          <select value={type} onChange={(e) => setType(e.target.value)} style={smallInput}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4 }}>
            <button style={{
              ...miniBtn, background: accent, color: '#fff',
              border: 'none', flex: 1,
            }}
              onClick={() => { onUpdateMeta(asset.filename, brand, type); setEditing(false); }}>
              OK
            </button>
            <button style={{ ...miniBtn, flex: 1 }}
              onClick={() => { setBrand(asset.brand); setType(asset.type); setEditing(false); }}>
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setEditing(true)} style={{ ...miniBtn, flex: 1 }}>Modifier</button>
          <button
            onClick={() => onDelete(asset.filename)}
            style={{ ...miniBtn, background: '#fef2f2', color: '#b91c1c', borderColor: '#fecaca' }}
            aria-label="Supprimer"
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid #e4e4e7',
  background: '#ffffff', color: '#18181b', fontSize: 13,
  outline: 'none', cursor: 'pointer',
};
const smallInput: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: '1px solid #e4e4e7',
  background: '#ffffff', color: '#18181b', fontSize: 11.5, outline: 'none',
};
const miniBtn: React.CSSProperties = {
  padding: '6px 9px', border: '1px solid #e4e4e7', background: '#ffffff',
  color: '#27272a', borderRadius: 6, fontSize: 11.5, cursor: 'pointer',
  fontWeight: 500,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
};
