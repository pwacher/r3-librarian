# R3 Librarian

A patch librarian for the Korg R3 synth/vocoder that runs in the browser. It talks to
the R3 over MIDI (Web MIDI, so Chrome or Edge, not Safari).

- Get one patch or a whole bank off the R3
- Import `.syx` dumps and Korg R3 Editor files (`.r3l` banks, `.r3p` patches)
- Search, rename and organise patches in a library
- Build your own 128-slot banks by dragging patches into slots
- Send a patch to the R3 to hear it, or write a bank back to the R3

## Running it

Double-click `Start R3 Librarian.command`. The first run downloads what it needs, then
Chrome opens at http://localhost:8642.

Or from a terminal:

```bash
cd app
npm install
npm run dev
```

Writing patches into R3 slots needs PROTECT off, and SystemEx on in the R3's MIDIFilt page.

## Code

All the code lives in `app/src`:

- `lib/r3.js` covers the R3's SysEx format: Korg's 7-bit packing, and the dump, slot and reply messages
- `lib/r3l.js` converts Korg R3 Editor `.r3l`/`.r3p` files into the R3's own format
- `lib/library.js` holds the library and bank rules (no React)
- `lib/useMidi.js` is the MIDI connection
- `App.jsx` and `components/` are the screens

Run the tests with `npm test` in `app/`. They check the converter against a real
dump from an R3 and Korg's factory `.r3l`. Those are Korg's files, so they're not in
this repo and the tests skip without them. To run them, put an AllProg dump from your
R3 at `r3-factory-bank-2026-11-01.syx`, and the `.r3l` files from Korg's R3
Editor/Librarian download in `r3l-samples/`.

## Notes on the R3 format

- Patch data is 456 bytes, sent 7-bit packed (522 bytes on the wire)
- `F0 42 3n 7D 40 … F7` is the current patch, and `F0 42 3n 7D 4C pp 00 … F7` is slot `pp`
- The R3 replies `23` (loaded OK) or `24` (error)
- `.r3l` patches are 2304 bytes of editor data. 123 of 128 factory patches convert
  byte-for-byte; the other 5 are presets Korg changed in a later R3 update. Category
  isn't stored in `.r3l` files.
