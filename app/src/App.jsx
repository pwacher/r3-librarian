// The whole app. It holds the data (library + banks) and the actions the
// panels call. The panels themselves only draw things and call actions.

import { useEffect, useMemo, useRef, useState } from 'react';
import ConnectBar from './components/ConnectBar.jsx';
import LibraryPanel from './components/LibraryPanel.jsx';
import BankPanel from './components/BankPanel.jsx';
import * as R3 from './lib/r3.js';
import * as Lib from './lib/library.js';
import { isEditorFile, readEditorFile } from './lib/r3l.js';
import { loadState, saveState, getSetting, setSetting, download, safeFileName } from './lib/store.js';
import { useMidi } from './lib/useMidi.js';

const today = () => new Date().toISOString().slice(0, 10);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function App() {
  const [initial] = useState(loadState);
  const [db, setDb] = useState({ library: initial.library, banks: initial.banks });
  const [activeBankId, setActiveBankId] = useState(getSetting('bank', null));
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [sending, setSending] = useState(null);       // { done, total } while a bank goes out
  const [logLines, setLogLines] = useState(initial.note ? [stamp(initial.note)] : []);

  const dbRef = useRef(db);
  dbRef.current = db;
  const cancelSend = useRef(false);
  const receiving = useRef(null);                      // the bank an R3 dump is filling

  const log = (text) => setLogLines(lines => [...lines.slice(-300), stamp(text)]);

  const byId = useMemo(() => Object.fromEntries(db.library.map(p => [p.id, p])), [db.library]);
  const bank = db.banks.find(b => b.id === activeBankId) ?? db.banks[0] ?? null;

  // Save to the browser whenever something changes
  const lastSaveError = useRef(null);
  useEffect(() => {
    const err = saveState(db);
    if (err && err !== lastSaveError.current) log(`Couldn't save in this browser: ${err}. Export your library to be safe.`);
    lastSaveError.current = err;
  }, [db]);
  useEffect(() => setSetting('bank', bank?.id ?? null), [bank?.id]);

  // --- Data coming in from the R3 ---
  const onSysex = (msg, r) => {
    if (r.kind === 'loaded') return log('R3 says: data received OK.');
    if (r.kind === 'loadError') return log('R3 says: data load error. Check PROTECT is off on the R3.');
    if (r.kind === 'unknown') return log(`R3 sent data the librarian doesn't read yet (function ${r.func.toString(16).toUpperCase()}).`);
    if (r.kind !== 'program') return;

    if (!r.slot) {
      setDb(prev => Lib.importMessages(prev, [msg], 'From R3'));
      return log(`Got current patch "${r.name}" from the R3.`);
    }

    // A bank dump arrives one slot at a time. Start a new bank if this is
    // the first slot, or the last one came in a while ago.
    const now = Date.now();
    if (!receiving.current || r.slot === 1 || now - receiving.current.last > 15000) {
      const name = `From R3 ${new Date().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`;
      receiving.current = { bank: Lib.newBank(name) };
      setActiveBankId(receiving.current.bank.id);
      log(`Receiving a bank from the R3 into "${name}"...`);
    }
    receiving.current.last = now;
    const fresh = receiving.current.bank;
    setDb(prev => {
      const target = prev.banks.find(b => b.id === fresh.id) ?? fresh;
      return Lib.importMessages(prev, [msg], 'From R3', { bank: target });
    });
    if (r.slot % 16 === 0) log(`Received ${r.slot} of 128.`);
  };

  const midi = useMidi(onSysex);

  const sendOrWarn = (bytes) => {
    if (midi.send(bytes)) return true;
    log('Connect to MIDI and pick a MIDI out first.');
    return false;
  };

  // --- Actions the panels can call ---
  const actions = {
    async importFiles(files) {
      let state = dbRef.current;
      for (const file of files) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let messages;
        if (isEditorFile(bytes)) {
          // Korg editor file (.r3l bank / .r3p patch): convert to the R3's own
          // format. A bank keeps its slot order, a single patch doesn't.
          const patches = readEditorFile(bytes);
          messages = patches.length > 1
            ? patches.map((d, i) => R3.slotMessage(d, i + 1, midi.channel))
            : patches.map(d => R3.currentProgramMessage(d, midi.channel));
          if (patches.length) log(`${file.name} is a Korg editor file. Patch categories aren't saved in these, so they'll show as category 0 on the R3.`);
        } else {
          messages = R3.splitSysex(bytes);
        }
        const label = file.name.replace(/\.(syx|r3l|r3p)$/i, '');
        const r = Lib.importMessages(state, messages, label, { bankName: label });
        state = r;
        const parts = [`${r.added} new`];
        if (r.duplicates) parts.push(`${r.duplicates} already in library`);
        if (r.skipped) parts.push(`${r.skipped} not R3 patches`);
        log(`${file.name}: ${parts.join(', ')}${r.bankId ? ', made a bank' : ''}.`);
        if (r.bankId) setActiveBankId(r.bankId);
      }
      setDb({ library: state.library, banks: state.banks });
    },

    requestCurrent() {
      if (sendOrWarn(R3.requestCurrent(midi.channel))) log('Asked the R3 for its current patch.');
    },

    exportLibrary() {
      const messages = db.library.map(p => R3.currentProgramMessage(p.data, midi.channel));
      download(R3.joinMessages(messages), `r3-library-${today()}.syx`);
      log(`Exported ${messages.length} patches.`);
    },

    auditionPatch(p) {
      if (sendOrWarn(R3.currentProgramMessage(p.data, midi.channel))) {
        log(`Sent "${p.name}" to the R3 to play. Nothing on the R3 was overwritten.`);
      }
    },

    renamePatch(id, name) {
      setDb(prev => ({ ...prev, library: Lib.renamePatch(prev.library, id, name) }));
    },

    deletePatch(p) {
      const used = db.banks.filter(b => b.slots.includes(p.id)).length;
      const extra = used ? ` It's in ${used} bank(s), and those slots will be emptied.` : '';
      if (!confirm(`Remove "${p.name}" from the library?${extra}`)) return;
      setDb(prev => Lib.deletePatch(prev, p.id));
    },

    putInSelectedSlot(patchId) {
      if (!bank) return log('Make a bank first.');
      setDb(prev => ({ ...prev, banks: Lib.setSlot(prev.banks, bank.id, selectedSlot, patchId) }));
      setSelectedSlot(s => (s !== null && s < 127 ? s + 1 : s));   // move on, so you can fill slots in a row
    },

    // Bank actions
    selectBank(id) { setActiveBankId(id); setSelectedSlot(null); },
    newBank() {
      const b = Lib.newBank(`My bank ${db.banks.length + 1}`);
      setDb(prev => ({ ...prev, banks: [...prev.banks, b] }));
      setActiveBankId(b.id);
      setSelectedSlot(0);
    },
    copyBank() {
      const b = Lib.newBank(`${bank.name} copy`, bank.slots);
      setDb(prev => ({ ...prev, banks: [...prev.banks, b] }));
      setActiveBankId(b.id);
    },
    deleteBank() {
      if (!confirm(`Delete the bank "${bank.name}"? The patches stay in your library.`)) return;
      setDb(prev => ({ ...prev, banks: prev.banks.filter(b => b.id !== bank.id) }));
      setSelectedSlot(null);
    },
    renameBank(name) {
      setDb(prev => ({ ...prev, banks: Lib.updateBank(prev.banks, bank.id, () => ({ name })) }));
    },
    selectSlot: setSelectedSlot,
    setSlot(index, patchId) {
      setDb(prev => ({ ...prev, banks: Lib.setSlot(prev.banks, bank.id, index, patchId) }));
    },
    swapSlots(a, b) {
      setDb(prev => ({ ...prev, banks: Lib.swapSlots(prev.banks, bank.id, a, b) }));
    },
    saveBank() {
      const messages = Lib.bankMessages(bank, byId, midi.channel).map(m => m.message);
      download(R3.joinMessages(messages), `${safeFileName(bank.name)}.syx`);
      log(`Saved "${bank.name}" (${messages.length} patches).`);
    },

    async writeSelectedSlot() {
      const p = byId[bank.slots[selectedSlot]];
      const slot = selectedSlot + 1;
      if (!confirm(`Write "${p.name}" into slot ${slot} on the R3?\n\nWhatever is in slot ${slot} on the R3 now will be replaced. PROTECT must be off on the R3.`)) return;
      await sendSlots([{ slot, patch: p, message: R3.slotMessage(p.data, slot, midi.channel) }]);
    },

    async sendBank() {
      const list = Lib.bankMessages(bank, byId, midi.channel);
      const empty = 128 - list.length;
      const ok = confirm(
        `Send "${bank.name}" to the R3?\n\n` +
        `This replaces ${list.length} slot(s) on the R3.` +
        (empty ? ` The ${empty} empty slot(s) in this bank are left as they are on the R3.` : '') +
        `\n\nPROTECT must be off on the R3. If you haven't backed up what's on the R3, ` +
        `cancel and dump it first (SHIFT + [6], AllProg).`);
      if (ok) await sendSlots(list);
    },

    cancelSend() { cancelSend.current = true; },
  };

  // Send slot messages one at a time, waiting for the R3 to say OK after each.
  // If the R3 never replies, carry on at a safe pace.
  async function sendSlots(list) {
    cancelSend.current = false;
    setSending({ done: 0, total: list.length });
    let noReply = 0;
    for (let k = 0; k < list.length; k++) {
      if (cancelSend.current) { log(`Stopped after ${k} of ${list.length}.`); break; }
      const { slot, patch, message } = list[k];
      if (!sendOrWarn(message)) break;
      const reply = await midi.waitForReply(2000);
      if (reply === 'loadError') {
        log(`The R3 refused slot ${slot} ("${patch.name}"). Stopped. Check PROTECT is off on the R3.`);
        break;
      }
      if (reply === null) noReply++;
      setSending({ done: k + 1, total: list.length });
      if (k === list.length - 1) {
        log(list.length === 1
          ? `Wrote "${patch.name}" to R3 slot ${slot}.`
          : `Sent ${list.length} patches to the R3.`);
      }
      await sleep(50);
    }
    if (noReply) log(`The R3 didn't confirm ${noReply} of them. Check those slots on the R3.`);
    setSending(null);
  }

  return (
    <main>
      <header>
        <h1>R3 Librarian</h1>
        <ConnectBar midi={midi} />
      </header>

      <div className="columns">
        <LibraryPanel library={db.library} selectedSlot={bank ? selectedSlot : null}
                      connected={midi.connected} actions={actions} />
        <BankPanel banks={db.banks} bank={bank} byId={byId} selectedSlot={selectedSlot}
                   connected={midi.connected} sending={sending} actions={actions} />
      </div>

      <section className="panel">
        <h2>Log</h2>
        <div className="log">
          {logLines.length ? logLines.map((l, i) => <div key={i}>{l}</div>) : 'Nothing yet.'}
        </div>
      </section>
    </main>
  );
}

function stamp(text) {
  return `[${new Date().toLocaleTimeString()}] ${text}`;
}
