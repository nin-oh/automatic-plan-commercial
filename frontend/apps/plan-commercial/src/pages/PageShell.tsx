import { BrandedPageHeader } from '@amafin/ui';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

/** Plan Commercial brand constants — used by pages that still need raw color
 * values for inline buttons / KPI accents. The shell, sidebar, and SmartTable
 * already pick the same color up via the `--accent` CSS variable. */
export const PC_ACCENT  = '#f97316';
export const PC_ACCENT2 = '#dc2626';
export const PC_GRADIENT = `linear-gradient(135deg, ${PC_ACCENT}, ${PC_ACCENT2})`;

/** Light-theme button presets. Spread `{...pcButton.base, ...pcButton.primary}`
 * onto a `<button>` or `<a>` `style` to get a brand-consistent button. The
 * `BrandButton` atom is preferred for new code — these helpers are kept for
 * backward compatibility with the existing pages. */
export const pcButton = {
  base: {
    padding: '8px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600,
    fontFamily: 'Inter, sans-serif', cursor: 'pointer', textDecoration: 'none',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    transition: 'all 140ms', whiteSpace: 'nowrap' as const,
  },
  primary: {
    border: 'none', background: PC_GRADIENT, color: '#fff',
    boxShadow: `0 4px 12px ${PC_ACCENT}40`,
  },
  secondary: {
    border: '1px solid #e4e4e7', background: '#ffffff', color: '#27272a',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
  },
  ghost: {
    border: '1px solid transparent', background: 'transparent', color: '#52525b',
  },
  danger: {
    border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c',
  },
} as const;

/** Ordered workflow — the steps a user walks through to produce a deck.
 * The WorkflowBar renders these as clickable pills with Précédent/Suivant
 * shortcuts so moving between pages doesn't require the sidebar. */
const FLOW: { path: string; label: string }[] = [
  { path: '/deck',      label: 'Deck' },
  { path: '/content',   label: 'Contenu' },
  { path: '/order',     label: 'Ordre' },
  { path: '/brands',    label: 'Marques' },
  { path: '/images',    label: 'Images' },
  { path: '/catalogue', label: 'Catalogue' },
  { path: '/generate',  label: 'Génération' },
];

function WorkflowBar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const idx = FLOW.findIndex((s) => s.path === pathname);
  if (idx === -1) return null;   // dashboard / SAP page — not part of the flow

  const prev = idx > 0 ? FLOW[idx - 1] : null;
  const next = idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  const navBtn = (step: { path: string; label: string } | null, dir: 'prev' | 'next') => (
    <button
      disabled={!step}
      onClick={() => step && navigate(step.path)}
      title={step ? step.label : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
        fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
        cursor: step ? 'pointer' : 'default',
        border: '1px solid #e4e4e7',
        background: step ? '#ffffff' : '#fafafa',
        color: step ? '#3f3f46' : '#d4d4d8',
        transition: 'all 140ms',
      }}
    >
      {dir === 'prev' && <ChevronLeft size={14} />}
      {step ? step.label : dir === 'prev' ? 'Début' : 'Fin'}
      {dir === 'next' && <ChevronRight size={14} />}
    </button>
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 12px', marginBottom: 14,
      background: '#ffffff', border: '1px solid #ececee', borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
      {navBtn(prev, 'prev')}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {FLOW.map((step, i) => {
          const active = i === idx;
          const done = i < idx;
          return (
            <div key={step.path} style={{ display: 'flex', alignItems: 'center' }}>
              {i > 0 && (
                <div style={{
                  width: 16, height: 1.5, margin: '0 2px',
                  background: done || active ? `${PC_ACCENT}66` : '#e4e4e7',
                }} />
              )}
              <button
                onClick={() => navigate(step.path)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '4px 10px', borderRadius: 999, fontSize: 11.5,
                  fontWeight: active ? 700 : 500, fontFamily: 'Inter, sans-serif',
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 140ms',
                  border: active ? 'none' : '1px solid transparent',
                  background: active ? PC_GRADIENT : 'transparent',
                  color: active ? '#fff' : done ? '#9a3412' : '#71717a',
                  boxShadow: active ? `0 3px 10px ${PC_ACCENT}45` : 'none',
                }}
              >
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 15, height: 15, borderRadius: 999, fontSize: 9.5, fontWeight: 700,
                  background: active ? 'rgba(255,255,255,0.25)' : done ? `${PC_ACCENT}22` : '#f4f4f5',
                  color: active ? '#fff' : done ? PC_ACCENT : '#a1a1aa',
                }}>
                  {done ? <Check size={9} strokeWidth={3.5} /> : i + 1}
                </span>
                {step.label}
              </button>
            </div>
          );
        })}
      </div>
      {navBtn(next, 'next')}
    </div>
  );
}

/** Thin app-local wrapper around the shared `BrandedPageHeader` molecule —
 * applies the Plan Commercial brand so each page just calls `<PageShell>` and
 * gets the orange eyebrow + correct accent without repeating the values. */
export function PageShell({
  title, subtitle, actions, children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <BrandedPageHeader
      eyebrow="Plan Commercial"
      title={title}
      subtitle={subtitle}
      actions={actions}
      accent={PC_ACCENT}
      accent2={PC_ACCENT2}
    >
      <WorkflowBar />
      {children}
    </BrandedPageHeader>
  );
}
