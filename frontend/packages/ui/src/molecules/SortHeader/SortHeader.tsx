import type { SortHeaderProps } from './SortHeader.types';

export function SortHeader({ label, active, direction, onClick, className = '' }: SortHeaderProps) {
  const arrow = !active ? '⇅' : direction === 'asc' ? '↑' : '↓';
  return (
    <th
      className={className}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        padding: '10px 12px',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)' as string,
        color: 'var(--color-text-inverse)',
      }}
    >
      {label}{' '}
      <span style={{ opacity: active ? 1 : 0.4, fontSize: '0.75em' }}>{arrow}</span>
    </th>
  );
}
