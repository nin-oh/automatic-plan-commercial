import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface StatsChartCardProps {
  /** Title shown in the card header */
  title: string;
  /** Helper line under the title */
  subtitle?: string;
  /** Right-aligned content in the header — typically a small filter or toggle */
  toolbar?: ReactNode;
  /** Optional icon shown in a tinted square left of the title */
  icon?: ReactNode;
  /** Brand accent for the icon tint (defaults to indigo) */
  accent?: string;
  /** Fixed pixel height of the chart area. Pass `auto` to let content grow. */
  chartHeight?: number | 'auto';
  /** Animation delay for entrance */
  delay?: number;
  className?: string;
  children: ReactNode;
}

/** Card wrapper for any chart — keeps spacing, header style, and shadow
 * consistent with the rest of the design system. */
export function StatsChartCard({
  title, subtitle, toolbar, icon, accent = '#6366f1',
  chartHeight = 280, delay = 0,
  className, children,
}: StatsChartCardProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      style={{
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.03)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: '14px 18px',
          borderBottom: '1px solid #f4f4f5',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {icon && (
            <div
              style={{
                width: 32, height: 32, borderRadius: 9,
                background: `${accent}14`,
                color: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: '#18181b', fontSize: 13.5, fontWeight: 700,
                fontFamily: 'Inter, sans-serif', letterSpacing: -0.1,
              }}
            >
              {title}
            </div>
            {subtitle && (
              <div style={{ color: '#71717a', fontSize: 11.5, marginTop: 2 }}>
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {toolbar && <div style={{ flexShrink: 0 }}>{toolbar}</div>}
      </header>

      <div
        style={{
          padding: 16,
          height: chartHeight === 'auto' ? 'auto' : chartHeight + 32,
          flex: 1,
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}
