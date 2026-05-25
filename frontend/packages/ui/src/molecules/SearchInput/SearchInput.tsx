import type { SearchInputProps } from './SearchInput.types';

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" />
    <path d="M21 21l-4.35-4.35" />
  </svg>
);

const ClearIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export function SearchInput({
  value,
  onChange,
  placeholder = 'Rechercher...',
  className = '',
}: SearchInputProps) {
  return (
    <div className={className} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <span style={{ position: 'absolute', left: '0.85rem', color: '#b2bec3', pointerEvents: 'none', display: 'flex' }}>
        <SearchIcon />
      </span>
      <input
        className="input-base"
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ paddingLeft: '2.5rem', paddingRight: value ? '2rem' : undefined }}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          style={{ position: 'absolute', right: '0.5rem', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#b2bec3', display: 'flex' }}
        >
          <ClearIcon />
        </button>
      )}
    </div>
  );
}
