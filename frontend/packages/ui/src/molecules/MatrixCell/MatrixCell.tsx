import { useState } from 'react';
import Input from '../../atoms/Input/Input';

export interface MatrixCellProps {
  value: number;
  editable?: boolean;
  onSave?: (newValue: number) => Promise<void> | void;
  formatValue?: (value: number) => React.ReactNode;
  colorize?: boolean;
}

export default function MatrixCell({
  value,
  editable = true,
  onSave,
  formatValue,
  colorize = true,
}: MatrixCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  function startEdit() {
    if (!editable) return;
    setDraft(String(value));
    setEditing(true);
  }

  async function commit() {
    setEditing(false);
    const num = parseFloat(draft);
    if (isNaN(num) || num === value) return;
    await onSave?.(num);
  }

  if (editing) {
    return (
      <Input
        type="number"
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
        autoFocus
        className="matrix-cell__input"
      />
    );
  }

  const color = colorize
    ? value > 0 ? 'var(--color-success)'
    : value < 0 ? 'var(--color-danger)'
    : 'var(--color-text-soft)'
    : undefined;

  return (
    <span
      className={`matrix-cell${editable ? ' matrix-cell--editable' : ''}`}
      style={{ color, fontWeight: 600 }}
      onDoubleClick={startEdit}
      title={editable ? 'Double-cliquer pour éditer' : undefined}
    >
      {formatValue ? formatValue(value) : value}
    </span>
  );
}
