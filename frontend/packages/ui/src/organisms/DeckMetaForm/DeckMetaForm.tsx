import { Sliders, Image as ImageIcon } from 'lucide-react';
import { DropZone } from '../../molecules/DropZone';
import { SectionCard } from '../../molecules/SectionCard';

export interface DeckMeta {
  titre: string;
  canal: string;
  mois: string;
  /** Détail catalogue brand ("MIO" | "ZEN"). Only shown when canal=Détail. */
  marque?: string;
  banner: string | null;
  background: string | null;
  cover_photo: string | null;
  /** "Nouveau lancement" — adds the جديد / Nouveau ribbon to every slide. */
  nouveau_lancement?: boolean;
}

export interface DeckMetaFormProps {
  meta: DeckMeta;
  onChange: (next: Partial<DeckMeta>) => void;
  onUploadGlobal: (kind: 'banner' | 'background' | 'cover', file: File) => void;
  onClearGlobal: (kind: 'banner' | 'background' | 'cover') => void;
  resolveImage: (filename: string) => string;
  /** URL of the automatic channel ribbon (Gros / Détail) — shown read-only.
   *  The banner is derived from `canal`; there is no manual override. */
  bannerPreviewSrc?: string;
  /** Accent for the icon tints + dropzone hover state */
  accent?: string;
  accent2?: string;
}

/** Tab "1. Deck" — title/canal/mois inputs + 3 drop zones for the deck-wide
 * imagery (banner, background, cover photo). */
export function DeckMetaForm({
  meta, onChange, onUploadGlobal, onClearGlobal, resolveImage,
  bannerPreviewSrc,
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
            {/* Two canonical channels — Gros (wholesale, prices+colis in
                caisses) and Détail (retail, prices in unités). The text
                below the slides + the table headers + promo wording all
                key off this value, so keep it controlled instead of
                free-text. Backwards-compat: any stored value that's not
                exactly "Gros" or "Détail" still gets recognised by the
                renderer via case-insensitive substring matching. */}
            <select
              value={normaliseCanal(meta.canal)}
              onChange={(e) => onChange({ canal: e.target.value })}
              style={inputStyle(accent)}
            >
              <option value="Gros">Gros</option>
              <option value="Détail">Détail</option>
            </select>
          </Field>
          {normaliseCanal(meta.canal) === 'Détail' && (
            <Field label="Marque (catalogue)">
              {/* Which Détail catalogue this deck is: MIO (avec ses
                  sous-marques IRIS, A+, Claire's, Blandoux, Vita…) ou ZEN.
                  L'ordre par défaut des familles de produits en dépend. */}
              <select
                value={(meta.marque || 'MIO').toUpperCase() === 'ZEN' ? 'ZEN' : 'MIO'}
                onChange={(e) => onChange({ marque: e.target.value })}
                style={inputStyle(accent)}
              >
                <option value="MIO">MIO</option>
                <option value="ZEN">ZEN</option>
              </select>
            </Field>
          )}
          <Field label="Mois">
            <input
              value={meta.mois}
              onChange={(e) => onChange({ mois: e.target.value })}
              placeholder="Avril 2026"
              style={inputStyle(accent)}
            />
          </Field>
          <Field label="Nouveau lancement">
            {/* When ON, every product slide gets the red « جديد / Nouveau »
                ribbon in the top-centre — used for a product-launch deck. */}
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
              padding: '10px 12px', borderRadius: 10,
              border: `1px solid ${meta.nouveau_lancement ? accent : '#e4e4e7'}`,
              background: meta.nouveau_lancement ? `${accent}10` : '#ffffff',
              fontFamily: 'Inter, sans-serif', fontSize: 13.5, fontWeight: 600,
              color: '#18181b', transition: 'border-color 160ms, background 160ms',
            }}>
              <input
                type="checkbox"
                checked={!!meta.nouveau_lancement}
                onChange={(e) => onChange({ nouveau_lancement: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: accent, cursor: 'pointer' }}
              />
              Ruban « جديد / Nouveau » sur chaque slide
            </label>
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
          {/* The banner is automatic: it follows the Canal (Gros ribbon /
              Détail ribbon). Read-only preview so the user sees which one
              is active — no upload, no override to go stale. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{
              fontSize: 13, fontWeight: 600, color: '#3f3f46',
              fontFamily: 'Inter, sans-serif',
            }}>
              Bannière (haut-gauche)
            </span>
            <div style={{
              border: '1px solid #e4e4e7', borderRadius: 12,
              background: '#fafafa', minHeight: 150,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 14, position: 'relative', overflow: 'hidden',
            }}>
              {bannerPreviewSrc ? (
                <img
                  src={bannerPreviewSrc}
                  alt={`Bannière Canal ${normaliseCanal(meta.canal)}`}
                  style={{ maxWidth: '100%', maxHeight: 130, objectFit: 'contain' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: '#a1a1aa' }}>
                  Ruban «&nbsp;Canal {normaliseCanal(meta.canal)}&nbsp;»
                </span>
              )}
              <span style={{
                position: 'absolute', top: 8, right: 8,
                fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
                padding: '2px 8px', borderRadius: 999,
                background: `${accent}18`, color: accent,
                border: `1px solid ${accent}44`, textTransform: 'uppercase',
              }}>
                auto
              </span>
            </div>
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>
              Suit le canal automatiquement — Gros ou Détail.
            </span>
          </div>
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

/** Map any historical value of `canal` to one of the two canonical
 *  options the select offers. Existing decks may carry strings like
 *  "Canal Gros", "Détail", "détail", "gros" etc. — we collapse them all
 *  down so the select's option matches and the dropdown shows the right
 *  choice instead of falling through to the (browser-default) first
 *  option. The raw user-typed string is preserved in storage so
 *  downstream cover rendering keeps showing whatever the user entered. */
function normaliseCanal(raw: string): 'Gros' | 'Détail' {
  const v = (raw || '').toLowerCase();
  if (v.includes('détail') || v.includes('detail')) return 'Détail';
  return 'Gros';
}

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
