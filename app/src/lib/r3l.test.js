// Run with: npm test
// Converts Korg's factory .r3l and compares it with a real dump from an R3.
// Both are Korg's files, so they aren't in the repo. To run these, put an
// AllProg dump at r3-factory-bank-2026-11-01.syx and Korg's .r3l files in
// r3l-samples/ (they come with Korg's R3 Editor/Librarian download).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as R3 from './r3.js';
import { readEditorFile, isEditorFile } from './r3l.js';

const project = new URL('../../../', import.meta.url);
const read = (path) => new Uint8Array(readFileSync(new URL(path, project)));
const have = (path) => existsSync(new URL(path, project));

const ready = have('r3-factory-bank-2026-11-01.syx') && have('r3l-samples/R3_FactoryPreset.r3l');
const skip = ready ? false : 'Korg sample files not in the project folder';
const dump = ready ? R3.splitSysex(read('r3-factory-bank-2026-11-01.syx')).map(m => R3.parse(m).data) : [];
const converted = ready ? readEditorFile(read('r3l-samples/R3_FactoryPreset.r3l')) : [];

// Presets Korg changed after the 2009 editor file was made
const CHANGED_BY_KORG = [7, 25, 51, 83, 96];

test('factory .r3l has 128 patches', { skip }, () => {
  assert.equal(converted.length, 128);
  assert.equal(R3.readName(converted[0]), 'Hypnotic');
});

test('converted patches match the R3 byte for byte (except Category)', { skip }, () => {
  for (let slot = 1; slot <= 128; slot++) {
    if (CHANGED_BY_KORG.includes(slot)) continue;
    const want = Uint8Array.from(dump[slot - 1]);
    want[15] &= 0xF0;   // Category isn't stored in .r3l files
    assert.deepEqual(converted[slot - 1], want, `slot ${slot} "${R3.readName(want)}"`);
  }
});

test('other editor files convert to sensible values', { skip }, () => {
  const dir = new URL('r3l-samples/', project);
  for (const file of readdirSync(dir)) {
    const bytes = read(`r3l-samples/${file}`);
    assert.ok(isEditorFile(bytes), file);
    const patches = readEditorFile(bytes);
    assert.equal(patches.length, 128, file);
    for (const d of patches) {
      const p = R3.parse(R3.currentProgramMessage(d));
      assert.equal(p.kind, 'program', `${file}: readable name`);
      for (const t of [16, 180]) {
        assert.ok(d[t + 4] <= 3 && d[t + 7] >> 6 <= 2 && (d[t + 16] & 0x0F) <= 7, `${file} ${p.name}`);
        assert.ok(d[t + 42] <= 12 && d[t + 66] <= 4 && d[t + 70] <= 4, `${file} ${p.name}`);
      }
      const bpm = d[444] | (d[445] << 8);
      assert.ok(bpm >= 20 && bpm <= 300, `${file} ${p.name} tempo ${bpm}`);
    }
  }
});
