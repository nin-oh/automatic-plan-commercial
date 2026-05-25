import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Library, Upload, Loader2 } from 'lucide-react';
import { ImagePicker, type ImageAsset } from '../../molecules/ImagePicker';
import { PackshotHandle, type PackshotRect } from './PackshotHandle';

export interface SlideProductRow {
  groupe: string;
  sous_groupe: string;
  nom: string;
  packshot: string;
  logo_groupe: string;
  prix_gros: number;
  prix_gros_net: number;
  colisage: string;
  colisage_prix_gros: number;
  colisage_prix_gros_net: number;
  is_promo: boolean;
  type_promo: string;
  promo_achat_qte: number;
  promo_gratuit_qte: number;
  promo_remise_pct: number;
  promo_texte: string;
  /** Show a carton BEHIND the left/right packshot. Both default off — the
   *  user opts in via checkboxes in the Promo section. */
  promo_carton_left: boolean;
  promo_carton_right: boolean;
  /** Show a ribbon overlay at the top-right corner of the left/right bag */
  promo_ribbon_left: boolean;
  promo_ribbon_right: boolean;
  /** Optional custom carton/ribbon images; empty falls back to the built-in
   *  default_carton.png / default_ribbon.png in assets/builtin/ */
  promo_carton_image: string;
  promo_ribbon_image: string;
  /** Per-role product images (used when the offered product on the right
   *  is a DIFFERENT SKU than the bought one on the left, OR when
   *  remise+gratuite has two distinct products on the right). */
  promo_remise_image: string;
  promo_gratuite_image: string;
  packshot_left: number;
  packshot_top: number;
  packshot_width: number;
  packshot_height: number;
}

export interface SlideEditorProps {
  index: number;
  total: number;
  row: SlideProductRow;
  previewUrl: string;
  resolveImageUrl: (filename: string) => string;
  packshots: ImageAsset[];
  logos: ImageAsset[];
  onGoTo: (index: number) => void;
  onChange: (patch: Partial<SlideProductRow>) => void;
  /** Click-to-place: kept as a fallback for taps on empty space. */
  onPlacePackshot: (xNorm: number, yNorm: number) => void;
  onResetPosition: () => void;
  onUploadPackshot: (file: File) => void;
  onUploadBrandLogo: (file: File) => void;
  onPickPackshot: (filename: string) => void;
  onPickBrandLogo: (filename: string) => void;
  /** All available images (any type) — used for the carton + ribbon pickers
   * inside the Promo section. The user picks any image from the library to
   * decorate the promo slide; we don't pre-categorize. */
  allImages?: ImageAsset[];
  /** Brand accent color used for the primary buttons. */
  accent?: string;
  /** Effective packshot rect from the API (left/top/width/height in inches +
   *  slide dimensions). The overlay handle uses this to draw a draggable box. */
  packshotRect?: PackshotRect | null;
  /** Commit a new packshot rect (called on drag/resize end). */
  onMoveOrResizePackshot?: (rect: PackshotRect) => void;
  /** Optional list of labels (one per slide) to render the slide picker as a
   *  searchable dropdown. Length should match `total`; if omitted, falls back
   *  to a plain text label. */
  slideLabels?: string[];
}

/** Live preview with click-to-place packshot, collapsible side panels for
 * prices/position/promo, and inline asset upload. Light surface theme. */
export function SlideEditor({
  index, total, row, previewUrl, resolveImageUrl,
  packshots, logos, allImages, onGoTo,
  onChange, onPlacePackshot, onResetPosition,
  onUploadPackshot, onUploadBrandLogo, onPickPackshot, onPickBrandLogo,
  accent = '#6366f1',
  packshotRect, onMoveOrResizePackshot,
  slideLabels,
}: SlideEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  type PickerSlot = 'packshot' | 'logo' | 'promo_carton' | 'promo_ribbon'
    | 'promo_remise_product' | 'promo_gratuite_product';
  const [picker, setPicker] = useState<null | PickerSlot>(null);

  // ── Double-buffered preview ──
  // Keep showing the previous src until the new one loads, so the user never
  // sees a flash. We preload via a hidden Image, swap on `onload`, and show a
  // small spinner in the corner while the new render is in flight.
  const [displayedSrc, setDisplayedSrc] = useState<string>(previewUrl);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (previewUrl === displayedSrc) return;
    setLoading(true);
    const img = new Image();
    img.onload = () => {
      setDisplayedSrc(previewUrl);
      setLoading(false);
    };
    img.onerror = () => setLoading(false);
    img.src = previewUrl;
  }, [previewUrl, displayedSrc]);

  // ── Container size — needed by PackshotHandle to map inches to pixels ──
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const measure = () => {
      const r = containerRef.current!.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Click-to-place fallback ──
  // Only fires when the click is OUTSIDE the packshot box (the box has its
  // own pointerdown handler that stops propagation).
  function handleContainerClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!row.packshot || row.is_promo) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onPlacePackshot(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  }

  const brand = (row.sous_groupe || row.groupe || '').trim();
  const showHandle = !row.is_promo && !!row.packshot && !!packshotRect && size.w > 0;

  return (
    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
      {/* ---- Preview column ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Slide pager */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => onGoTo(Math.max(0, index - 1))}
            disabled={index <= 0} style={navBtn}>← Préc.</button>
          {slideLabels && slideLabels.length === total ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
              <select
                value={index}
                onChange={(e) => onGoTo(Number(e.target.value))}
                title="Aller à la slide…"
                style={{
                  width: '100%', maxWidth: 480,
                  padding: '6px 10px', border: '1px solid #d4d4d8', borderRadius: 6,
                  fontSize: 12, color: '#18181b', background: '#ffffff',
                  cursor: 'pointer',
                }}
              >
                {slideLabels.map((label, i) => (
                  <option key={i} value={i}>
                    {`${i + 1} / ${total} — ${label || '(sans nom)'}`}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div style={{ color: '#52525b', fontSize: 12, flex: 1, textAlign: 'center' }}>
              Slide {index + 1} / {total} — <span style={{ color: '#18181b', fontWeight: 600 }}>
                {row.nom || '(sans nom)'}
              </span>
              <span style={{ color: '#a1a1aa' }}> · {row.groupe || '?'} / {row.sous_groupe || '?'}</span>
            </div>
          )}
          <button onClick={() => onGoTo(Math.min(total - 1, index + 1))}
            disabled={index >= total - 1} style={navBtn}>Suiv. →</button>
        </div>

        {/* Preview image — double-buffered, with draggable packshot overlay */}
        <div
          ref={containerRef}
          onClick={handleContainerClick}
          style={{
            position: 'relative', background: '#fafafa',
            border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden',
            aspectRatio: '16 / 9',
            cursor: row.packshot && !row.is_promo ? 'crosshair' : 'default',
          }}
        >
          <img
            src={displayedSrc}
            alt={`Aperçu slide ${index + 1}`}
            style={{
              width: '100%', height: '100%', objectFit: 'contain', display: 'block',
              userSelect: 'none', pointerEvents: 'none',
            }}
            draggable={false}
          />
          {showHandle && (
            <PackshotHandle
              rect={packshotRect!}
              containerWidth={size.w}
              containerHeight={size.h}
              accent={accent}
              onCommit={(r) => onMoveOrResizePackshot?.(r)}
            />
          )}
          {/* loading indicator (top-right) */}
          {loading && (
            <div style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(255, 255, 255, 0.92)', color: accent,
              padding: 6, borderRadius: 999,
              border: '1px solid #e4e4e7',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
            }}>
              <Loader2 size={14} className="spin" />
            </div>
          )}
          {row.packshot && !row.is_promo && (
            <div style={{
              position: 'absolute', bottom: 8, left: 8,
              background: 'rgba(255, 255, 255, 0.92)', color: '#3f3f46',
              fontSize: 11, padding: '5px 10px', borderRadius: 6,
              border: '1px solid #e4e4e7',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              pointerEvents: 'none',
            }}>
              💡 Glissez le cadre pour déplacer · les coins pour redimensionner
            </div>
          )}
          <style>{`@keyframes pcm-spin { to { transform: rotate(360deg); } } .spin { animation: pcm-spin 1s linear infinite; }`}</style>
        </div>

        {/* Collapsible: prices */}
        <Section title="Prix & colisage" defaultOpen>
          <Grid>
            <NumField label="Prix Gros (unité)" value={row.prix_gros}
              onChange={(v) => onChange({ prix_gros: v })} step={0.01} />
            <NumField label="Prix Gros Net (unité)" value={row.prix_gros_net}
              onChange={(v) => onChange({ prix_gros_net: v })} step={0.01} />
            <TextField label="Colisage" value={row.colisage}
              onChange={(v) => onChange({ colisage: v })} placeholder="ex. SAC de 16" />
            <NumField label="Prix Gros (caisse)" value={row.colisage_prix_gros}
              onChange={(v) => onChange({ colisage_prix_gros: v })} step={0.01} />
            <NumField label="Prix Gros Net (caisse)" value={row.colisage_prix_gros_net}
              onChange={(v) => onChange({ colisage_prix_gros_net: v })} step={0.01} />
          </Grid>
        </Section>

        {/* Collapsible: position */}
        <Section title="Position & taille du packshot">
          <Grid>
            <NumField label="Largeur (in)" value={row.packshot_width || 0}
              onChange={(v) => onChange({ packshot_width: round2(v) })}
              step={0.1} min={0} max={13} />
            <NumField label="Hauteur (in)" value={row.packshot_height || 0}
              onChange={(v) => onChange({ packshot_height: round2(v) })}
              step={0.1} min={0} max={7} />
            <NumField label="Gauche (in)" value={row.packshot_left || 0}
              onChange={(v) => onChange({ packshot_left: round2(v) })} step={0.1} />
            <NumField label="Haut (in)" value={row.packshot_top || 0}
              onChange={(v) => onChange({ packshot_top: round2(v) })} step={0.1} />
          </Grid>
          <button onClick={onResetPosition} style={{ ...secondaryBtn, marginTop: 10 }}>
            <RotateCcw size={12} /> Réinitialiser la position
          </button>
        </Section>

        {/* Collapsible: promo */}
        <Section title="Promo" defaultOpen={row.is_promo}>
          <label style={checkRow}>
            <input type="checkbox" checked={row.is_promo}
              onChange={(e) => onChange({ is_promo: e.target.checked })} />
            <span>Cette slide est une promo</span>
          </label>
          <Grid>
            <Field label="Type de promo">
              <select disabled={!row.is_promo} value={row.type_promo || 'gratuite'}
                onChange={(e) => onChange({ type_promo: e.target.value })}
                style={inputStyle}>
                <option value="gratuite">gratuite</option>
                <option value="remise">remise</option>
                <option value="remise+gratuite">remise+gratuite</option>
              </select>
            </Field>
            <NumField label="Acheter N caisses" value={row.promo_achat_qte}
              onChange={(v) => onChange({ promo_achat_qte: Math.round(v) })}
              step={1} min={0} disabled={!row.is_promo} />
            <NumField label="X gratuites" value={row.promo_gratuit_qte}
              onChange={(v) => onChange({ promo_gratuit_qte: Math.round(v) })}
              step={1} min={0} disabled={!row.is_promo || row.type_promo === 'remise'} />
            <NumField label="Remise (%)" value={row.promo_remise_pct}
              onChange={(v) => onChange({ promo_remise_pct: v })}
              step={0.5} min={0}
              disabled={!row.is_promo || row.type_promo === 'gratuite'} />
            <TextField label="Texte personnalisé" value={row.promo_texte}
              onChange={(v) => onChange({ promo_texte: v })}
              placeholder="(facultatif, remplace le texte auto)"
              disabled={!row.is_promo} />
          </Grid>

          {/* Décorations — two opt-in sections. Carton + Ribbon each have
              left/right checkboxes (independent) and an optional image
              override. Defaults to the built-in carton/ribbon assets. */}
          <div style={{ marginTop: 14, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
            <PromoDecoration
              label="Carton (boîte)"
              hint="Affiché derrière le sac · le sac reste visible devant"
              imageFilename={row.promo_carton_image}
              imagePreview={row.promo_carton_image ? resolveImageUrl(row.promo_carton_image) : null}
              defaultLabel="Boîte intégrée"
              left={row.promo_carton_left}
              right={row.promo_carton_right}
              accent={accent}
              disabled={!row.is_promo}
              onToggleLeft={(v) => onChange({ promo_carton_left: v })}
              onToggleRight={(v) => onChange({ promo_carton_right: v })}
              onPickImage={() => setPicker('promo_carton')}
              onClearImage={() => onChange({ promo_carton_image: '' })}
            />
            <PromoDecoration
              label="Ruban"
              hint="Surcouche au coin haut-droit du sac choisi"
              imageFilename={row.promo_ribbon_image}
              imagePreview={row.promo_ribbon_image ? resolveImageUrl(row.promo_ribbon_image) : null}
              defaultLabel="Ruban intégré"
              left={row.promo_ribbon_left}
              right={row.promo_ribbon_right}
              accent={accent}
              disabled={!row.is_promo}
              onToggleLeft={(v) => onChange({ promo_ribbon_left: v })}
              onToggleRight={(v) => onChange({ promo_ribbon_right: v })}
              onPickImage={() => setPicker('promo_ribbon')}
              onClearImage={() => onChange({ promo_ribbon_image: '' })}
            />
          </div>

          {/* Per-role product images. Used when the offered product is a
              different SKU than the bought one, OR (for remise+gratuite)
              when there are TWO distinct products on the right. */}
          <div style={{
            marginTop: 12, display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10,
          }}>
            <PromoProductTile
              label="Produit en remise"
              hint="Si différent du produit acheté"
              filename={row.promo_remise_image}
              previewSrc={row.promo_remise_image ? resolveImageUrl(row.promo_remise_image) : null}
              accent={accent}
              disabled={!row.is_promo}
              onPick={() => setPicker('promo_remise_product')}
              onClear={() => onChange({ promo_remise_image: '' })}
            />
            <PromoProductTile
              label="Produit gratuit"
              hint="Si différent du produit acheté"
              filename={row.promo_gratuite_image}
              previewSrc={row.promo_gratuite_image ? resolveImageUrl(row.promo_gratuite_image) : null}
              accent={accent}
              disabled={!row.is_promo}
              onPick={() => setPicker('promo_gratuite_product')}
              onClear={() => onChange({ promo_gratuite_image: '' })}
            />
          </div>
          {row.is_promo && row.type_promo === 'remise+gratuite'
            && row.promo_remise_image && row.promo_gratuite_image
            && row.promo_remise_image !== row.promo_gratuite_image && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              border: `1px dashed ${accent}66`, borderRadius: 8,
              background: `${accent}10`, color: '#3f3f46',
              fontSize: 11.5,
            }}>
              <b>Mode 3 produits actif</b> · Le côté droit affiche les deux
              produits côte-à-côte avec leurs étiquettes (REMISE / GRATUITE).
            </div>
          )}
        </Section>
      </div>

      {/* ---- Right column: assets ---- */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <AssetCard
          title="Packshot"
          subtitle={row.packshot || '(aucun)'}
          previewSrc={row.packshot ? resolveImageUrl(row.packshot) : null}
          accent={accent}
          onUpload={onUploadPackshot}
          onPickFromLibrary={() => setPicker('packshot')}
        />
        <AssetCard
          title={`Logo de marque — ${brand || '(aucune)'}`}
          subtitle={row.logo_groupe || '(aucun)'}
          previewSrc={row.logo_groupe ? resolveImageUrl(row.logo_groupe) : null}
          accent={accent}
          onUpload={onUploadBrandLogo}
          onPickFromLibrary={() => setPicker('logo')}
        />
      </div>

      <ImagePicker
        open={picker !== null}
        title={
          picker === 'packshot'              ? `Packshots ${brand}` :
          picker === 'logo'                  ? `Logos ${brand}` :
          picker === 'promo_carton'          ? 'Choisir un carton' :
          picker === 'promo_ribbon'          ? 'Choisir un ruban' :
          picker === 'promo_remise_product'  ? 'Produit en remise' :
          picker === 'promo_gratuite_product'? 'Produit gratuit' :
          ''
        }
        emptyHint={
          picker === 'packshot' ? 'Aucun packshot dans la bibliothèque' :
          picker === 'logo'     ? 'Aucun logo dans la bibliothèque' :
          'Aucune image dans la bibliothèque'
        }
        assets={
          picker === 'packshot' ? packshots :
          picker === 'logo'     ? logos :
          (allImages ?? [])
        }
        resolveUrl={resolveImageUrl}
        onPick={(name) => {
          switch (picker) {
            case 'packshot':              onPickPackshot(name); break;
            case 'logo':                  onPickBrandLogo(name); break;
            case 'promo_carton':          onChange({ promo_carton_image: name }); break;
            case 'promo_ribbon':          onChange({ promo_ribbon_image: name }); break;
            case 'promo_remise_product':  onChange({ promo_remise_image: name }); break;
            case 'promo_gratuite_product':onChange({ promo_gratuite_image: name }); break;
          }
        }}
        onClose={() => setPicker(null)}
      />
    </div>
  );
}

/* ─── Promo decoration tile (carton or ribbon) ────────────────────── */

function PromoDecoration({
  label, hint, imageFilename, imagePreview, defaultLabel,
  left, right, accent, disabled,
  onToggleLeft, onToggleRight, onPickImage, onClearImage,
}: {
  label: string;
  hint: string;
  imageFilename: string;
  imagePreview: string | null;
  defaultLabel: string;
  left: boolean;
  right: boolean;
  accent: string;
  disabled: boolean;
  onToggleLeft: (v: boolean) => void;
  onToggleRight: (v: boolean) => void;
  onPickImage: () => void;
  onClearImage: () => void;
}) {
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 12,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 10,
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{
          fontSize: 12.5, fontWeight: 700, color: '#18181b',
        }}>{label}</span>
        <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>{hint}</span>
      </div>

      {/* Side checkboxes */}
      <div style={{ display: 'flex', gap: 8 }}>
        <SideCheckbox
          label="Gauche" checked={left} disabled={disabled}
          accent={accent} onChange={onToggleLeft} />
        <SideCheckbox
          label="Droite" checked={right} disabled={disabled}
          accent={accent} onChange={onToggleRight} />
      </div>

      {/* Image preview + override */}
      <div style={{
        display: 'grid', gridTemplateColumns: '60px 1fr', gap: 10,
        alignItems: 'center',
      }}>
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#fafafa', borderRadius: 6, overflow: 'hidden',
          border: '1px dashed #e4e4e7',
        }}>
          {imagePreview
            ? <img src={imagePreview} alt={label}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            : <span style={{ color: '#a1a1aa', fontSize: 9, textAlign: 'center', padding: 4 }}>
                Défaut
              </span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <div style={{
            fontSize: 10.5, color: '#71717a',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {imageFilename || defaultLabel}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              disabled={disabled}
              onClick={onPickImage}
              style={{
                flex: 1, padding: '4px 8px',
                border: `1px solid ${accent}55`, borderRadius: 6,
                background: `${accent}10`, color: accent,
                fontSize: 10.5, fontWeight: 600,
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >Image…</button>
            {imageFilename && !disabled && (
              <button
                onClick={onClearImage}
                style={{
                  padding: '4px 8px',
                  border: '1px solid #e4e4e7', borderRadius: 6,
                  background: '#ffffff', color: '#52525b',
                  fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                }}
              >×</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-role product image tile (REMISE / GRATUITE) ─────────────── */

function PromoProductTile({
  label, hint, filename, previewSrc, accent, disabled, onPick, onClear,
}: {
  label: string;
  hint: string;
  filename: string;
  previewSrc: string | null;
  accent: string;
  disabled: boolean;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 10,
      background: '#ffffff', display: 'flex', alignItems: 'center', gap: 10,
      opacity: disabled ? 0.55 : 1,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 8, overflow: 'hidden',
        background: '#fafafa', display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0,
        border: '1px dashed #e4e4e7',
      }}>
        {previewSrc
          ? <img src={previewSrc} alt={label}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ color: '#a1a1aa', fontSize: 9, padding: 4, textAlign: 'center' }}>
              Packshot
            </span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: '#18181b', letterSpacing: 0.1,
        }}>{label}</span>
        <span style={{ fontSize: 10.5, color: '#a1a1aa' }}>
          {filename || hint}
        </span>
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <button
            disabled={disabled}
            onClick={onPick}
            style={{
              flex: 1, padding: '4px 8px',
              border: `1px solid ${accent}55`, borderRadius: 6,
              background: `${accent}10`, color: accent,
              fontSize: 11, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
          >Image…</button>
          {filename && !disabled && (
            <button
              onClick={onClear}
              style={{
                padding: '4px 8px',
                border: '1px solid #e4e4e7', borderRadius: 6,
                background: '#ffffff', color: '#52525b',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >×</button>
          )}
        </div>
      </div>
    </div>
  );
}

function SideCheckbox({
  label, checked, disabled, accent, onChange,
}: {
  label: string; checked: boolean; disabled: boolean;
  accent: string; onChange: (v: boolean) => void;
}) {
  return (
    <label style={{
      flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 10px',
      border: `1px solid ${checked ? accent : '#e4e4e7'}`,
      borderRadius: 8, fontSize: 12, fontWeight: 600,
      color: checked ? accent : '#52525b',
      background: checked ? `${accent}10` : '#ffffff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 140ms',
      userSelect: 'none',
    }}>
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: accent, margin: 0 }}
      />
      {label}
    </label>
  );
}

// ---- internal subcomponents ------------------------------------------------

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, overflow: 'hidden',
      background: '#ffffff',
    }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', background: '#fafafa', border: 'none',
          color: '#18181b', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          borderBottom: open ? '1px solid #e4e4e7' : 'none',
        }}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title}
      </button>
      {open && <div style={{ padding: 14, background: '#ffffff' }}>{children}</div>}
    </div>
  );
}

function AssetCard({
  title, subtitle, previewSrc, onUpload, onPickFromLibrary, accent,
}: {
  title: string; subtitle: string; previewSrc: string | null;
  onUpload: (file: File) => void; onPickFromLibrary: () => void;
  accent: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 12,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{ color: '#18181b', fontSize: 12, fontWeight: 600 }}>{title}</div>
      <div style={{
        height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', borderRadius: 8, overflow: 'hidden',
        border: '1px solid #f4f4f5',
      }}>
        {previewSrc
          ? <img src={previewSrc} alt={title}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ color: '#a1a1aa', fontSize: 11 }}>Pas d'image</span>}
      </div>
      <div style={{
        color: '#71717a', fontSize: 11,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {subtitle}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => inputRef.current?.click()}
          style={{
            ...primaryBtn,
            background: accent,
            boxShadow: `0 4px 10px ${accent}40`,
            flex: 1,
          }}>
          <Upload size={12} /> Téléverser
        </button>
        <button onClick={onPickFromLibrary} style={{ ...secondaryBtn, flex: 1 }}>
          <Library size={12} /> Bibliothèque
        </button>
      </div>
      <input
        ref={inputRef} type="file" accept="image/*"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{
        fontSize: 10.5, color: '#71717a', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>{label}</span>
      {children}
    </label>
  );
}
function TextField({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input value={value} disabled={disabled} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </Field>
  );
}
function NumField({ label, value, onChange, step = 1, min, max, disabled }: {
  label: string; value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; disabled?: boolean;
}) {
  return (
    <Field label={label}>
      <input type="number" value={value ?? 0} disabled={disabled}
        step={step} min={min} max={max}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={inputStyle} />
    </Field>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid #e4e4e7', background: '#ffffff', color: '#18181b',
  fontSize: 12.5, outline: 'none',
};
const navBtn: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid #e4e4e7', background: '#ffffff',
  color: '#27272a', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
};
const primaryBtn: React.CSSProperties = {
  padding: '7px 11px', border: 'none', background: '#6366f1', color: '#fff',
  borderRadius: 7, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
};
const secondaryBtn: React.CSSProperties = {
  padding: '7px 11px', border: '1px solid #e4e4e7', background: '#ffffff',
  color: '#27272a', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', gap: 5,
};
const checkRow: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  fontSize: 12.5, color: '#18181b', marginBottom: 10, cursor: 'pointer', fontWeight: 500,
};
