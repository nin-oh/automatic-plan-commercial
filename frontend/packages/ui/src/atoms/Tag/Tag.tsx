import type { TagProps } from './Tag.types';

export function Tag({
  children,
  color = 'var(--color-bg-hover)',
  textColor = 'var(--color-text)',
  onRemove,
  className = '',
}: TagProps) {
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-medium)' as string,
        backgroundColor: color,
        color: textColor,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
      {onRemove && (
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'inherit',
            fontSize: '14px',
            lineHeight: 1,
            opacity: 0.6,
          }}
        >
          &times;
        </button>
      )}
    </span>
  );
}
