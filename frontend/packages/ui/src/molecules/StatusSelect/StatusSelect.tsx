export interface StatusSelectProps {
  value: string;
  options: { value: string; label: string }[];
  toneByValue?: (value: string) => string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export default function StatusSelect({
  value,
  options,
  toneByValue,
  disabled = false,
  onChange,
}: StatusSelectProps) {
  const tone = toneByValue ? toneByValue(value) : '';
  return (
    <select
      className={`status-select${tone ? ` status-select--${tone}` : ''}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
