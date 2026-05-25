import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface BrandedPageHeaderProps {
  /** Small uppercase label above the title (e.g. "Plan Commercial").
   *  Pairs with `accent` for the dot + colored text. Hide by leaving empty. */
  eyebrow?: string;
  /** Main page title — large, bold */
  title: string;
  /** Description sentence under the title */
  subtitle?: string;
  /** Right-aligned action buttons */
  actions?: ReactNode;
  /** Solid accent for the eyebrow dot + label. Defaults to indigo. */
  accent?: string;
  /** Gradient stop for the eyebrow dot — defaults to a slightly-darker accent */
  accent2?: string;
  /** Wraps the entire page content. Pass null for header-only usage. */
  children?: ReactNode;
  /** Max width of the content + header — keeps text readable on wide screens */
  maxWidth?: number;
}

/** The standardized page header used across every page in every app. The
 * brand color shows up only in the eyebrow (small dot + uppercase label),
 * keeping the title itself neutral so the page hierarchy is consistent. */
export function BrandedPageHeader({
  eyebrow, title, subtitle, actions, children,
  accent = '#6366f1', accent2,
  maxWidth = 1400,
}: BrandedPageHeaderProps) {
  const dotGradient = `linear-gradient(135deg, ${accent}, ${accent2 ?? accent})`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 22,
        maxWidth, margin: '0 auto', minWidth: 0,
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
          gap: 16, paddingBottom: 14,
          borderBottom: '1px solid #e4e4e7',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {eyebrow && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              marginBottom: 8,
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: 999,
                background: dotGradient,
                boxShadow: `0 0 8px ${accent}`,
              }} />
              <span style={{
                color: accent, fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1.2,
                fontFamily: 'Inter, sans-serif',
              }}>
                {eyebrow}
              </span>
            </div>
          )}
          <h1 style={{
            margin: 0, color: '#18181b', fontSize: 26, fontWeight: 700,
            fontFamily: 'Inter, sans-serif', letterSpacing: -0.4,
            lineHeight: 1.15,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{
              margin: '8px 0 0', color: '#52525b', fontSize: 13,
              maxWidth: 720, lineHeight: 1.5,
            }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end',
          }}>
            {actions}
          </div>
        )}
      </header>
      {children}
    </motion.div>
  );
}
