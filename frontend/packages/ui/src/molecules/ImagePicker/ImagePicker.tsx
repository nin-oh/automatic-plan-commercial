import { useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';

export interface ImageAsset {
  filename: string;
  brand: string;
  type: string;
  added?: string;
  size?: number;
  used_in?: number;
}

export interface ImagePickerProps {
  open: boolean;
  title?: string;
  emptyHint?: string;
  assets: ImageAsset[];
  resolveUrl: (filename: string) => string;
  onPick: (filename: string) => void;
  onClose: () => void;
  initialSearch?: string;
}

/** Light-surface modal for picking an asset filename from a filtered grid. */
export function ImagePicker({
  open, title = 'Bibliothèque', emptyHint = 'Aucune image',
  assets, resolveUrl, onPick, onClose, initialSearch = '',
}: ImagePickerProps) {
  const [search, setSearch] = useState(initialSearch);
  useEffect(() => { if (open) setSearch(initialSearch); }, [open, initialSearch]);

  if (!open) return null;
  const s = search.trim().toLowerCase();
  const filtered = !s ? assets : assets.filter(
    (a) => a.filename.toLowerCase().includes(s) || (a.brand || '').toLowerCase().includes(s),
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(15, 15, 18, 0.5)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 100%)', maxHeight: '80vh',
          background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 14,
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.18)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid #f4f4f5',
        }}>
          <div style={{ color: '#18181b', fontWeight: 700, fontSize: 14 }}>{title}</div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            style={{
              background: 'transparent', border: 'none', color: '#71717a',
              cursor: 'pointer', display: 'flex', padding: 6,
              borderRadius: 6,
            }}
          ><X size={16} /></button>
        </div>

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
              placeholder="Rechercher par nom ou marque…"
              style={{
                width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8,
                border: '1px solid #e4e4e7', background: '#fafafa', color: '#18181b',
                fontSize: 13, outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: 14 }}>
          {filtered.length === 0 ? (
            <div style={{ color: '#a1a1aa', textAlign: 'center', padding: 32, fontSize: 13 }}>
              {emptyHint}
            </div>
          ) : (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10,
            }}>
              {filtered.slice(0, 60).map((a) => (
                <button
                  key={a.filename}
                  onClick={() => { onPick(a.filename); onClose(); }}
                  style={{
                    border: '1px solid #e4e4e7', borderRadius: 10,
                    background: '#ffffff', padding: 8, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', gap: 6,
                    transition: 'border-color 120ms, transform 120ms, box-shadow 120ms',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#f97316';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.12)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e4e4e7';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{
                    height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: '#fafafa', borderRadius: 6, overflow: 'hidden',
                  }}>
                    <img
                      src={resolveUrl(a.filename)}
                      alt={a.filename}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div style={{
                    color: '#18181b', fontSize: 11, fontWeight: 600, textAlign: 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {a.filename}
                  </div>
                  <div style={{ color: '#a1a1aa', fontSize: 10, textAlign: 'left' }}>
                    {a.brand || '?'} · {a.type}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
