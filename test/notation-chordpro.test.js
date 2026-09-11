'use strict';
/*
 * Notation phase — format registry + the ChordPro engine (parse + transpose). The chord
 * transposer is the one piece with real musical logic, so it's tested hard here; the ABC /
 * MusicXML / Guitar Pro renderers are library-driven and exercised in the headless drive.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { chartExt, resolveChartFormat, transposeNote, transposeChord, parseChordProLine, parseChordPro } = algorithm;

// ── format registry ────────────────────────────────────────────────────────
test('chartExt lowercases the last extension, empty when none', () => {
  assert.equal(chartExt('Song.ChordPro'), 'chordpro');
  assert.equal(chartExt('a.b.MXL'), 'mxl');
  assert.equal(chartExt('noext'), '');
  assert.equal(chartExt(''), '');
  assert.equal(chartExt(null), '');
});

test('resolveChartFormat keys off extension first, then MIME', () => {
  assert.equal(resolveChartFormat({ name: 'x.pdf', mime: 'application/pdf' }), 'pdf');
  assert.equal(resolveChartFormat({ name: 'x.PNG' }), 'image');
  assert.equal(resolveChartFormat({ name: 'x.cho' }), 'chordpro');
  assert.equal(resolveChartFormat({ name: 'x.chordpro' }), 'chordpro');
  assert.equal(resolveChartFormat({ name: 'x.txt' }), 'chordpro');
  assert.equal(resolveChartFormat({ name: 'x.abc' }), 'abc');
  assert.equal(resolveChartFormat({ name: 'x.musicxml' }), 'musicxml');
  assert.equal(resolveChartFormat({ name: 'x.mxl' }), 'musicxml');
  assert.equal(resolveChartFormat({ name: 'x.gp5' }), 'guitarpro');
  assert.equal(resolveChartFormat({ name: 'x.gpx' }), 'guitarpro');
  assert.equal(resolveChartFormat({ name: 'x.ptb' }), 'powertab');
  // No extension → fall back to MIME.
  assert.equal(resolveChartFormat({ name: 'blob', mime: 'application/pdf' }), 'pdf');
  assert.equal(resolveChartFormat({ name: 'blob', mime: 'image/jpeg' }), 'image');
  assert.equal(resolveChartFormat({ name: 'blob', mime: 'text/plain' }), 'chordpro');
  assert.equal(resolveChartFormat({ name: 'blob', mime: 'application/xml' }), 'musicxml');
  assert.equal(resolveChartFormat({ name: 'song.mp3', mime: 'audio/mpeg' }), 'unsupported');
  assert.equal(resolveChartFormat(null), 'unsupported');
});

// ── transposeNote ────────────────────────────────────────────────────────────
test('transposeNote moves by semitones with sharp/flat spelling and wrap-around', () => {
  assert.equal(transposeNote('C', 2, false), 'D');
  assert.equal(transposeNote('C', 1, false), 'C#');
  assert.equal(transposeNote('C', 1, true), 'Db');
  assert.equal(transposeNote('B', 1, false), 'C');       // wrap up
  assert.equal(transposeNote('C', -1, false), 'B');      // wrap down
  assert.equal(transposeNote('C', -1, true), 'B');
  assert.equal(transposeNote('Bb', 2, false), 'C');      // flat input
  assert.equal(transposeNote('F#', 1, false), 'G');
  assert.equal(transposeNote('C', 12, false), 'C');      // octave = identity pitch class
  assert.equal(transposeNote('C', 0, false), 'C');
});

// ── transposeChord ─────────────────────────────────────────────────────────
test('transposeChord preserves quality/extension', () => {
  assert.equal(transposeChord('C', 2, false), 'D');
  assert.equal(transposeChord('Am7', 2, false), 'Bm7');
  assert.equal(transposeChord('Cmaj7', 2, false), 'Dmaj7');
  assert.equal(transposeChord('C#m7', 2, false), 'D#m7');
  assert.equal(transposeChord('Csus4', 5, false), 'Fsus4');
  assert.equal(transposeChord('C7(#9)', 2, false), 'D7(#9)');
});

test('transposeChord preserves and transposes a slash bass', () => {
  assert.equal(transposeChord('C/E', 2, false), 'D/F#');
  assert.equal(transposeChord('G/B', 5, false), 'C/E');
  assert.equal(transposeChord('D/F#', 1, true), 'Eb/G');
});

test('transposeChord honors flat spelling and negative/zero transpose', () => {
  assert.equal(transposeChord('A', 1, true), 'Bb');
  assert.equal(transposeChord('Am7', -2, false), 'Gm7');
  assert.equal(transposeChord('Fmaj7', 0, false), 'Fmaj7');
});

test('transposeChord passes through non-chords and empties', () => {
  assert.equal(transposeChord('N.C.', 2, false), 'N.C.');
  assert.equal(transposeChord('%', 2, false), '%');
  assert.equal(transposeChord('', 2, false), '');
  assert.equal(transposeChord(null, 2, false), null);
});

// ── parseChordProLine ────────────────────────────────────────────────────────
test('parseChordProLine splits into chord/text segments', () => {
  assert.deepEqual(parseChordProLine('[C]Hello [G]world'), [
    { chord: 'C', text: 'Hello ' },
    { chord: 'G', text: 'world' },
  ]);
  // Leading text before the first chord is a chord-less segment.
  assert.deepEqual(parseChordProLine('Oh [Am]say can you [F]see'), [
    { chord: '', text: 'Oh ' },
    { chord: 'Am', text: 'say can you ' },
    { chord: 'F', text: 'see' },
  ]);
  // A line with no chords is one plain segment.
  assert.deepEqual(parseChordProLine('just lyrics'), [{ chord: '', text: 'just lyrics' }]);
  // Trailing chord with no lyric.
  assert.deepEqual(parseChordProLine('end [C]'), [{ chord: '', text: 'end ' }, { chord: 'C', text: '' }]);
});

// ── parseChordPro ────────────────────────────────────────────────────────────
test('parseChordPro extracts directives, comments, sections and lyric lines', () => {
  const doc = parseChordPro([
    '{title: Blue Moon}',
    '{st: Rodgers & Hart}',
    '{key: C}',
    '{comment: slow swing}',
    '{soc}',
    '[C]Blue [Am]moon',
    '',
    '{eoc}',
  ].join('\n'));
  assert.equal(doc.directives.title, 'Blue Moon');
  assert.equal(doc.directives.subtitle, 'Rodgers & Hart');
  assert.equal(doc.directives.key, 'C');
  const types = doc.lines.map(l => l.type);
  assert.deepEqual(types, ['comment', 'section', 'line', 'empty', 'section-end']);
  assert.equal(doc.lines[0].text, 'slow swing');
  assert.equal(doc.lines[1].label, 'Chorus');
  assert.deepEqual(doc.lines[2].segments, [{ chord: 'C', text: 'Blue ' }, { chord: 'Am', text: 'moon' }]);
});

test('parseChordPro is empty/nullish safe', () => {
  assert.deepEqual(parseChordPro('').lines, [{ type: 'empty' }]);
  assert.deepEqual(parseChordPro(null).lines, [{ type: 'empty' }]);
});

test('a transposed ChordPro doc keeps its structure (integration of parse + transpose)', () => {
  const doc = parseChordPro('[C]Do [G/B]re [Am]mi');
  const transposed = doc.lines[0].segments.map(s => ({ chord: transposeChord(s.chord, 2, false), text: s.text }));
  assert.deepEqual(transposed, [
    { chord: 'D', text: 'Do ' },
    { chord: 'A/C#', text: 're ' },
    { chord: 'Bm', text: 'mi' },
  ]);
});
