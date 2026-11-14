'use strict';
// Built-in default master library (CLAUDE.md §9ay): data integrity, the fresh-install
// seed builder, the non-destructive merge into an existing library, and the stage-sheet
// "*" marker fix in the setlist PDF parser that surfaced while building it.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./extract-algorithm.js');

const {
  MASTER_LIBRARY, DEFAULT_SONG_MINUTES, masterTitleKey, buildMasterLibrarySongs,
  mergeMasterLibrary, ENERGY_MAP, ARR_FIELDS, parseArrangement, pdfParseBandHelperSets,
} = A;

let n = 0;
const idFn = () => 'id' + (++n);

test('master library: 117 unique songs, valid styles/keys/BPM, clean text', () => {
  assert.equal(MASTER_LIBRARY.length, 117);
  const keys = new Set();
  for (const e of MASTER_LIBRARY) {
    const k = masterTitleKey(e.title);
    assert.ok(!keys.has(k), `duplicate title: ${e.title}`);
    keys.add(k);
    assert.ok(e.title && e.title === e.title.trim(), `title trimmed: ${e.title}`);
    assert.ok(!/[*…]/.test(e.title), `no marker / truncation in title: ${e.title}`);
    assert.ok(Object.prototype.hasOwnProperty.call(ENERGY_MAP, e.style), `known style: ${e.title} -> ${e.style}`);
    assert.match(e.key, /^[A-G][#b]?m?$/, `key: ${e.title}`);
    assert.ok(e.bpm === '' || /^\d{2,3}$/.test(e.bpm), `bpm: ${e.title}`);
    const text = JSON.stringify(e);
    assert.ok(!/\u0000|…/.test(text), `no NUL / ellipsis damage: ${e.title}`);
  }
});

test('master library: the 15 newest rehearsal notes are present and use real fields', () => {
  const withNotes = MASTER_LIBRARY.filter(e => e.arrangement);
  assert.equal(withNotes.length, 15);
  for (const e of withNotes) {
    const fields = Object.keys(e.arrangement);
    assert.ok(fields.length > 0);
    for (const f of fields) {
      assert.ok(ARR_FIELDS.includes(f), `${e.title}: unknown field ${f}`);
      assert.ok(String(e.arrangement[f]).trim(), `${e.title}: empty ${f}`);
    }
  }
  const slow = MASTER_LIBRARY.find(e => e.title === 'Slow Blues for Z from the 5');
  // The source note was stored as per-glyph mojibake; it must read as words.
  assert.match(slow.arrangement.global, /chromatic slide in bar 3 \(I9 - #I9 - I9\)/);
  // Every song has an artist (owner confirmed the three the July sheet left blank/guessed).
  assert.deepEqual(MASTER_LIBRARY.filter(e => !e.artist).map(e => e.title), []);
  assert.equal(MASTER_LIBRARY.find(e => e.title === 'Street Corner Symphony').artist, 'Matchbox Twenty');
  // Newest source wins on overlaps (July list had I Know a Little at 212 BPM).
  assert.equal(MASTER_LIBRARY.find(e => e.title === 'I Know a Little').bpm, '106');
});

test('masterTitleKey: ignores case/punctuation/dropped g, keeps medleys distinct', () => {
  assert.equal(masterTitleKey("Long Train Runnin'"), masterTitleKey('LONG TRAIN RUNNING'));
  assert.equal(masterTitleKey("Ain't No Sunshine"), masterTitleKey('AINT NO SUNSHINE'));
  assert.notEqual(masterTitleKey('Superstition'), masterTitleKey('Superstition / Living for the City'));
  assert.equal(masterTitleKey(''), '');
});

test('buildMasterLibrarySongs: full song objects with serialized arrangements', () => {
  const songs = buildMasterLibrarySongs(idFn);
  assert.equal(songs.length, MASTER_LIBRARY.length);
  assert.equal(new Set(songs.map(s => s.id)).size, songs.length);
  for (const s of songs) {
    assert.equal(s.status, 'active');
    assert.equal(s.duration, DEFAULT_SONG_MINUTES);
    assert.equal(typeof s.arrangement, 'string');
  }
  const weight = songs.find(s => s.title === 'The Weight');
  const arr = parseArrangement(weight.arrangement);
  assert.match(arr.intro_cue, /Walk-Down/);
  assert.match(arr.form_harmony, /Structure/);
});

test('mergeMasterLibrary: empty library gets everything', () => {
  const r = mergeMasterLibrary([], idFn);
  assert.equal(r.added, 117);
  assert.equal(r.updated, 0);
  assert.equal(r.songs.length, 117);
});

test('mergeMasterLibrary: never overwrites user data, only fills blanks', () => {
  const mine = [
    { id: 'u1', title: 'THE WEIGHT', artist: 'The Band', key: 'G', bpm: '', style: 'rock', duration: 5,
      arrangement: JSON.stringify({ drums: 'My own drum note' }) },
    { id: 'u2', title: 'My Original', artist: 'Me', key: 'C', bpm: '100', style: 'rock', duration: 3, arrangement: '' },
  ];
  const frozen = JSON.stringify(mine);
  const r = mergeMasterLibrary(mine, idFn);
  assert.equal(JSON.stringify(mine), frozen, 'input not mutated');
  assert.equal(r.added, 116);
  assert.equal(r.updated, 1);
  const w = r.songs.find(s => s.id === 'u1');
  assert.equal(w.key, 'G', 'user key kept');
  assert.equal(w.style, 'rock', 'user style kept');
  assert.equal(w.duration, 5);
  assert.equal(w.bpm, '100', 'blank BPM filled');
  const arr = parseArrangement(w.arrangement);
  assert.equal(arr.drums, 'My own drum note', 'user note kept');
  assert.match(arr.intro_cue, /Walk-Down/, 'empty note fields filled');
  assert.ok(r.songs.some(s => s.id === 'u2'), 'user-only song kept');
  // Idempotent: a second merge finds nothing to do.
  const again = mergeMasterLibrary(r.songs, idFn);
  assert.equal(again.added, 0);
  assert.equal(again.updated, 0);
});

test('pdfParseBandHelperSets: strips the stage sheet "*" guide marker from titles', () => {
  // Real row geometry from the owner's stage-sheet export (Oct 2026): the marker is its
  // own item (beside the title on a separate baseline) or glued to the title's end.
  const item = (str, x, y, w) => ({ str, x, y, w });
  const pages = [{ page: 1, rows: [
    { y: 970, items: [item('SET 1', 272.9, 970, 66.7)] },
    { y: 923.5, items: [item('#', 30.5, 923.5, 5), item('SONG TITLE', 60, 923.5, 54), item('KEY', 372.7, 923.5, 18.5), item('BPM', 430.4, 923.5, 20), item('STYLE', 477.5, 923.5, 29)] },
    { y: 899, items: [item('*', 243.8, 899, 2.7)] },
    { y: 894, items: [item('CISSY STRUT', 162.9, 894, 79.3)] },
    { y: 888.5, items: [item('1', 29.7, 888.5, 6.7), item('C', 378, 888.5, 7.9), item('93', 434.3, 888.5, 12.2), item('funk', 473.5, 888.5, 23.2)] },
    { y: 879, items: [item('The Meters', 184.8, 879, 35.4)] },
    { y: 852, items: [item("WHAT YOU WON'T DO FOR LOVE*", 110.1, 852, 190.3)] },
    { y: 846.5, items: [item('2', 29.7, 846.5, 6.7), item('Em', 376, 846.5, 12), item('85', 434.3, 846.5, 12.2), item('smooth jazz', 473.5, 846.5, 60)] },
    { y: 837, items: [item('Bobby Caldwell', 175.1, 837, 50.9)] },
  ] }];
  const titles = pdfParseBandHelperSets(pages).sets.flatMap(s => s.songs.map(x => x.title));
  assert.deepEqual(titles, ['CISSY STRUT', "WHAT YOU WON'T DO FOR LOVE"]);
});
