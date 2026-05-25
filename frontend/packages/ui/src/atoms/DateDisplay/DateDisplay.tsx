import type { DateDisplayProps } from './DateDisplay.types';

export function DateDisplay({
  value,
  format = 'short',
  locale = 'fr-FR',
  className = '',
}: DateDisplayProps) {
  if (!value) return <span className={className}>-</span>;

  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return <span className={className}>-</span>;

  let formatted: string;
  switch (format) {
    case 'long':
      formatted = date.toLocaleDateString(locale, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      break;
    case 'iso':
      formatted = date.toISOString().split('T')[0];
      break;
    default:
      formatted = date.toLocaleDateString(locale);
  }

  return <span className={className}>{formatted}</span>;
}
