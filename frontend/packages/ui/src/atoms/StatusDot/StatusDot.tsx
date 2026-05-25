import type { StatusDotProps } from './StatusDot.types';

const colorMap: Record<string, string> = {
  active: 'var(--color-success)',
  inactive: 'var(--color-text-muted)',
  warning: 'var(--color-warning)',
  error: 'var(--color-danger)',
};

export function StatusDot({ status, label, className = '' }: StatusDotProps) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: colorMap[status],
          flexShrink: 0,
        }}
      />
      {label && <span style={{ fontSize: 'var(--font-size-sm)' }}>{label}</span>}
    </span>
  );
}
