import { Sliders, Image as ImageIcon } from 'lucide-react';
import { DropZone } from '../../molecules/DropZone';
import { SectionCard } from '../../molecules/SectionCard';

export interface DeckMeta {
  titre: string;
  canal: string;
  mois: string;
  banner: string | null;
  background: string | null;
  cover_photo: string | null;
}

export interface DeckMetaFormProps {
  meta: DeckMeta;
  onChange: (next: Partial<DeckMeta>) => void;
  onUploadGlobal: (kind: 'banner' | 'background' | 'cover', file: File) => void;
  onClearGlobal: (kind: 'banner' | 'background' | 'cover') => void;
  resolveImage: (filename: string) => string;
  /** Accent for the icon tints + dropzone hover state */
  accent?: string;
  accent2?: string;
}

/** Tab "1. Deck" — title/canal/mois inputs + 3 drop zones for the deck-wide
 * imagery (banner, background, cover photo). */
export function DeckMetaForm({
  meta, onChange, onUploadGlobal, onClearGlobal, resolveImage,
  accent = '#f97316', accent2 = '#dc2626',
}: DeckMetaFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionCard
        icon={<Sliders size={16} />}
        accent={accent}
        title="Métadonnées du deck"
        subtitle="Le titre, le canal de distribution et le mois apparaissent sur la couverture et dans le pied de page de chaque slide."
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 14,
        }}>
          <Field label="Titre">
            <input
              value={meta.titre}
              onChange={(e) => onChange({ titre: e.target.value })}
              style={inputStyle(accent)}
            />
          </Field>
          <Field label="Canal">
            <input
              value={meta.canal}
              onChange={(e) => onChange({ canal: e.target.value })}
              style={inputStyle(accent)}
            />
          </Field>
          <Field label="Mois">
            <input
              value={meta.mois}
              onChange={(e) => onChange({ mois: e.target.value })}
              placeholder="Avril 2026"
              style={inputStyle(accent)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        icon={<ImageIcon size={16} />}
        accent={accent}
        title="Images globales"
        subtitle="Optionnelles — laissez vide pour utiliser les images intégrées du deck de référence."
      >
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}>
          <DropZone
            label="Bannière (haut-gauche)"
            previewSrc={meta.banner ? resolveImage(meta.banner) : null}
            hint={meta.banner ?? 'banner_canal_gros.png (intégré)'}
            onFiles={(files) => onUploadGlobal('banner', files[0])}
            onClear={meta.banner ? () => onClearGlobal('banner') : undefined}
            accent={accent} accent2={accent2}
          />
          <DropZone
            label="Arrière-plan"
            previewSrc={meta.background ? resolveImage(meta.background) : null}
            hint={meta.background ?? 'wood_background.png (intégré)'}
            onFiles={(files) => onUploadGlobal('background', files[0])}
            onClear={meta.background ? () => onClearGlobal('background') : undefined}
            accent={accent} accent2={accent2}
          />
          <DropZone
            label="Photo de couverture"
            previewSrc={meta.cover_photo ? resolveImage(meta.cover_photo) : null}
            hint={meta.cover_photo ?? '(aucune)'}
            onFiles={(files) => onUploadGlobal('cover', files[0])}
            onClear={meta.cover_photo ? () => onClearGlobal('cover') : undefined}
            accent={accent} accent2={accent2}
          />
        </div>
      </SectionCard>
    </div>
  );
}

const inputStyle = (_accent: string): React.CSSProperties => ({
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #e4e4e7',
  background: '#ffffff',
  color: '#18181b',
  fontSize: 13.5,
  fontFamily: 'Inter, sans-serif',
  fontWeight: 500,
  transition: 'border-color 160ms, box-shadow 160ms',
  outline: 'none',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
});

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{
        fontSize: 10.5, color: '#71717a', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.7,
      }}>{label}</span>
      {children}
    </label>
  );
}
