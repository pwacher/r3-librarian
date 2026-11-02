// R3 SysEx helpers: unpack Korg's 7-bit data and pull patch names out of dumps.
// Works in the browser (window.R3) and in Node (for testing).

const R3 = (() => {
  const KORG = 0x42;
  const MODEL = 0x7D;     // the R3's model ID, seen in our first dump
  const NAME_LEN = 8;     // "Hypnotic" fills the first 8 bytes

  // MIDI bytes can only use 7 bits. Korg sends 8 bytes for every 7 real ones:
  // the first byte of each group holds the missing top bit of the next 7.
  function unpack(packed) {
    const out = [];
    for (let i = 0; i < packed.length; i += 8) {
      const topBits = packed[i];
      for (let j = 0; j < 7 && i + 1 + j < packed.length; j++) {
        out.push(packed[i + 1 + j] | ((topBits >> j) & 1 ? 0x80 : 0));
      }
    }
    return Uint8Array.from(out);
  }

  // The reverse, for when we send patches back to the R3
  function pack(data) {
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
  const readName = (bytes, start) =>
    String.fromCharCode(...bytes.slice(start, start + NAME_LEN)).trimEnd();
  const looksLikeName = (bytes, start) =>
    Array.from(bytes.slice(start, start + NAME_LEN)).every(isNameChar);

  // Take one complete SysEx message and say what's in it.
  //   F0 42 3n 7D 40 [data] F7        = the patch currently being played
  //   F0 42 3n 7D 4C pp 00 [data] F7  = one patch from a bank dump, pp = slot (0-127)
  // A bank dump (AllProg) is 128 of the 4C messages in a row.
  function parse(msg) {
    if (msg[0] !== 0xF0 || msg[1] !== KORG || msg[3] !== MODEL) {
      return { kind: 'other' };
    }
    const channel = (msg[2] & 0x0F) + 1;
    const func = msg[4];
    const end = msg[msg.length - 1] === 0xF7 ? msg.length - 1 : msg.length;

    // Short replies the R3 sends after it receives data. These codes are the
    // usual Korg ones (same on the MS2000), not yet confirmed on the R3.
    if (func === 0x23) return { kind: 'loaded', channel, func };
    if (func === 0x24) return { kind: 'loadError', channel, func };

    if (func === 0x40 || func === 0x4C) {
      const slot = func === 0x4C ? msg[5] + 1 : null;
      const data = unpack(msg.slice(func === 0x4C ? 7 : 5, end));
      if (!looksLikeName(data, 0)) return { kind: 'unknown', channel, func, size: data.length };
      return { kind: 'program', channel, func, slot, name: readName(data, 0), data };
    }
    return { kind: 'unknown', channel, func, size: end - 5 };
  }

  // Ask the R3 to send its current program. Format from a forum post
  // quoting Korg's MIDI implementation, not yet tested on the hardware.
  const requestCurrent = (channel = 1) => [0xF0, KORG, 0x30 | (channel - 1), MODEL, 0x10, 0xF7];

  // Turn any patch message (single or from a bank) into a "current program"
  // message. The R3 loads it into what it's playing now, but nothing is
  // stored in a slot until you press WRITE on the R3. The patch data
  // itself is identical in both formats, only the header differs.
  function toCurrentProgram(msg, channel = 1) {
    const start = msg[4] === 0x4C ? 7 : 5;
    const end = msg[msg.length - 1] === 0xF7 ? msg.length - 1 : msg.length;
    return Uint8Array.from([0xF0, KORG, 0x30 | (channel - 1), MODEL, 0x40,
                            ...msg.slice(start, end), 0xF7]);
  }

  return { unpack, pack, parse, requestCurrent, toCurrentProgram };
})();

if (typeof module !== 'undefined') module.exports = R3;
