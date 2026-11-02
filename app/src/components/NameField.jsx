// A name you can click to edit. Enter or clicking away saves, Escape cancels.

import { useState } from 'react';

export default function NameField({ value, onSave, maxLength, className = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <span className={`name editable ${className}`} title="Click to rename"
            onClick={() => { setDraft(value); setEditing(true); }}>
        {value || '(no name)'}
      </span>
    );
  }

  const finish = (save) => {
    setEditing(false);
    if (save && draft.trim() && draft !== value) onSave(draft);
  };

  return (
    <input className={`name-input ${className}`} autoFocus value={draft} maxLength={maxLength}
           onChange={e => setDraft(e.target.value)}
           onBlur={() => finish(true)}
           onKeyDown={e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); }} />
  );
}
