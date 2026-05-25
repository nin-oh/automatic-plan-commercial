import { useState } from 'react';
import Button from '../../atoms/Button/Button';

export interface CommentEditorProps {
  value?: string;
  disabled?: boolean;
  onSave: (value: string) => Promise<void> | void;
}

export default function CommentEditor({ value, disabled = false, onSave }: CommentEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  function startEdit() {
    if (disabled) return;
    setEditing(true);
    setDraft(value || '');
  }

  function cancelEdit() {
    setEditing(false);
    setDraft('');
  }

  async function handleSave() {
    await onSave(draft);
    setEditing(false);
    setDraft('');
  }

  if (editing) {
    return (
      <div className="comment-editor__edit">
        <textarea
          autoFocus
          className="comment-editor__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="comment-editor__actions">
          <Button variant="secondary" size="sm" onClick={cancelEdit}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave}>
            Sauvegarder
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`comment-editor__display${disabled ? ' is-disabled' : ''}`}
      onClick={startEdit}
      title={disabled ? 'Non modifiable' : 'Cliquer pour modifier'}
    >
      {value ? (
        <span className="comment-editor__text">{value}</span>
      ) : (
        <span className="comment-editor__placeholder">
          {disabled ? '\u2014' : '\u2014 cliquer pour ajouter'}
        </span>
      )}
    </div>
  );
}
