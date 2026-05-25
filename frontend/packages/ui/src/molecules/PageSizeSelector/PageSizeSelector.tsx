interface PageSizeSelectorProps {
  value: number;
  options?: number[];
  onChange: (size: number) => void;
  className?: string;
}

export function PageSizeSelector({
  value,
  options = [10, 25, 50, 100],
  onChange,
  className = '',
}: PageSizeSelectorProps) {
  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
      <span style={{ fontSize: 'var(--font-size-caption)', color: 'var(--color-text-soft)' }}>
        Afficher
      </span>
      <select
        className="select-base"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: 'auto', padding: '0.4rem 0.6rem' }}
      >
        {options.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    </div>
  );
}
