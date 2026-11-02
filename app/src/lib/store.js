// Saving the library and banks in this browser (localStorage).
// Patch data is stored as text because localStorage only holds text.

import * as R3 from './r3.js';
import { importMessages } from './library.js';

const KEY = 'r3-librarian-v2';
const OLD_KEY = 'r3-librarian-patches';   // the list from the first version of the page

export function loadState() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const saved = JSON.parse(raw);
    const library = saved.library.map(p => {
      const data = R3.textToData(p.data);
      return { ...p, data, name: R3.readName(data) };
    });
    return { library, banks: saved.banks, note: null };
  }

  // First run of this version: bring over the list from the old page
  const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
  if (old.length) {
    const messages = old.map(o => R3.textToData(o.msg));
    const r = importMessages({ library: [], banks: [] }, messages, old[0].from || 'Old list',
                             { bankName: 'Factory bank' });
    return { library: r.library, banks: r.banks,
             note: `Brought over ${r.added} patches from the old version of the page.` };
  }
  return { library: [], banks: [], note: null };
}

// Returns an error message if the browser refused (usually storage full)
export function saveState({ library, banks }) {
  try {
    const saved = {
      library: library.map(({ id, source, addedAt, data }) => ({ id, source, addedAt, data: R3.dataToText(data) })),
      banks,
    };
    localStorage.setItem(KEY, JSON.stringify(saved));
    return null;
  } catch (err) {
    return err.message;
  }
}

// Small per-browser settings, like which MIDI ports you picked
export const getSetting = (name, fallback) => {
  try { return JSON.parse(localStorage.getItem(`r3-setting-${name}`)) ?? fallback; }
  catch { return fallback; }
};
export const setSetting = (name, value) => {
  try { localStorage.setItem(`r3-setting-${name}`, JSON.stringify(value)); } catch { /* not important */ }
};

// Save bytes to the Downloads folder
export function download(bytes, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const safeFileName = (name) => name.replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '') || 'r3';
