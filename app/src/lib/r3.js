// Everything about the R3's SysEx format lives here. No React in this file,
// so it can be tested on its own with `npm test`.
//
// Message layouts (all confirmed on Patrick's R3):
//   F0 42 3n 7D 40 [data] F7        the patch currently being played
//   F0 42 3n 7D 4C pp 00 [data] F7  one slot from a bank, pp = slot 0-127
//   F0 42 3n 7D 23 F7               R3 reply: data received OK
//   F0 42 3n 7D 24 F7               R3 reply: data load error
// n = MIDI channel minus 1. [data] is Korg's 7-bit packed patch, 456 bytes unpacked.

const KORG = 0x42;
const MODEL = 0x7D;
export const NAME_LEN = 8;
export const SLOTS = 128;

// MIDI bytes can only use 7 bits. Korg sends 8 bytes for every 7 real ones:
// the first byte of each group holds the missing top bit of the next 7.
export function unpack(packed) {
  const out = [];
  for (let i = 0; i < packed.length; i += 8) {
    const topBits = packed[i];
    for (let j = 0; j < 7 && i + 1 + j < packed.length; j++) {
      out.push(packed[i + 1 + j] | ((topBits >> j) & 1 ? 0x80 : 0));
    }
  }
  return Uint8Array.from(out);
}

// The reverse, for sending patches back to the R3
export function pack(data) {
  const out = [];
  for (let i = 0; i < data.length; i += 7) {
    const chunk = data.slice(i, i + 7);
    let topBits = 0;
    chunk.forEach((b, j) => { if (b & 0x80) topBits |= 1 << j; });
    out.push(topBits, ...Array.from(chunk, b => b & 0x7F));
  }
  return Uint8Array.from(out);
}

const isNameChar = (b) => b >= 0x20 && b <= 0x7E;

export const readName = (data) =>
  String.fromCharCode(...data.slice(0, NAME_LEN)).trimEnd();

// Return a copy of the patch with a new name (8 characters, padded with spaces)
export function setName(data, name) {
  const clean = cleanName(name).padEnd(NAME_LEN, ' ');
  const copy = Uint8Array.from(data);
  for (let i = 0; i < NAME_LEN; i++) copy[i] = clean.charCodeAt(i);
  return copy;
}

// The R3 can only show plain characters, max 8
export const cleanName = (name) =>
  Array.from(name).filter(c => isNameChar(c.charCodeAt(0))).join('').slice(0, NAME_LEN);

// Take one complete SysEx message and say what's in it
export function parse(msg) {
  if (msg[0] !== 0xF0 || msg[1] !== KORG || msg[3] !== MODEL) return { kind: 'other' };
  const channel = (msg[2] & 0x0F) + 1;
  const func = msg[4];
  const end = msg[msg.length - 1] === 0xF7 ? msg.length - 1 : msg.length;

  if (func === 0x23) return { kind: 'loaded', channel, func };
  if (func === 0x24) return { kind: 'loadError', channel, func };

  if (func === 0x40 || func === 0x4C) {
    const slot = func === 0x4C ? msg[5] + 1 : null;
    const data = unpack(msg.slice(func === 0x4C ? 7 : 5, end));
    if (!Array.from(data.slice(0, NAME_LEN)).every(isNameChar)) {
      return { kind: 'unknown', channel, func, size: data.length };
    }
    return { kind: 'program', channel, func, slot, name: readName(data), data };
  }
  return { kind: 'unknown', channel, func, size: end - 5 };
}

// A .syx file can hold many messages back to back. Split them up.
export function splitSysex(bytes) {
  const messages = [];
  let start = bytes.indexOf(0xF0);
  while (start !== -1) {
    const end = bytes.indexOf(0xF7, start);
    if (end === -1) break;
    messages.push(bytes.slice(start, end + 1));
    start = bytes.indexOf(0xF0, end);
  }
  return messages;
}

const header = (channel) => [0xF0, KORG, 0x30 | (channel - 1), MODEL];

// Load a patch into what the R3 is playing now. No slot is overwritten.
export const currentProgramMessage = (data, channel = 1) =>
  Uint8Array.from([...header(channel), 0x40, ...pack(data), 0xF7]);

// Write a patch into a slot (1-128). This DOES overwrite that slot on the R3.
export const slotMessage = (data, slot, channel = 1) =>
  Uint8Array.from([...header(channel), 0x4C, slot - 1, 0x00, ...pack(data), 0xF7]);

// Ask the R3 to send the patch it's playing now
export const requestCurrent = (channel = 1) =>
  Uint8Array.from([...header(channel), 0x10, 0xF7]);

// Glue messages together into one file
export function joinMessages(messages) {
  const out = new Uint8Array(messages.reduce((n, m) => n + m.length, 0));
  let at = 0;
  for (const m of messages) { out.set(m, at); at += m.length; }
  return out;
}

// Patch data as text, for saving in the browser and spotting duplicates
export const dataToText = (data) => btoa(String.fromCharCode(...data));
export const textToData = (text) => Uint8Array.from(atob(text), c => c.charCodeAt(0));
