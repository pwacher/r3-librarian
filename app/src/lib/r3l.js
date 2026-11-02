// Reading .r3l (bank) and .r3p (single patch) files from Korg's old R3
// Editor/Librarian, and turning each patch into the R3's own 456-byte format.
//
// File layout: a chain of sections, each starting with a 4-letter tag, then
// the header size and data size (little-endian). "510p" sections are patches:
// 32-byte header + 2304 bytes of editor data. Capital-letter tags ("510L",
// "510P", ...) are folders that just contain the sections after them.
//
// The editor stores most settings in the same bytes as the R3, just moved
// around, so most of a patch is copied across. A few settings are stored
// differently and need converting (see convertPatch). Worked out by comparing
// Korg's R3_FactoryPreset.r3l with a dump from Patrick's R3 and Korg's
// R3 MIDI Implementation: 123 of 128 factory patches convert byte-for-byte.
// The other 5 are presets Korg changed in a later R3 update.

const PATCH_SIZE = 2304;

// [R3 byte, editor byte, how many in a row] for the bytes copied as they are
const COPY = [
  [0, 0, 8], [8, 17, 1], [9, 12, 4], [13, 280, 1], [14, 20, 1], [16, 76, 4],
  [21, 57, 2], [24, 81, 5], [29, 59, 2], [33, 87, 4], [38, 92, 5], [45, 98, 12],
  [59, 112, 4], [64, 116, 4], [68, 121, 1], [70, 124, 4], [74, 129, 1], [76, 132, 4],
  [80, 137, 1], [83, 142, 2], [87, 147, 47], [134, 194, 26], [162, 222, 18],
  [180, 304, 4], [185, 285, 2], [188, 309, 5], [193, 287, 2], [197, 315, 4], [202, 320, 5],
  [209, 326, 12], [223, 340, 4], [228, 344, 4], [232, 349, 1], [234, 352, 4], [238, 357, 1],
  [240, 360, 4], [244, 365, 1], [247, 370, 2], [251, 375, 47], [298, 422, 26],
  [326, 450, 18], [344, 960, 40], [385, 1005, 1], [386, 1001, 4],
  [390, 1006, 54], [446, 1062, 4],
];

// Bytes Korg's table marks as "dummy". Filled with what the R3 itself sends.
const DUMMY = { 31: 255, 43: 255, 63: 255, 69: 255, 75: 255, 81: 255,
                195: 255, 207: 255, 227: 255, 233: 255, 239: 255, 245: 255,
                453: 255, 454: 0, 455: 0 };

const signed = (b) => (b > 127 ? b - 256 : b);

// Turn one patch of editor data (2304 bytes) into R3 data (456 bytes)
export function convertPatch(e) {
  const d = new Uint8Array(456);
  for (const [to, from, n] of COPY) for (let k = 0; k < n; k++) d[to + k] = e[from + k];
  for (const [i, v] of Object.entries(DUMMY)) d[i] = v;

  // Octave (top 4 bits). The editor doesn't save the Category, so it's 0.
  d[15] = (e[21] & 0x0F) << 4;

  // The two timbres have the same layout. Timbre 2 is 164 bytes later on
  // the R3 and 228 bytes later in the editor data.
  for (const [r, x] of [[16, 0], [180, 228]]) {
    const u = e[56 + x];
    d[r + 4] = u & 0x80 ? (u & 0x03) + 1 : 0;              // Unison: editor has an on/off bit
    d[r + 7] = Math.min(e[80 + x] >> 6, 2) << 6;             // Voice assign (editor's 3 = Poly)
    const wave = e[86 + x] & 0x0F;                           // Osc 1: editor's wave 8 = Audio In (7)
    d[r + 16] = (e[86 + x] & 0x70) | (wave === 8 ? 7 : wave);
    d[r + 21] = e[91 + x] & 0x33;                            // Osc 2 mod + wave
    d[r + 28] = e[97 + x] & 0x33;
    d[r + 41] = e[110 + x] & 0x30;                           // Drive/waveshape position
    const ws = e[110 + x] & 0x0F;                            // Waveshape: Off, Drive, then the rest
    d[r + 42] = ws === 0 ? 0 : ws === 1 ? 1 : 2 + e[111 + x];
    const lfo1 = e[140 + x];                                 // LFO waves: editor's S/H + 127 = Random
    d[r + 66] = lfo1 === 3 && e[141 + x] === 127 ? 4 : lfo1;
    d[r + 69] = e[144 + x];
    const lfo2 = e[145 + x];
    d[r + 70] = lfo2 === 3 && e[146 + x] === 127 ? 4 : lfo2;
    const seqOn = e[221 + x] & 0x80;                         // Motion seq: on/off flag moves bytes
    d[r + 144] = seqOn ? e[220 + x] : 0x40 | (e[220 + x] & 0x8F);
    d[r + 145] = e[221 + x] | 0x80;
  }

  d[384] = e[1000] ^ 0x40;                                   // Vocoder shift: -2..+2 becomes 2..6
  const bpm = Math.floor((e[1060] | (e[1061] << 8)) / 10);   // Editor saves tempo x 10
  d[444] = bpm & 0xFF;
  d[445] = bpm >> 8;
  d[450] = e[1070] & 0x7F;                                   // Arp gate time
  d[451] = (64 + (signed(e[1067]) >> 1)) & 0xFF;             // Arp swing
  let steps = 0;                                             // Arp step on/off, one bit each
  for (let b = 0; b < 8; b++) steps |= ((e[1070 + b] >> 7) & 1) << b;
  d[452] = steps;
  return d;
}

const tag = (bytes, at) => String.fromCharCode(...bytes.slice(at, at + 4));
const u32 = (bytes, at) => (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;

// Does this look like a Korg editor file?
export const isEditorFile = (bytes) => bytes.length > 12 && tag(bytes, 0).startsWith('510');

// Every patch in a .r3l or .r3p file, already converted to R3 data
export function readEditorFile(bytes) {
  const patches = [];
  let at = 0;
  while (at + 12 <= bytes.length) {
    const name = tag(bytes, at);
    if (!name.startsWith('510')) break;                      // not a section: stop
    const headerSize = u32(bytes, at + 4);
    const dataSize = u32(bytes, at + 8);
    if (headerSize < 12) break;
    const isFolder = name[3] === name[3].toUpperCase();
    if (name === '510p' && dataSize === PATCH_SIZE && at + headerSize + dataSize <= bytes.length) {
      patches.push(convertPatch(bytes.slice(at + headerSize, at + headerSize + dataSize)));
    }
    at += isFolder ? headerSize : headerSize + dataSize;
  }
  return patches;
}
