// Right side: one bank of 128 slots. Drop patches in from the library,
// drag slots to swap them, and send the bank to the R3.

import NameField from './NameField.jsx';

const PATCH = 'application/x-r3-patch';
const SLOT = 'application/x-r3-slot';

export default function BankPanel({ banks, bank, byId, selectedSlot, connected, sending, actions }) {
  const filled = bank ? bank.slots.filter(Boolean).length : 0;
  const selectedPatch = bank && selectedSlot !== null ? byId[bank.slots[selectedSlot]] : null;

  const onDrop = (e, index) => {
    e.preventDefault();
    const patchId = e.dataTransfer.getData(PATCH);
    const from = e.dataTransfer.getData(SLOT);
    if (patchId) actions.setSlot(index, patchId);
    else if (from !== '') actions.swapSlots(Number(from), index);
  };

  return (
    <section className="panel bank">
      <div className="toolbar">
        <select value={bank?.id ?? ''} onChange={e => actions.selectBank(e.target.value)} disabled={!banks.length}>
          {!banks.length && <option value="">No banks yet</option>}
          {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <button className="quiet" onClick={actions.newBank}>New bank</button>
        {bank && <button className="quiet" onClick={actions.copyBank}>Copy</button>}
        {bank && <button className="quiet" onClick={actions.deleteBank}>Delete</button>}
      </div>

      {!bank && <p className="hint">Make a new bank, or import a bank .syx file.</p>}

      {bank && (
        <>
          <h2>
            <NameField value={bank.name} onSave={actions.renameBank} />
            <span className="hint"> {filled} of 128 slots filled</span>
          </h2>

          <div className="toolbar">
            <button onClick={actions.sendBank} disabled={!connected || !filled || sending}>Send bank to R3</button>
            <button className="quiet" onClick={actions.saveBank} disabled={!filled}>Save bank as .syx</button>
          </div>

          {sending && (
            <div className="progress">
              <div className="bar"><div style={{ width: `${(sending.done / sending.total) * 100}%` }} /></div>
              <span>Sending {sending.done} of {sending.total}. Don't touch the R3.</span>
              <button className="small quiet" onClick={actions.cancelSend}>Stop</button>
            </div>
          )}

          {selectedSlot !== null && (
            <div className="slot-bar">
              <b>Slot {selectedSlot + 1}</b>: {selectedPatch ? selectedPatch.name : 'empty'}
              {selectedPatch && <>
                <button className="small" onClick={() => actions.auditionPatch(selectedPatch)} disabled={!connected}>Send</button>
                <button className="small" onClick={actions.writeSelectedSlot} disabled={!connected || sending}>
                  Write to R3 slot {selectedSlot + 1}
                </button>
                <button className="small quiet" onClick={() => actions.setSlot(selectedSlot, null)}>Empty slot</button>
              </>}
              {!selectedPatch && <span className="hint"> Use "→ Slot" in the library, or drag a patch here.</span>}
            </div>
          )}

          <ol className="slots">
            {bank.slots.map((id, i) => {
              const p = id && byId[id];
              return (
                <li key={i}
                    className={`${p ? 'filled' : 'empty'} ${selectedSlot === i ? 'selected' : ''}`}
                    onClick={() => actions.selectSlot(selectedSlot === i ? null : i)}
                    draggable={!!p}
                    onDragStart={e => e.dataTransfer.setData(SLOT, String(i))}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => onDrop(e, i)}>
                  <span className="num">{i + 1}</span>
                  <span className="name">{p ? p.name : ''}</span>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
