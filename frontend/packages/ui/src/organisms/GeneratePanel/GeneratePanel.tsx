import { useState } from 'react';
import { Sparkles, Download, Loader2 } from 'lucide-react';

export interface GenerateSummary {
  n_products: number;
  n_groups: number;
  n_subgroups: number;
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

export interface GeneratePanelProps {
  summary: GenerateSummary;
  onGenerate: (withDividers: boolean) => Promise<GenerateResult>;
  accentGradient?: string;
  accentShadow?: string;
  /** Solid accent for KPI accent values etc. */
  accent?: string;
}

export function GeneratePanel({
  summary, onGenerate,
  accentGradient = 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  accentShadow = '0 8px 20px rgba(99, 102, 241, 0.35)',
  accent = '#6366f1',
}: GeneratePanelProps) {
  const [withDividers, setWithDividers] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  async function run() {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await onGenerate(withDividers);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? 'Erreur de génération');
    } finally {
      setBusy(false);
    }
  }

  const slides = summary.n_products
    ? 1 + summary.n_subgroups + summary.n_products
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <Kpi label="Produits" value={summary.n_products} />
        <Kpi label="Groupes" value={summary.n_groups} />
        <Kpi label="Sous-groupes" value={summary.n_subgroups} />
        <Kpi label="Slides" value={slides} accent={accent} />
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

      <button
        onClick={run}
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
        {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
        {busy ? 'Génération en cours…' : 'Générer le deck PPTX'}
      </button>

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
