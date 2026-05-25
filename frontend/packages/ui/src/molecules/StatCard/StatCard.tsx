import { CurrencyDisplay } from '../../atoms/CurrencyDisplay';
import { PercentDisplay } from '../../atoms/PercentDisplay';
import type { StatCardProps, StatCardGroupProps } from './StatCard.types';

export function StatCard({
  title,
  value,
  format = 'plain',
  locale = 'fr-MA',
  color,
  icon,
  trend,
  className = '',
}: StatCardProps) {
  let displayValue: React.ReactNode;
  if (format === 'currency') {
    displayValue = <CurrencyDisplay value={value} locale={locale} />;
  } else if (format === 'percent') {
    displayValue = <PercentDisplay value={value} />;
  } else {
    displayValue = String(value);
  }

  return (
    <div
      className={className}
      style={{
        backgroundColor: color,
        color: '#ffffff',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-sm)',
        minWidth: 180,
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', opacity: 0.9 }}>{title}</span>
        {icon && <span style={{ opacity: 0.7, fontSize: 24 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' as string }}>
        {displayValue}
      </div>
      {trend && (
        <div style={{ fontSize: 'var(--font-size-xs)', opacity: 0.8 }}>
          {trend.direction === 'up' ? '▲' : '▼'} {Math.abs(trend.value)}%
        </div>
      )}
    </div>
  );
}

export function StatCardGroup({ children, className = '' }: StatCardGroupProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--space-md)',
      }}
    >
      {children}
    </div>
  );
}
