'use strict';
// Round-tripping a generated setlist back into the song library. Guards the fix for the
// reported bug where uploading an app-generated setlist PDF/CSV mis-mapped columns
// (Title←Key, Key←BPM) and dropped rehearsal/arrangement notes. The React import
// handlers aren't liftable, but they now delegate to these pure helpers:
//   - flattenSetlistSongs: set-aware parser output → flat library songs + reattached notes
//   - stripFootnoteNum:    remove a glued superscript footnote number from a title
//   - csvArrangementFromRow: rebuild an arrangement string from split CSV Arr* columns
const test = require('node:test');
const assert = require('node:assert');
const S = require('./extract-algorithm.js');

test('flattenSetlistSongs: flattens sets to songs with every field intact (no column shift)', () => {
  const setResult = {
    sets: [
      { name: 'Set 1', songs: [
        { title: 'SHAKY GROUND', artist: 'Delbert McClinton', key: 'E', bpm: '105', style: 'funk', duration: '4.2', vocalist: 'Chris' },
        { title: "WHAT YOU WON'T DO FOR LOVE", artist: 'Bobby Caldwell', key: 'Em', bpm: '85', style: 'smooth jazz', duration: '5', vocalist: 'ALL' },
      ] },
      { name: 'Set 2', songs: [
        { title: 'RED HOUSE', artist: 'Jimi Hendrix', key: 'A', bpm: '60', style: 'slow blues', duration: '6.1', vocalist: 'Beau' },
      ] },
    ],
    songCount: 3,
  };
  const out = S.flattenSetlistSongs(setResult, []);
  assert.strictEqual(out.length, 3, 'all songs across both sets are flattened');
  const first = out[0];
  // The core regression: title stays the title, key stays the key, bpm stays the bpm.
  assert.strictEqual(first.title, 'SHAKY GROUND');
  assert.strictEqual(first.artist, 'Delbert McClinton');
  assert.strictEqual(first.key, 'E');
  assert.strictEqual(first.bpm, '105');
  assert.strictEqual(first.style, 'funk');
  assert.strictEqual(first.duration, '4.2');
  assert.strictEqual(first.vocalist, 'Chris');
  assert.strictEqual(first.arrangement, '', 'no note ⇒ empty arrangement');
  assert.strictEqual(out[2].title, 'RED HOUSE');
});

test('flattenSetlistSongs: reattaches recovered arrangement footnotes by title', () => {
  const setResult = {
    sets: [{ name: 'Set 1', songs: [
      { title: 'SHAKY GROUND', artist: 'Delbert McClinton', key: 'E', bpm: '105', style: 'funk', duration: '4.2', vocalist: '' },
      { title: 'USE ME', artist: 'Bill Withers', key: 'E', bpm: '78', style: 'funk', duration: '3.5', vocalist: '' },
    ] }],
    songCount: 2,
  };
  const notes = [
    { num: 1, title: 'SHAKY GROUND', arr: { global: 'Keys intro 8 bars', drums: '[Drum Intro]' } },
  ];
  const out = S.flattenSetlistSongs(setResult, notes);
  const parsed = S.parseArrangement(out[0].arrangement);
  assert.strictEqual(parsed.global, 'Keys intro 8 bars', 'general note reattached');
  assert.strictEqual(parsed.drums, '[Drum Intro]', 'per-role note reattached');
  assert.strictEqual(out[1].arrangement, '', 'song with no matching note stays blank');
});

test('flattenSetlistSongs: strips the glued footnote number from a matched title', () => {
  // The stacked/column export glues the superscript footnote number onto the title.
  const setResult = {
    sets: [{ name: 'Set 1', songs: [
      { title: 'SHAKY GROUND 1', artist: 'Delbert McClinton', key: 'E', bpm: '105', style: 'funk', duration: '', vocalist: '' },
      { title: 'PRIDE & JOY - LITTLE WING2', artist: 'SRV / Hendrix', key: 'Em', bpm: '128', style: 'blues-rock', duration: '', vocalist: '' },
    ] }],
    songCount: 2,
  };
  const notes = [
    { num: 1, title: 'SHAKY GROUND', arr: { global: 'x' } },
    { num: 2, title: 'PRIDE & JOY - LITTLE WING', arr: { global: 'y' } },
  ];
  const out = S.flattenSetlistSongs(setResult, notes);
  assert.strictEqual(out[0].title, 'SHAKY GROUND', 'trailing footnote number removed');
  assert.strictEqual(out[1].title, 'PRIDE & JOY - LITTLE WING', 'footnote number removed, hyphenated title intact');
});

test('stripFootnoteNum: only removes the number when it makes the title match the note', () => {
  // A real number in the title must survive when it is not this note's footnote number.
  assert.strictEqual(S.stripFootnoteNum('25 OR 6 TO 4', { num: 7, title: '25 OR 6 TO 4' }), '25 OR 6 TO 4');
  assert.strictEqual(S.stripFootnoteNum('SUMMER OF 69 3', { num: 3, title: 'SUMMER OF 69' }), 'SUMMER OF 69');
  assert.strictEqual(S.stripFootnoteNum('SHAKY GROUND', { num: 0, title: 'SHAKY GROUND' }), 'SHAKY GROUND');
});

test('csvArrangementFromRow: rebuilds arrangement from split Arr* columns (songs-CSV export)', () => {
  const row = {
    Title: 'Billie Jean', Artist: 'Michael Jackson', Duration: '4.25', Style: 'uptempo',
    Key: 'F#m', BPM: '117', Vocalist: 'ALL', Energy: '7', Status: 'active',
    'Arr General': 'Drum machine on intro', 'Arr Drums': '', 'Arr Keys': '[Pad Swell]',
    'Arr Bass': '', 'Arr Guitar2': '', 'Arr Ending Cue': '[Hard Stop on 1]',
  };
  const arr = S.parseArrangement(S.csvArrangementFromRow(row));
  assert.strictEqual(arr.global, 'Drum machine on intro');
  assert.strictEqual(arr.keys, '[Pad Swell]');
  assert.strictEqual(arr.endingCue, '[Hard Stop on 1]');
  assert.strictEqual(arr.drums, '');
});

// Reproduces the reported bug where re-importing an app-generated setlist PDF concatenated
// two songs under one artist ("B.B. King SLOW BLUES FOR Z FROM THE 5 Chris Zemba"). The
// stacked "Stage (minimal)" export renders each arrangement footnote as its own text row —
// a lone superscript number just right of the title. Assigned by X, a footnote after a long
// title lands in the KEY column and masquerades as a song's meta line, swallowing the next
// song; after a short title it lands in TITLE and prepends its digits. Both are now dropped.
test('pdfParseBandHelperSets: footnote superscript rows never merge songs or dirty titles', () => {
  // One page of pre-grouped visual rows (as pdfExtractRows yields: {y, items:[{str,x}]}).
  const rows = [
    { y: 923, items: [ { str: '#', x: 31 }, { str: 'SONG TITLE', x: 60 }, { str: 'KEY', x: 373 }, { str: 'BPM', x: 430 }, { str: 'STYLE', x: 478 } ] },
    // Song 1 — short title, footnote "1" lands in the TITLE column (x160).
    { y: 899, items: [ { str: '1', x: 160 } ] },
    { y: 894, items: [ { str: 'SHAKY GROUND', x: 60 } ] },
    { y: 888, items: [ { str: '1', x: 30 }, { str: 'E', x: 378 }, { str: '105', x: 431 }, { str: 'funk', x: 474 } ] },
    { y: 879, items: [ { str: 'Delbert McClinton', x: 60 } ] },
    // Song 2 — no footnote.
    { y: 558, items: [ { str: 'THE THRILL IS GONE', x: 60 } ] },
    { y: 552, items: [ { str: '2', x: 30 }, { str: 'Cm', x: 373 }, { str: '70', x: 434 }, { str: 'slow blues', x: 474 } ] },
    { y: 543, items: [ { str: 'B.B. King', x: 60 } ] },
    // Song 3 — long title, footnote "6" pushed right into the KEY column (x256): the bleed trigger.
    { y: 521, items: [ { str: '6', x: 256 } ] },
    { y: 516, items: [ { str: 'SLOW BLUES FOR Z FROM THE 5', x: 60 } ] },
    { y: 510, items: [ { str: '3', x: 26 }, { str: 'G', x: 378 }, { str: '60', x: 434 }, { str: 'slow blues', x: 474 } ] },
    { y: 501, items: [ { str: 'Chris Zemba', x: 60 } ] },
  ];
  const { sets, songCount } = S.pdfParseBandHelperSets([{ page: 1, rows }]);
  assert.strictEqual(songCount, 3, 'all three songs parsed — none swallowed');
  const songs = sets[0].songs;
  assert.deepStrictEqual(songs.map(s => s.title), ['SHAKY GROUND', 'THE THRILL IS GONE', 'SLOW BLUES FOR Z FROM THE 5']);
  assert.deepStrictEqual(songs.map(s => s.artist), ['Delbert McClinton', 'B.B. King', 'Chris Zemba']);
  // The specific reported failure: the previous song's artist must not absorb the next.
  assert.ok(!songs[1].artist.includes('SLOW BLUES'), 'THE THRILL artist is not bled into');
  assert.strictEqual(songs[2].key, 'G', 'a real Key is still read (footnote did not poison it)');
});

test('csvArrangementFromRow: falls back to a single Arrangement/Notes column', () => {
  assert.strictEqual(
    S.csvArrangementFromRow({ Title: 'X', Arrangement: 'Slow intro build' }),
    'Slow intro build'
  );
  assert.strictEqual(
    S.csvArrangementFromRow({ Title: 'X', Notes: 'Follow vocalist for outro' }),
    'Follow vocalist for outro'
  );
  assert.strictEqual(S.csvArrangementFromRow({ Title: 'X', Artist: 'Y' }), '', 'no arr columns ⇒ empty');
});
