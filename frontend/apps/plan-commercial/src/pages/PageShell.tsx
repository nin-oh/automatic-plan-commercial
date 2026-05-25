import { BrandedPageHeader } from '@amafin/ui';
import type { ReactNode } from 'react';

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
      {children}
    </BrandedPageHeader>
  );
}
