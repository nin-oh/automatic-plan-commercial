import type { ProgressBarProps } from './ProgressBar.types';

export function ProgressBar({
  value,
  max = 100,
  color = 'var(--color-primary)',
  trackColor = 'var(--color-bg-hover)',
  height = 8,
  showLabel = false,
  className = '',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className={className} style={{ width: '100%' }}>
      <div
        style={{
          width: '100%',
          height,
          backgroundColor: trackColor,
          borderRadius: height / 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: height / 2,
            transition: 'width var(--transition-normal)',
          }}
        />
      </div>
      {showLabel && (
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
          {Math.round(pct)}%
        </span>
      )}
    </div>
  );
}
