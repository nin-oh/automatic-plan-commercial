import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { ImagePlus, X } from 'lucide-react';

export interface DropZoneProps {
  label: string;
  hint?: string;
  previewSrc?: string | null;
  accept?: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  onClear?: () => void;
  /** Accent color for hover/active. Defaults to indigo. */
  accent?: string;
  accent2?: string;
  height?: number;
  className?: string;
}

export function DropZone({
  label, hint, previewSrc, accept = 'image/png,image/jpeg,image/webp',
  multiple = false, onFiles, onClear,
  accent = '#6366f1', accent2 = '#8b5cf6',
  height = 160, className,
}: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setHover(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) onFiles(multiple ? files : [files[0]]);
  }

  function handleSelect(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length) onFiles(multiple ? files : [files[0]]);
    e.target.value = '';
  }

  return (
    <div className={className}>
      <div style={{
        fontSize: 12, fontWeight: 600, color: '#3f3f46', marginBottom: 7,
        letterSpacing: 0.1,
      }}>
        {label}
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setHover(true); }}
        onDragLeave={() => setHover(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        style={{
          position: 'relative',
          height,
          border: `1.5px dashed ${hover ? accent : '#d4d4d8'}`,
          borderRadius: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: hover
            ? `radial-gradient(ellipse at center, ${accent}14, transparent 70%), #ffffff`
            : '#fafafa',
          cursor: 'pointer',
          transition: 'all 160ms ease',
          overflow: 'hidden',
          boxShadow: hover ? `0 0 0 4px ${accent}1a` : 'none',
        }}
      >
        {previewSrc ? (
          <>
            <img
              src={previewSrc}
              alt={label}
              style={{
                maxWidth: 'calc(100% - 16px)', maxHeight: 'calc(100% - 16px)',
                objectFit: 'contain',
              }}
            />
            <div style={{
              position: 'absolute', inset: 0,
              background: hover
                ? 'linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,0.45))'
                : 'transparent',
              display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              padding: 10,
              opacity: hover ? 1 : 0,
              transition: 'opacity 160ms',
              pointerEvents: 'none',
            }}>
              <span style={{
                color: '#fff', fontSize: 11, fontWeight: 600,
                textShadow: '0 1px 2px rgba(0,0,0,0.6)',
              }}>
                Cliquez pour remplacer
              </span>
            </div>
          </>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            transition: 'color 160ms',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: hover
                ? `linear-gradient(135deg, ${accent}, ${accent2})`
                : '#f4f4f5',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: hover ? `0 8px 18px ${accent}33` : 'none',
              transition: 'all 160ms',
              color: hover ? '#fff' : '#a1a1aa',
              border: hover ? 'none' : '1px solid #e4e4e7',
            }}>
              <ImagePlus size={20} />
            </div>
            <div style={{
              fontSize: 12.5, fontWeight: 600,
              color: hover ? accent : '#52525b',
              transition: 'color 160ms',
            }}>
              Glissez ou cliquez
            </div>
            <div style={{ fontSize: 10.5, color: '#a1a1aa', fontWeight: 500 }}>
              PNG, JPG, WEBP
            </div>
          </div>
        )}
        {onClear && previewSrc && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            aria-label="Effacer"
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(0, 0, 0, 0.7)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999,
              padding: 5, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(6px)',
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
      {hint && (
        <div style={{
          fontSize: 11, color: '#71717a', marginTop: 7,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: 999, background: '#d4d4d8',
          }} />
          {hint}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
