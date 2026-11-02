// The librarian's data, and the rules for changing it. No React here either.
//
// library: every patch you've ever imported   [{ id, name, data, source, addedAt }]
// banks:   your 128-slot banks                 [{ id, name, slots: [patchId or null x 128] }]
// A bank slot points at a library patch, so one patch can sit in many banks.

import * as R3 from './r3.js';

const newId = () => crypto.randomUUID();

export const newBank = (name, slots = Array(R3.SLOTS).fill(null)) =>
  ({ id: newId(), name, slots: [...slots] });

// Add patch data to the library, unless an identical patch is already there.
// Returns the updated library and the id of the patch (new or existing).
export function addPatch(library, data, source) {
  const key = R3.dataToText(data);
  const existing = library.find(p => R3.dataToText(p.data) === key);
  if (existing) return { library, id: existing.id, isNew: false };
  const patch = { id: newId(), name: R3.readName(data), data, source, addedAt: Date.now() };
  return { library: [...library, patch], id: patch.id, isNew: true };
}

// Import a set of SysEx messages (from a file or the R3).
// Patches go into the library. Slot messages also fill a bank: `bank` if
// given, otherwise a new bank called `bankName` is made when needed.
export function importMessages({ library, banks }, messages, source, { bank = null, bankName } = {}) {
  let added = 0, duplicates = 0, skipped = 0;
  let target = bank ? { ...bank, slots: [...bank.slots] } : null;

  for (const msg of messages) {
    const r = R3.parse(msg);
    if (r.kind !== 'program') { skipped++; continue; }
    const result = addPatch(library, r.data, source);
    library = result.library;
    result.isNew ? added++ : duplicates++;
    if (r.slot) {
      if (!target) target = newBank(bankName || source);
      target.slots[r.slot - 1] = result.id;
    }
  }

  if (target) {
    banks = banks.some(b => b.id === target.id)
      ? banks.map(b => (b.id === target.id ? target : b))
      : [...banks, target];
  }
  return { library, banks, bankId: target?.id ?? null, added, duplicates, skipped };
}

export function renamePatch(library, id, name) {
  return library.map(p => {
    if (p.id !== id) return p;
    const data = R3.setName(p.data, name);
    return { ...p, data, name: R3.readName(data) };
  });
}

// Remove a patch from the library and empty any bank slots that used it
export function deletePatch({ library, banks }, id) {
  return {
    library: library.filter(p => p.id !== id),
    banks: banks.map(b => ({ ...b, slots: b.slots.map(s => (s === id ? null : s)) })),
  };
}

export const updateBank = (banks, id, change) =>
  banks.map(b => (b.id === id ? { ...b, ...change(b) } : b));

export function setSlot(banks, bankId, index, patchId) {
  return updateBank(banks, bankId, b => {
    const slots = [...b.slots];
    slots[index] = patchId;
    return { slots };
  });
}

export function swapSlots(banks, bankId, a, b) {
  return updateBank(banks, bankId, bank => {
    const slots = [...bank.slots];
    [slots[a], slots[b]] = [slots[b], slots[a]];
    return { slots };
  });
}

// Every filled slot as a ready-to-send slot message, in slot order
export function bankMessages(bank, byId, channel) {
  return bank.slots
    .map((id, i) => (id && byId[id] ? { slot: i + 1, patch: byId[id] } : null))
    .filter(Boolean)
    .map(({ slot, patch }) => ({ slot, patch, message: R3.slotMessage(patch.data, slot, channel) }));
}
