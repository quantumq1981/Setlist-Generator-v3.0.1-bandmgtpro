'use strict';
// Regression net for the 2026-10 "PDF fails in Import + Normalize but works in Gig
// Profiles" report (CLAUDE.md §9aq).
const test = require('node:test');
const assert = require('node:assert');
const S = require('./extract-algorithm');

// --- Root cause: PDF.js transfers (detaches) the buffer handed to getDocument --------
// The normalizer reads the file once, runs the notes-detection pass, then parses the same
// buffer as a song list. Without a private copy per PDF.js call the second parse saw a
// detached (0-byte) buffer and threw "Cannot perform Construct on a detached ArrayBuffer".

test('pdfDataCopy returns an independent copy, so transferring it never detaches the source', () => {
  const src = new Uint8Array([37, 80, 68, 70, 45, 49]).buffer; // "%PDF-1"
  const copy = S.pdfDataCopy(src);
  assert.ok(copy instanceof Uint8Array);
  assert.deepStrictEqual([...copy], [37, 80, 68, 70, 45, 49]);
  // Simulate PDF.js posting the data to its worker with a transfer list.
  structuredClone(copy.buffer, { transfer: [copy.buffer] });
  assert.strictEqual(copy.buffer.byteLength, 0, 'the copy was detached by the transfer');
  assert.strictEqual(src.byteLength, 6, 'the caller\'s buffer is untouched');
  // ...so a second parse of the same file still gets its bytes.
  assert.deepStrictEqual([...S.pdfDataCopy(src)], [37, 80, 68, 70, 45, 49]);
});

test('pdfDataCopy honours typed-array views (offset/length) and rejects a consumed buffer', () => {
  const big = new Uint8Array([9, 9, 1, 2, 3, 9]);
  assert.deepStrictEqual([...S.pdfDataCopy(big.subarray(2, 5))], [1, 2, 3]);
  const gone = new Uint8Array([1, 2, 3]).buffer;
  structuredClone(gone, { transfer: [gone] });
  assert.throws(() => S.pdfDataCopy(gone), /re-select the file/);
  assert.throws(() => S.pdfDataCopy('nope'), /Unsupported/);
});

// --- Secondary bug: long centered titles leaked their last word into the KEY column ---
// Geometry below is the verbatim pdf.js output for the user's Master Lifetime Song List
// (this app's stacked "Stage" export): header at KEY x=360, a 2-item title row whose
// second item sits past the Title/Key midpoint. Previously the title row was taken for
// the song's meta line (key "GOES"), clipping the title and dropping the real Key/BPM.

test('stacked parser: a title word past the Title/Key midpoint stays in the title', () => {
  const rows = [
    { y: 744, items: [{ str: '#', x: 29 }, { str: 'SONG TITLE', x: 60 }, { str: 'KEY', x: 360 }, { str: 'BPM', x: 416 }, { str: 'STYLE', x: 464 }] },
    { y: 710, items: [{ str: 'BLACK CAT BONE', x: 130 }] },
    { y: 704, items: [{ str: '1', x: 29 }, { str: 'C', x: 367 }, { str: '110', x: 415 }, { str: 'blues', x: 460 }] },
    { y: 695, items: [{ str: 'Albert Collins', x: 156 }] },
    { y: 626, items: [{ str: "THAT'S THE WAY LOVE", x: 82 }, { str: 'GOES', x: 274 }] },
    { y: 620, items: [{ str: '3', x: 29 }, { str: 'Gm', x: 362 }, { str: '98', x: 419 }, { str: 'smooth jazz', x: 460 }] },
    { y: 611, items: [{ str: 'Norman Brown', x: 162 }] },
    { y: 584, items: [{ str: "RUBY'S BLUES", x: 140 }] },
    { y: 578, items: [{ str: '4', x: 29 }, { str: 'G from V', x: 335 }, { str: '60', x: 419 }, { str: 'slow blues', x: 460 }] },
    { y: 569, items: [{ str: 'Original / Slow Blues', x: 120 }] },
  ];
  const { songCount, sets } = S.pdfParseBandHelperSets([{ page: 1, rows }]);
  assert.strictEqual(songCount, 3);
  const [a, b, c] = sets[0].songs;
  assert.deepStrictEqual([a.title, a.artist, a.key, a.bpm], ['BLACK CAT BONE', 'Albert Collins', 'C', '110']);
  assert.deepStrictEqual(
    [b.title, b.artist, b.key, b.bpm, b.style],
    ["THAT'S THE WAY LOVE GOES", 'Norman Brown', 'Gm', '98', 'smooth jazz'],
  );
  // A free-text key on a numbered meta line is still honoured as the key.
  assert.deepStrictEqual([c.title, c.key, c.bpm], ["RUBY'S BLUES", 'G from V', '60']);
});

test('bhStackedRowIsMeta: needs real meta evidence, not just a word in the KEY column', () => {
  assert.strictEqual(S.bhStackedRowIsMeta({ title: 'HOOCHIE COOCHIE', key: 'MAN' }), false);
  assert.strictEqual(S.bhStackedRowIsMeta({ title: 'WAITING ON THE WORLD', key: 'TO CHAN…' }), false);
  assert.strictEqual(S.bhStackedRowIsMeta({ num: '7', key: 'TBD', bpm: '124' }), true);
  assert.strictEqual(S.bhStackedRowIsMeta({ key: 'F#m' }), true);
  assert.strictEqual(S.bhStackedRowIsMeta({ key: 'Bb/D' }), true);
  assert.strictEqual(S.bhStackedRowIsMeta({ bpm: '98' }), true);
  assert.strictEqual(S.bhStackedRowIsMeta({}), false);
});
