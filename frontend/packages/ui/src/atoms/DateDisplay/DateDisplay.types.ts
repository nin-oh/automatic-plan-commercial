export interface DateDisplayProps {
  value: string | Date | null | undefined;
  /** Display format (default: 'short' → 02/04/2026) */
  format?: 'short' | 'long' | 'iso';
  locale?: string;
  className?: string;
}
