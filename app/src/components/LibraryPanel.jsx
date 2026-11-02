// Left side: every patch you've imported. Search, rename, audition, and
// drag patches into a bank slot.

import { useMemo, useRef, useState } from 'react';
import NameField from './NameField.jsx';
import { NAME_LEN } from '../lib/r3.js';

export default function LibraryPanel({ library, selectedSlot, connected, actions }) {
  const [search, setSearch] = useState('');
  const [source, setSource] = useState('');
  const fileInput = useRef(null);

  const sources = useMemo(() => [...new Set(library.map(p => p.source))].sort(), [library]);
  const shown = library.filter(p =>
    (!source || p.source === source) &&
    p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <section className="panel library">
      <h2>Library <span className="hint">({library.length} patches)</span></h2>

      <div className="toolbar">
        <button onClick={() => fileInput.current.click()}>Import files</button>
        <input ref={fileInput} type="file" accept=".syx,.r3l,.r3p" multiple hidden
               onChange={e => { actions.importFiles(e.target.files); e.target.value = ''; }} />
        <button onClick={actions.requestCurrent} disabled={!connected}>Get current patch from R3</button>
        <button className="quiet" onClick={actions.exportLibrary} disabled={!library.length}>Export library</button>
      </div>

      <div className="toolbar">
        <input className="search" placeholder="Search names" value={search} onChange={e => setSearch(e.target.value)} />
        <select value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All sources</option>
          {sources.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {library.length === 0 && (
        <p className="hint">No patches yet. Import a .syx, .r3l or .r3p file, or dump from the R3:
          hold SHIFT, press [6], turn PAGE to AllProg, press [6].</p>
      )}

      <ul className="patch-list">
        {shown.map(p => (
          <li key={p.id} draggable
              onDragStart={e => e.dataTransfer.setData('application/x-r3-patch', p.id)}>
            <span className="grip" title="Drag onto a bank slot">⋮⋮</span>
            <NameField value={p.name} maxLength={NAME_LEN} onSave={name => actions.renamePatch(p.id, name)} />
            <span className="hint source">{p.source}</span>
            <span className="row-actions">
              <button className="small" onClick={() => actions.auditionPatch(p)} disabled={!connected}
                      title="Load into the R3 to hear it. Nothing on the R3 is overwritten.">Send</button>
              {selectedSlot !== null && (
                <button className="small" onClick={() => actions.putInSelectedSlot(p.id)}>
                  → Slot {selectedSlot + 1}
                </button>
              )}
              <button className="small quiet" onClick={() => actions.deletePatch(p)} title="Remove from library">✕</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
