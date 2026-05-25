export interface CurrencyDisplayProps {
  /** Numeric value to display */
  value: number | string | null | undefined;
  /** Locale for formatting (default: fr-MA) */
  locale?: string;
  /** Currency code (default: MAD) */
  currency?: string;
  /** Show currency symbol */
  showCurrency?: boolean;
  /** Decimal places (default: 2) */
  decimals?: number;
  /** Color positive green, negative red */
  colorize?: boolean;
  className?: string;
}
