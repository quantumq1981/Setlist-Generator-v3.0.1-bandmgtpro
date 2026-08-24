'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');
const {
  pdfSafeText, pdfEncodeArrangementData, arrB64Decode, pdfDecodeArrangementData,
  pdfParseArrangementNotesVisible, pdfParseArrangementNotes,
  arrTitleKey, arrNoteMatchesTitle, arrApplyNoteToArrangement,
  parseArrangement, serializeArrangement,
} = algorithm;

// --- fixture builders: mimic pdfExtractRows() output -----------------------------
// row([[str, x], ...]) -> { y, items:[{str,x}] };  page(rows) -> { page, rows }
let _y = 800;
const row = (pairs) => ({ y: (_y -= 14), items: pairs.map(([str, x]) => ({ str, x })) });
const page = (rows) => ({ page: 1, rows });

// ================================================================================
// pdfSafeText — transliterate the characters jsPDF can't render (the export garbling)
// ================================================================================

test('pdfSafeText maps musical + typographic Unicode to safe ASCII', () => {
  assert.equal(pdfSafeText('A♭7 to F♯'), 'Ab7 to F#');           // ♭ ♯
  assert.equal(pdfSafeText('V7–IV7—I'), 'V7-IV7-I');             // – —
  assert.equal(pdfSafeText('“vamp” it ‘out’'), '"vamp" it \'out\''); // curly quotes
  assert.equal(pdfSafeText('build… then'), 'build... then');          // ellipsis
});

test('pdfSafeText preserves Latin-1 (accents, middot) but drops higher Unicode', () => {
  assert.equal(pdfSafeText('Nöche · café'), 'Nöche · café'); // ö · é all Latin-1
  assert.equal(pdfSafeText('emoji \u{1F3B8} gone'), 'emoji  gone');        // 🎸 dropped, no fusion
  assert.equal(pdfSafeText('thin space'), 'thin space');              // U+2009 -> normal space
  assert.equal(pdfSafeText(null), '');
});

// ================================================================================
// Embedded data block — lossless round-trip (survives ♭/♯ the visible notes can't)
// ================================================================================

test('embedded block encodes + decodes an exact arrangement (including ♭)', () => {
  const payload = [{ t: 'A♭ Song', s: 'Set 1', si: 0, pi: 2, a: { global: 'Play in A♭', drums: 'Backbeat on 2 & 4' } }];
  const lines = pdfEncodeArrangementData(payload);
  assert.ok(lines.length >= 1 && lines.every(l => /^\[\[SLARR:\d+:\d+:/.test(l)));
  const decoded = pdfDecodeArrangementData(lines.join('\n'));
  assert.equal(decoded.length, 1);
  assert.deepEqual(decoded[0], { title: 'A♭ Song', setName: 'Set 1', si: 0, pi: 2, arr: { global: 'Play in A♭', drums: 'Backbeat on 2 & 4' } });
});

test('embedded block survives multi-chunk split and out-of-order extraction', () => {
  const big = 'x'.repeat(600); // forces >1 base64 chunk
  const payload = [{ t: 'Long', s: 'Set 2', si: 1, pi: 0, a: { global: big } }];
  const lines = pdfEncodeArrangementData(payload);
  assert.ok(lines.length > 1, 'should split into multiple chunks');
  const shuffled = [...lines].reverse().join('\n');
  const decoded = pdfDecodeArrangementData(shuffled);
  assert.equal(decoded[0].arr.global, big);
});

test('pdfDecodeArrangementData returns null when no block / corrupt', () => {
  assert.equal(pdfDecodeArrangementData('just some text'), null);
  assert.equal(pdfDecodeArrangementData('[[SLARR:0:2:onlyonechunk]]'), null); // missing chunk 1 of 2
});

test('arrB64Decode is the inverse of the app’s UTF-8 base64', () => {
  // gmailB64Utf8 isn't exported here, but arrB64Decode must round-trip whatever the
  // encoder produced — verified transitively through the embedded-block test above,
  // and directly against a known standard-base64 string here.
  assert.equal(arrB64Decode('aGVsbG8='), 'hello');
  assert.equal(arrB64Decode(''), '');
  assert.equal(arrB64Decode('!!not-base64 %%'), ''); // tolerant: bad input -> ''
});

// ================================================================================
// Visible-text parser — recover notes from an Advance export's own geometry
// ================================================================================

function buildVisibleNotesPage() {
  _y = 800;
  return page([
    row([['ARRANGEMENT', 22], ['NOTES', 112]]),
    // Footnote 1 — one GENERAL note
    row([['1', 14], ['SHAKY', 28], ['GROUND', 66], ['(Set', 98], ['1)', 115]]),
    row([['GENERAL', 28], ['[OPENER]', 100], ['Establish', 146], ['groove', 185]]),
    // Footnote 2 — GENERAL that wraps, plus DRUMS
    row([['2', 14], ['CROSSROADS', 28], ['(Set', 90], ['1)', 107]]),
    row([['GENERAL', 28], ['12-bar', 100], ['blues', 150]]),
    row([['in', 100], ['A', 120], ['then', 140], ['resolve', 200]]),   // continuation
    row([['DRUMS', 28], ['syncopated', 103], ['backbeat', 151]]),
    // Footnote 3 — two-word ENDING CUE label
    row([['3', 14], ['SUPERSTITION', 28], ['(Set', 92], ['1)', 109]]),
    row([['ENDING', 28], ['CUE', 61], ['Tag', 100], ['the', 118], ['end', 160]]),
  ]);
}

test('visible parser recovers title, set, and per-role notes', () => {
  const notes = pdfParseArrangementNotesVisible([buildVisibleNotesPage()]);
  assert.equal(notes.length, 3);
  assert.deepEqual(notes[0], { num: 1, title: 'SHAKY GROUND', setName: 'Set 1', si: null, pi: null, arr: { global: '[OPENER] Establish groove' } });
  assert.equal(notes[1].title, 'CROSSROADS');
  assert.equal(notes[1].arr.global, '12-bar blues in A then resolve'); // wrapped line stitched
  assert.equal(notes[1].arr.drums, 'syncopated backbeat');
  assert.equal(notes[2].arr.endingCue, 'Tag the end');                 // 2-word label consumed
});

test('a note wrapping onto a role-like word is NOT read as a new role (indent decides)', () => {
  _y = 800;
  const pg = page([
    row([['ARRANGEMENT', 22], ['NOTES', 112]]),
    row([['1', 14], ['PEG', 28], ['(Set', 60], ['1)', 77]]),
    row([['GENERAL', 28], ['Play', 100], ['the', 130]]),
    row([['Keys', 100], ['solo', 130], ['here', 160]]),   // deep indent -> continuation, not a KEYS role
  ]);
  const notes = pdfParseArrangementNotesVisible([pg]);
  assert.equal(notes[0].arr.global, 'Play the Keys solo here');
  assert.equal(notes[0].arr.keys, undefined);
});

test('pdfParseArrangementNotes prefers the embedded block over visible text', () => {
  _y = 800;
  const embedded = pdfEncodeArrangementData([{ t: 'RIGHT', s: 'Set 1', si: 0, pi: 0, a: { global: 'from data block' } }]);
  const pg = page([
    row([['ARRANGEMENT', 22], ['NOTES', 112]]),
    row([['1', 14], ['WRONG', 28], ['(Set', 60], ['1)', 77]]),
    row([['GENERAL', 28], ['from', 100], ['visible', 130]]),
    ...embedded.map(l => row([[l, 14]])),
  ]);
  const notes = pdfParseArrangementNotes([pg]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'RIGHT');
  assert.equal(notes[0].arr.global, 'from data block');
});

// ================================================================================
// Title matching — reattaching a footnote to its song
// ================================================================================

test('arrNoteMatchesTitle matches exactly and ignores punctuation/case', () => {
  assert.ok(arrNoteMatchesTitle('Pride & Joy - Little Wing', { title: 'PRIDE & JOY - LITTLE WING', num: 2 }));
  assert.ok(arrNoteMatchesTitle('crossroads', { title: 'CROSSROADS', num: 3 }));
});

test('arrNoteMatchesTitle strips only the footnote’s own glued superscript number', () => {
  // column layout glues the superscript "11" AFTER the title; notes title is clean
  assert.ok(arrNoteMatchesTitle('MY OLD SCHOOL 11', { title: 'MY OLD SCHOOL', num: 11 }));
  assert.ok(arrNoteMatchesTitle('MY OLD SCHOOL11', { title: 'MY OLD SCHOOL', num: 11 }));
  // this app's stacked layout leaks the superscript BEFORE the title
  assert.ok(arrNoteMatchesTitle('11 MY OLD SCHOOL', { title: 'MY OLD SCHOOL', num: 11 }));
  assert.ok(arrNoteMatchesTitle('1 SHAKY GROUND', { title: 'SHAKY GROUND', num: 1 }));
  // a real trailing/leading number that is NOT this footnote's num must not be stripped
  assert.ok(!arrNoteMatchesTitle('Hey 19', { title: 'Hey', num: 5 }));
  assert.ok(!arrNoteMatchesTitle('1999', { title: '999', num: 5 }));
  // ...but "Hey 19" still matches a note whose own title is "Hey 19"
  assert.ok(arrNoteMatchesTitle('Hey 19', { title: 'Hey 19', num: 5 }));
});

test('arrTitleKey normalizes to comparable alnum', () => {
  assert.equal(arrTitleKey("Ain't Too Proud"), 'ainttooproud');
});

// ================================================================================
// Merge — apply a footnote onto a song's existing arrangement
// ================================================================================

test('arrApplyNoteToArrangement merges roles and preserves untouched ones', () => {
  const existing = serializeArrangement({ global: 'keep me', bass: 'walking line' });
  const merged = arrApplyNoteToArrangement(existing, { arr: { global: 'new general', drums: 'four on floor' } });
  const p = parseArrangement(merged);
  assert.equal(p.global, 'new general');   // imported role wins
  assert.equal(p.drums, 'four on floor');  // imported role added
  assert.equal(p.bass, 'walking line');    // untouched role preserved
});

test('arrApplyNoteToArrangement returns null for an empty note', () => {
  assert.equal(arrApplyNoteToArrangement('x', { arr: {} }), null);
  assert.equal(arrApplyNoteToArrangement('x', {}), null);
});
