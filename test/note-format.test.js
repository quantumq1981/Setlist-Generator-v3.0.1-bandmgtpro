'use strict';
// Rehearsal-note structure + stage summary (CLAUDE.md §9aq). Fixtures are verbatim notes
// recovered from a real Master Arrangement Guide import (test/fixtures/rehearsal-notes.json):
// inline "* " bullets, raw Markdown, role labels glued mid-sentence, footnotes, long prose.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const S = require('./extract-algorithm');
const FX = require('./fixtures/rehearsal-notes.json');

const kinds = (blocks) => blocks.map(b => b.type);

test('inline "* " bullets become headings + one item per idea; footnotes are separated', () => {
  const b = S.structureNoteText(FX.rack);
  const heads = b.filter(x => x.type === 'heading').map(x => x.text);
  assert.deepStrictEqual(heads, ['Tempo / Feel', 'Rehearsal Mark A - Main Groove', 'Rehearsal Mark B - Kick Placement']);
  const items = b.filter(x => x.type === 'item').map(x => x.text);
  assert.ok(items.includes('119 BPM') && items.includes('4/4 time'));
  assert.ok(items.includes('Maintain a strong snare backbeat on 2 and 4'));
  const fns = b.filter(x => x.type === 'footnote');
  assert.deepStrictEqual(fns.map(f => f.num), [1, 2, 3, 4, 5]);
  assert.ok(!b.some(x => /^footnotes$/i.test(x.text)), 'the bare "Footnotes" marker is dropped');
  assert.ok(!b.some(x => /\*/.test(x.text)), 'no stray asterisks survive');
});

test('raw Markdown (**Heading** / - **Label:**) becomes headings + labelled items', () => {
  const b = S.structureNoteText(FX.wgo);
  const heads = b.filter(x => x.type === 'heading').map(x => x.text);
  assert.ok(heads.includes('Intro'));
  assert.ok(heads.includes('Verse (12-Bar Cycle)'));
  assert.ok(heads.includes('Vamp / Interlude'));
  const bars = b.filter(x => x.type === 'item' && /^Bars \d/.test(x.label || ''));
  assert.deepStrictEqual(bars.map(x => x.label), ['Bars 1-4', 'Bars 5-8', 'Bars 9-10', 'Bars 11-12']);
  // The nested chord list ("- Emaj7 (2 bars) - the I chord - C#m7 (2 bars) …") splits per chord.
  const chordLines = b.filter(x => /\(2 bars\)/.test(x.text)).map(x => x.text.split(' ')[0]);
  assert.deepStrictEqual(chordLines, ['Emaj7', 'C#m7', 'F#m7', 'B7']);
  assert.ok(!b.some(x => /\u0002|\u0003|\*\*/.test(x.text + (x.label || ''))), 'no Markdown markers leak');
  // The closing sentence isn't fused onto the last chord line, and the quoted title survives.
  assert.ok(b.some(x => /^After playing through three verses/.test(x.text) && /"What's Going On" interlude/.test(x.text)));
});

test('role labels glued mid-sentence split into their own labelled items', () => {
  const b = S.structureNoteText(FX.sun);
  assert.deepStrictEqual(b.filter(x => x.label).map(x => x.label), ['Drums', 'Bass', 'Guitar 2']);
  assert.strictEqual(b.find(x => x.label === 'Guitar 2').text, '[Rhythm Only]');
});

test('plain prose stays prose; very long prose splits one sentence per line (not inside "…")', () => {
  assert.deepStrictEqual(kinds(S.structureNoteText('Solo section extended - don\'t go to Bridge change until cued')), ['text']);
  const b = S.structureNoteText(FX.hush);
  assert.ok(b.length >= 3);
  const quote = b.find(x => /Hey little thing/.test(x.text));
  assert.ok(/cause\.\.\. I'm so hard to handle/.test(quote.text), 'an ellipsis inside a quote is not a sentence end');
  // Chord progressions with "|" and "-" are never split apart.
  assert.strictEqual(S.structureNoteText(FX.poor)[0].text.indexOf('i - iv - i - i | iv - iv - i - i'), FX.poor.indexOf('i - iv - i - i | iv'));
});

test('formatNoteText emits clean line-per-idea text and is idempotent', () => {
  for (const key of Object.keys(FX)) {
    const once = S.formatNoteText(FX[key]);
    assert.strictEqual(S.formatNoteText(once), once, `idempotent: ${key}`);
  }
  const rack = S.formatNoteText(FX.rack).split('\n');
  assert.strictEqual(rack[0], 'Tempo / Feel:');
  assert.strictEqual(rack[1], '• 119 BPM');
  assert.ok(rack.includes('[1] Snare backbeat on 2 and 4 is the main engine of the groove.'));
  // A short single idea is left exactly as typed.
  assert.strictEqual(S.formatNoteText('[Cold Open] guitar only for two bars'), '[Cold Open] guitar only for two bars');
  assert.strictEqual(S.formatNoteText(''), '');
  assert.strictEqual(S.formatNoteText(null), '');
});

test('condenseNoteText keeps the specific cues and drops generic advice + footnotes', () => {
  const r = S.condenseNoteText(FX.rack);
  assert.ok(r.lines.length >= 2 && r.lines.length <= 5);
  const all = r.lines.join('\n');
  assert.match(all, /119 BPM/);
  assert.match(all, /snare backbeat on 2 and 4/);
  assert.doesNotMatch(all, /Prioritize cohesion|Overall vibe|\[1\]/);
  assert.ok(r.lines.every(l => l.length <= 96), 'every stage line is short');
});

test('a chord-dense section condenses to its chord cycle', () => {
  const r = S.condenseNoteText(FX.wgo);
  assert.ok(r.lines.includes('Verse (12-Bar Cycle): Emaj7 · C#m7 · F#m7 · A/B'));
  assert.ok(r.lines.some(l => /^The 1-6-2-5 "Mercy" Loop: Emaj7 · C#m7 · F#m7 · B7/.test(l)), 'quoted-lyric / verse-count asides trimmed from the heading');
  assert.ok(r.lines.length <= 5);
});

test('cue tags are collected in order, de-duplicated, never footnote refs or data markers', () => {
  assert.deepStrictEqual(S.noteCueTags('[Cold Open] then [Tag×3] then [cold open] [1] [[SLARR:0:1:x]]'), ['[Cold Open]', '[Tag×3]']);
  const r = S.condenseNoteText('[Cold Open] guitar only for two bars');
  assert.deepStrictEqual(r.cues, ['[Cold Open]']);
  assert.deepStrictEqual(r.lines, ['[Cold Open] guitar only for two bars']);
});

test('chord detection ignores the article "A" and plain capitalised words', () => {
  assert.deepStrictEqual(S.noteChordsIn('A steady groove. Emaj7 to C#m7, then A/B and D7#9; Bass line'), ['Emaj7', 'C#m7', 'A/B', 'D7#9']);
});

test('guideNoteRuns: organized / condensed / raw styles', () => {
  const org = S.guideNoteRuns(FX.rack, 'organized');
  assert.strictEqual(org[0].kind, 'heading');
  assert.ok(org.some(r => r.kind === 'item' && r.text === '119 BPM'));
  assert.ok(org.some(r => r.kind === 'fn'));
  const con = S.guideNoteRuns('[Cold Open] guitar only. Ending Cue: [Tag×3]', 'condensed');
  assert.ok(con.every(r => r.kind === 'item' || r.kind === 'cue'));
  assert.deepStrictEqual(S.guideNoteRuns(FX.rack, 'raw'), [{ kind: 'text', text: FX.rack.trim() }]);
  assert.deepStrictEqual(S.guideNoteRuns('', 'organized'), []);
  assert.deepStrictEqual(S.GUIDE_NOTE_STYLES, ['organized', 'condensed', 'raw']);
});

// Safari < 16.4 cannot even PARSE regex lookbehind, and Babel Standalone does not
// transpile it — a single one blanks the whole app on an older iPad. Keep it out.
test('no regex lookbehind anywhere in the shipped app source', () => {
  const root = path.join(__dirname, '..');
  for (const f of ['index.html', 'featureHelp.js', 'InfoModal.jsx', 'InfoTrigger.jsx']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const hit = src.match(/\(\?<[=!]/);
    assert.ok(!hit, `${f} contains a regex lookbehind near: ${hit && src.slice(hit.index - 40, hit.index + 40)}`);
  }
});
