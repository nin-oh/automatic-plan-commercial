import { useState, useRef, useEffect } from 'react';
import { CurrencyDisplay } from '../../atoms/CurrencyDisplay';
import { PercentDisplay } from '../../atoms/PercentDisplay';
import { DateDisplay } from '../../atoms/DateDisplay';
import type { EditableCellProps } from './EditableCell.types';

export function EditableCell({
  value,
  type,
  choices = [],
  editable = true,
  format,
  locale = 'fr-MA',
  onSave,
  className = '',
}: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if ('select' in inputRef.current) {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, [editing]);

  // Reset draft when value changes from outside
  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);

  const commitEdit = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed === String(value ?? '')) return;

    let parsed: string | number | boolean = trimmed;
    if (type === 'number') parsed = parseFloat(trimmed) || 0;
    if (type === 'checkbox') parsed = draft === 'true';
    onSave?.(parsed);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(String(value ?? ''));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  // ── Read mode ──
  if (!editing) {
    let display: React.ReactNode;

    if (type === 'checkbox') {
      display = value ? 'Oui' : 'Non';
    } else if (type === 'select') {
      const match = choices.find((c) => String(c.value) === String(value));
      display = match?.label ?? String(value ?? '-');
    } else if (type === 'date') {
      display = <DateDisplay value={value as string} />;
    } else if (type === 'number' && format === 'currency') {
      display = <CurrencyDisplay value={value as number} locale={locale} />;
    } else if (type === 'number' && format === 'percent') {
      display = <PercentDisplay value={value as number} />;
    } else {
      display = String(value ?? '-');
    }

    return (
      <span
        className={className}
        onDoubleClick={editable ? () => setEditing(true) : undefined}
        style={{ cursor: editable ? 'pointer' : 'default', display: 'block', minHeight: 20 }}
      >
        {display}
      </span>
    );
  }

  // ── Edit mode ──
  if (type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={draft === 'true'}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const val = String(e.target.checked);
          setDraft(val);
          onSave?.(e.target.checked);
          setEditing(false);
        }}
      />
    );
  }

  if (type === 'select') {
    return (
      <select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        className="select-base"
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          setDraft(e.target.value);
          onSave?.(e.target.value);
          setEditing(false);
        }}
        onBlur={cancelEdit}
        autoFocus
      >
        {choices.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      className="input-base"
      type={type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'}
      value={draft}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
      onBlur={commitEdit}
      onKeyDown={handleKeyDown}
      style={{ minWidth: 80 }}
      autoFocus
    />
  );
}
