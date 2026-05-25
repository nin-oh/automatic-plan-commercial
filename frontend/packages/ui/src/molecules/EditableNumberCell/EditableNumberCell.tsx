import { useState } from 'react';
import Input from '../../atoms/Input/Input';

export interface EditableNumberCellProps {
  value?: number | null;
  disabled?: boolean;
  onSave: (value: number | null) => Promise<void> | void;
}

export default function EditableNumberCell({
  value,
  disabled = false,
  onSave,
}: EditableNumberCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | number>(value ?? '');

  function startEdit() {
    if (disabled) return;
    setDraft(value ?? '');
    setEditing(true);
  }

  async function commit() {
    setEditing(false);
    if (draft === (value ?? '')) return;
    await onSave(draft === '' ? null : parseFloat(String(draft)));
  }

  if (editing) {
    return (
      <Input
        type="number"
        min="0"
        step="0.5"
        autoFocus
        className="editable-number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <span
      className={`editable-number__trigger${disabled ? ' is-disabled' : ''}`}
      onClick={startEdit}
      title={disabled ? 'Non modifiable' : 'Cliquer pour editer'}
    >
      {value == null ? (
        <span className="editable-number__placeholder">{'\u2014'}</span>
      ) : (
        value
      )}
    </span>
  );
}
