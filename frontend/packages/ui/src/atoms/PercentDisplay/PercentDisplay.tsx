interface PercentDisplayProps {
  value: number | string | null | undefined;
  decimals?: number;
  colorize?: boolean;
  className?: string;
}

export function PercentDisplay({
  value,
  decimals = 2,
  colorize = false,
  className = '',
}: PercentDisplayProps) {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(num)) return <span className={className}>-</span>;

  const color = colorize
    ? num > 0 ? 'var(--color-text-success)'
    : num < 0 ? 'var(--color-text-danger)'
    : undefined
    : undefined;

  return (
    <span className={className} style={{ color, fontVariantNumeric: 'tabular-nums' }}>
      {num.toFixed(decimals)}%
    </span>
  );
}
