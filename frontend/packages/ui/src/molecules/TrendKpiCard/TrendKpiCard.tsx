import { motion } from 'framer-motion';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';

export interface TrendKpiCardProps {
  /** Label at the top (uppercase) */
  label: string;
  /** Big number — already formatted (e.g. "12 350") */
  value: string;
  /** Optional unit / suffix shown next to the number (e.g. "MAD", "%") */
  unit?: string;
  /** Time-series data for the sparkline. Provide values; we draw the curve. */
  series?: number[];
  /** Percent change vs previous period (positive = up, negative = down). */
  delta?: number;
  /** Hide the trend pill — use this for static numbers like "Total products" */
  hideDelta?: boolean;
  /** Icon shown in the top-left bubble */
  icon?: ReactNode;
  /** Solid accent color for the icon bubble + sparkline. Falls back to indigo. */
  accent?: string;
  /** Optional click handler — turns the card into a button with hover lift */
  onClick?: () => void;
  /** Animation delay (in seconds) for the entrance fade-up */
  delay?: number;
}

/** A KPI tile that shows a value, a small trend pill, and a sparkline at the
 * bottom. Uses recharts for the curve and framer-motion for the entrance. */
export function TrendKpiCard({
  label, value, unit,
  series = [],
  delta, hideDelta,
  icon, accent = '#6366f1',
  onClick,
  delay = 0,
}: TrendKpiCardProps) {
  const data = series.map((v, i) => ({ x: i, y: v }));
  const hasSeries = series.length > 1;
  const trendPositive = (delta ?? 0) >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={onClick ? { y: -2, boxShadow: '0 12px 28px rgba(0,0,0,0.08)' } : undefined}
      onClick={onClick}
      style={{
        position: 'relative',
        background: '#ffffff',
        border: '1px solid #e4e4e7',
        borderRadius: 14,
        padding: 16,
        cursor: onClick ? 'pointer' : 'default',
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(0,0,0,0.03), 0 6px 20px rgba(0,0,0,0.03)',
        transition: 'box-shadow 200ms',
      }}
    >
      {/* Accent stripe at top */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${accent}, ${accent}80, transparent)`,
        }}
      />

      {/* Header row: icon + label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        {icon && (
          <div
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: `${accent}1a`,
              color: accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </div>
        )}
        <div
          style={{
            color: '#71717a', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: 0.6,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      </div>

      {/* Value */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
        <span
          style={{
            color: '#18181b', fontSize: 28, fontWeight: 700,
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: -0.5,
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ color: '#71717a', fontSize: 12, fontWeight: 600 }}>
            {unit}
          </span>
        )}
      </div>

      {/* Footer row: delta pill + sparkline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 36 }}>
        {!hideDelta && delta !== undefined && (
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 999,
              background: trendPositive ? '#dcfce7' : '#fee2e2',
              color: trendPositive ? '#166534' : '#991b1b',
              fontSize: 11, fontWeight: 700,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            {trendPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {trendPositive ? '+' : ''}{delta.toFixed(1)}%
          </div>
        )}

        {hasSeries && (
          <div style={{ flex: 1, height: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`spark-${label}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="y"
                  stroke={accent}
                  strokeWidth={2}
                  fill={`url(#spark-${label})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </motion.div>
  );
}
