// Run with: npm test
// Checks the R3 code against a real bank dump from an R3. The dump is Korg's
// factory presets, so it isn't in the repo: put your own AllProg dump at
// r3-factory-bank-2026-11-01.syx in the project folder to run these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as R3 from './r3.js';

const bankFile = new URL('../../../r3-factory-bank-2026-11-01.syx', import.meta.url);
const hasBank = existsSync(bankFile);
const skip = hasBank ? false : 'no R3 factory dump in the project folder';
const messages = hasBank ? R3.splitSysex(new Uint8Array(readFileSync(bankFile))) : [];

test('factory bank has 128 readable patches', { skip }, () => {
  const patches = messages.map(R3.parse);
  assert.equal(patches.length, 128);
  assert.ok(patches.every(p => p.kind === 'program'));
  assert.equal(patches[0].name, 'Hypnotic');
  assert.equal(patches[0].slot, 1);
  assert.equal(patches[127].name, 'Audio In');
});

test('rebuilding a slot message gives back the exact bytes the R3 sent', { skip }, () => {
  for (const msg of messages) {
    const p = R3.parse(msg);
    assert.deepEqual(R3.slotMessage(p.data, p.slot, 1), msg);
  }
});

test('current program message matches the R3 format', { skip }, () => {
  const p = R3.parse(messages[0]);
  const msg = R3.currentProgramMessage(p.data, 1);
  assert.deepEqual(Array.from(msg.slice(0, 5)), [0xF0, 0x42, 0x30, 0x7D, 0x40]);
  assert.equal(msg.length, 528);
  assert.equal(R3.parse(msg).name, 'Hypnotic');
});

test('renaming changes only the name', { skip }, () => {
  const p = R3.parse(messages[0]);
  const renamed = R3.setName(p.data, 'Acid!');
  assert.equal(R3.readName(renamed), 'Acid!');
  assert.deepEqual(renamed.slice(8), p.data.slice(8));
  assert.equal(R3.cleanName('Toolongname™'), 'Toolongn');
});

test('replies are recognised', () => {
  assert.equal(R3.parse(Uint8Array.from([0xF0, 0x42, 0x30, 0x7D, 0x23, 0xF7])).kind, 'loaded');
  assert.equal(R3.parse(Uint8Array.from([0xF0, 0x42, 0x30, 0x7D, 0x24, 0xF7])).kind, 'loadError');
});
