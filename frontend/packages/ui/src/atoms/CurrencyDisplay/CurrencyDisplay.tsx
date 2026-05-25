import type { CurrencyDisplayProps } from './CurrencyDisplay.types';

export function CurrencyDisplay({
  value,
  locale = 'fr-MA',
  currency,
  showCurrency = false,
  decimals = 2,
  colorize = false,
  className = '',
}: CurrencyDisplayProps) {
  const num = typeof value === 'string' ? parseFloat(value) : (value ?? 0);

  if (isNaN(num)) {
    return <span className={className}>-</span>;
  }

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    ...(showCurrency && currency ? { style: 'currency', currency } : {}),
  }).format(num);

  const color = colorize
    ? num > 0
      ? 'var(--color-text-success)'
      : num < 0
        ? 'var(--color-text-danger)'
        : 'var(--color-text-muted)'
    : undefined;

  return (
    <span className={className} style={{ color, fontVariantNumeric: 'tabular-nums' }}>
      {formatted}
    </span>
  );
}
