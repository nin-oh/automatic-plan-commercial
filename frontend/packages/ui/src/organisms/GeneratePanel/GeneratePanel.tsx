import { useState } from 'react';
import { Sparkles, Download, Loader2 } from 'lucide-react';

export interface GenerateSummary {
  n_products: number;
  n_groups: number;
  n_subgroups: number;
  /** Optional — how many of `n_products` have a packshot set. Enables the
   *  "Avec packshot uniquement" KPI + button. When `undefined`, that
   *  affordance is hidden. */
  n_with_packshot?: number;
}

export interface GenerateResult {
  pptx_url: string;
  pdf_url: string;
  archive_name: string;
  archive_month: string;
  n_products: number;
  n_groups: number;
  n_subgroups: number;
}

export interface GenerateProgressSnapshot {
  current: number;
  total: number;
  percent: number;
  phase: string;
}

export interface GeneratePanelProps {
  summary: GenerateSummary;
  /** Generate the full deck (or pass `withPackshotOnly=true` to filter). */
  onGenerate: (withDividers: boolean, withPackshotOnly?: boolean) => Promise<GenerateResult>;
  /** Live progress while generation is running. The page polls
   *  `/api/generate/progress` and pushes snapshots here. Pass `null`
   *  when idle. The panel hides the progress bar when this is null. */
  progress?: GenerateProgressSnapshot | null;
  accentGradient?: string;
  accentShadow?: string;
  /** Solid accent for KPI accent values etc. */
  accent?: string;
}

type Mode = 'full' | 'packshot_only';

export function GeneratePanel({
  summary, onGenerate, progress,
  accentGradient = 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  accentShadow = '0 8px 20px rgba(99, 102, 241, 0.35)',
  accent = '#6366f1',
}: GeneratePanelProps) {
  const [withDividers, setWithDividers] = useState(true);
  // Track which button is currently running so only ONE shows a spinner —
  // the other stays clickable as long as the request hasn't started.
  const [busyMode, setBusyMode] = useState<Mode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const busy = busyMode !== null;
  const packshotEnabled = typeof summary.n_with_packshot === 'number';
  const packshotCount = summary.n_with_packshot ?? 0;

  async function run(mode: Mode) {
    setBusyMode(mode); setError(null); setResult(null);
    try {
      const r = await onGenerate(withDividers, mode === 'packshot_only');
      setResult(r);
    } catch (e: any) {
      // FastAPI's HTTPException(400) lands as response.data.detail —
      // surface it so the user knows WHY the export failed (e.g. "no
      // products with packshot").
      setError(e?.response?.data?.detail ?? e?.message ?? 'Erreur de génération');
    } finally {
      setBusyMode(null);
    }
  }

  const slides = summary.n_products
    ? 1 + summary.n_subgroups + summary.n_products
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: packshotEnabled ? 'repeat(5, 1fr)' : 'repeat(4, 1fr)',
        gap: 10,
      }}>
        <Kpi label="Produits" value={summary.n_products} />
        <Kpi label="Groupes" value={summary.n_groups} />
        <Kpi label="Sous-groupes" value={summary.n_subgroups} />
        <Kpi label="Slides" value={slides} accent={accent} />
        {packshotEnabled && (
          <Kpi label="Avec packshot" value={packshotCount}
            accent={packshotCount > 0 ? '#16a34a' : '#f59e0b'} />
        )}
      </div>

      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        color: '#27272a', fontSize: 13, cursor: 'pointer', fontWeight: 500,
      }}>
        <input type="checkbox" checked={withDividers}
          style={{ accentColor: accent }}
          onChange={(e) => setWithDividers(e.target.checked)} />
        Ajouter des slides séparatrices entre sous-groupes
      </label>

      <div style={{
        display: 'grid',
        gridTemplateColumns: packshotEnabled ? '1fr 1fr' : '1fr',
        gap: 10,
      }}>
        <button
          onClick={() => run('full')}
          disabled={busy || summary.n_products === 0}
          style={{
            padding: '14px 18px', border: 'none',
            background: summary.n_products === 0 ? '#e4e4e7' : accentGradient,
            color: summary.n_products === 0 ? '#a1a1aa' : '#fff',
            fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif',
            borderRadius: 10,
            cursor: summary.n_products === 0 ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: summary.n_products === 0 ? 'none' : accentShadow,
            letterSpacing: -0.1,
          }}
        >
          {busyMode === 'full' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
          {busyMode === 'full' ? 'Génération en cours…' : 'Générer le deck PPTX'}
        </button>

        {packshotEnabled && (
          <button
            onClick={() => run('packshot_only')}
            disabled={busy || packshotCount === 0}
            title={packshotCount === 0
              ? 'Aucun SKU avec packshot — téléversez des images d\'abord'
              : `Génère un PPT contenant uniquement les ${packshotCount} SKU(s) avec packshot`}
            style={{
              padding: '14px 18px',
              border: `1.5px solid ${packshotCount === 0 ? '#e4e4e7' : '#16a34a'}`,
              background: packshotCount === 0 ? '#f4f4f5' : '#ffffff',
              color: packshotCount === 0 ? '#a1a1aa' : '#15803d',
              fontSize: 14, fontWeight: 700, fontFamily: 'Inter, sans-serif',
              borderRadius: 10,
              cursor: packshotCount === 0 ? 'not-allowed' : 'pointer',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              letterSpacing: -0.1,
              transition: 'background 140ms',
            }}
          >
            {busyMode === 'packshot_only' ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            {busyMode === 'packshot_only'
              ? 'Génération en cours…'
              : `Avec packshot uniquement (${packshotCount})`}
          </button>
        )}
      </div>

      {busy && progress && progress.total > 0 && (
        <ProgressBar progress={progress} accent={accent} accentGradient={accentGradient} />
      )}

      {error && (
        <div style={{
          padding: 12, border: '1px solid #fecaca', borderRadius: 10,
          background: '#fef2f2', color: '#991b1b', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          padding: 16, border: '1px solid #bbf7d0', borderRadius: 12,
          background: '#f0fdf4',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ color: '#14532d', fontSize: 13, lineHeight: 1.5 }}>
            ✓ Généré : {result.n_groups} groupe(s), {result.n_subgroups} sous-groupe(s),
            {' '}{result.n_products} slide(s) produit. Archivé sous{' '}
            <code style={{
              color: '#14532d', background: 'rgba(20, 83, 45, 0.08)',
              padding: '1px 6px', borderRadius: 4, fontSize: 12,
            }}>
              archive/{result.archive_month}/{result.archive_name}
            </code>.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={result.pptx_url} download style={{
              ...primaryBtn, background: accentGradient, boxShadow: accentShadow,
              color: '#fff', textDecoration: 'none', flex: 1, padding: '11px 14px',
            }}>
              <Download size={14} /> Télécharger PPTX
            </a>
            <a href={result.pdf_url} download title="Première génération : ~30s (200 DPI, qualité impression). Les téléchargements suivants sont instantanés." style={{
              ...secondaryBtn, textDecoration: 'none', flex: 1, padding: '11px 14px',
            }}>
              <Download size={14} /> Télécharger PDF
            </a>
          </div>
        </div>
      )}

      <style>{`@keyframes pcm-spin { to { transform: rotate(360deg); } } .spin { animation: pcm-spin 1s linear infinite; }`}</style>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div style={{
      border: '1px solid #e4e4e7', borderRadius: 10, padding: 14,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 6,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        color: '#71717a', fontSize: 10.5, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: 0.6,
      }}>{label}</div>
      <div style={{
        color: accent || '#18181b', fontSize: 26, fontWeight: 700,
        fontFamily: '"JetBrains Mono", monospace',
      }}>{value}</div>
    </div>
  );
}

function ProgressBar({
  progress, accent, accentGradient,
}: {
  progress: GenerateProgressSnapshot;
  accent: string;
  accentGradient: string;
}) {
  // Clamp the visual fill to 0..100 so transient over/underflow (e.g. the
  // initial "Préparation…" snapshot where total=0) doesn't blow out the bar.
  const pct = Math.min(100, Math.max(0, progress.percent || 0));
  return (
    <div style={{
      padding: 14, border: '1px solid #e4e4e7', borderRadius: 10,
      background: '#ffffff', display: 'flex', flexDirection: 'column', gap: 10,
      boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        gap: 10, fontSize: 12.5,
      }}>
        <div style={{
          color: '#27272a', fontWeight: 600, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }} title={progress.phase}>
          {progress.phase || 'Génération en cours…'}
        </div>
        <div style={{
          color: accent, fontWeight: 700, flexShrink: 0,
          fontFamily: '"JetBrains Mono", monospace',
        }}>
          {progress.current}/{progress.total} · {pct.toFixed(1)}%
        </div>
      </div>
      <div style={{
        position: 'relative', height: 10, borderRadius: 999,
        background: '#f4f4f5', overflow: 'hidden',
      }}>
        <div style={{
          // Animate the width so the bar visibly grows between polls
          // instead of stepping abruptly each 500ms snapshot.
          width: `${pct}%`, height: '100%',
          background: accentGradient,
          transition: 'width 240ms ease-out',
          borderRadius: 999,
        }} />
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
};
const secondaryBtn: React.CSSProperties = {
  border: '1px solid #e4e4e7', background: '#ffffff', color: '#27272a',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
};
