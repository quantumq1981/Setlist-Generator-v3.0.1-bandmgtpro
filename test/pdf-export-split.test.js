'use strict';
/*
 * Decoupled PDF export: notation sanitizer, sectioned note schema, the two pure
 * export models, and the two render pipelines (driven through a recording stub
 * jsPDF, so the suite stays dependency-free).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');
const {
  sanitizeNotation, repairNotationMojibake, repairRomanChain,
  ARR_SECTIONS, ARR_SECTION_LABELS, ARR_FIELDS,
  parseArrangement, serializeArrangement, hasArrangementData,
  classifyArrLine, deriveArrangementSections,
  buildStageSetlistModel, buildArrangementGuideModel,
  generateStageSetlistPDF, generateArrangementGuidePDF,
  pdfExportFilename, PDF_DOC_KINDS, PDF_DOC_LABELS,
  arrRowText, pdfParseArrangementGuideVisible, pdfParseArrangementNotes,
  arrApplyNoteToArrangement, mergeArrangementFillEmpty,
} = algorithm;

// ================================================================================
// 1. sanitizeNotation — repairing what older exports mangled
// ================================================================================
// jsPDF's Latin-1 fonts emit the two raw bytes of any codepoint above U+00FF, so
// U+2160 (I) left the old exports as "!`" and U+266D (flat) as "&m". These are the
// verbatim strings from the user's reference PDFs.

test('roman-numeral byte pairs are decoded back to ASCII numerals', () => {
  assert.equal(sanitizeNotation('!`-!c-!d'), 'I-IV-V');
  assert.equal(sanitizeNotation('conventional !` !c !d blues pattern'),
    'conventional I IV V blues pattern');
  assert.equal(sanitizeNotation('(!` -!e7- !a7-!d7)'), '(I -VI7- II7-V7)');
  assert.equal(sanitizeNotation('vamp ( !`M7 - iim7 )'), 'vamp ( IM7 - iim7 )');
});

test('accidental byte pairs are decoded; the ampersand pass runs before the bang pass', () => {
  assert.equal(sanitizeNotation('bars 7 to 8 (!`- iim7 -&miiim7)'),
    'bars 7 to 8 (I- iim7 -biiim7)');
  // "&o!`9" is #I9 — only decodable if '&' is resolved first, leaving a non-word
  // character in front of the '!'.
  assert.equal(sanitizeNotation('slide in bar 3 (&o!`9 - !`9)'), 'slide in bar 3 (#I9 - I9)');
});

test('a partially damaged progression is repaired inside the chain only', () => {
  // The user's own example: one token kept its escape, its neighbours did not.
  assert.equal(sanitizeNotation('!e7-a7-1d7'), 'VI7-II7-V7');
  // ...but a bare word is never rewritten just because it follows a hyphen.
  assert.equal(sanitizeNotation('slow-burn set'), 'slow-burn set');
});

test('prose containing & or ! is left alone', () => {
  assert.equal(sanitizeNotation('R&B and Chris & The Band'), 'R&B and Chris & The Band');
  assert.equal(sanitizeNotation('Stop! now'), 'Stop! now');
  assert.equal(sanitizeNotation('Hit it!maybe'), 'Hit it!maybe');
});

test('per-glyph NUL interleaving (UTF-16 bytes drawn one at a time) is undone', () => {
  const mangle = (s) => [...s].map(c => {
    const n = c.codePointAt(0);
    return String.fromCharCode(n >> 8) + String.fromCharCode(n & 0xff);
  }).join('');
  assert.equal(sanitizeNotation(mangle('Cold open, band in on the Ⅳ')),
    'Cold open, band in on the IV');
});

test('genuine Unicode notation is normalised to drawable ASCII', () => {
  assert.equal(sanitizeNotation('A♭7 … F♯m7'), 'Ab7 ... F#m7');
  assert.equal(sanitizeNotation('Ⅵ⁷ – Ⅱ⁷'), 'VI7 - II7');
  assert.equal(sanitizeNotation('ⅰⅰⅰm7'), 'iiim7');
  assert.equal(sanitizeNotation('C𝄪 and D𝄫'), 'Cx and Dbb');
  assert.equal(sanitizeNotation('CΔ chord'), 'Cmaj chord');
});

test('output is always Latin-1 safe and whitespace-tidy', () => {
  const out = sanitizeNotation('  a　 b   c \r\n\r\n\r\n d中 ');
  assert.equal(out, 'a b c\n\nd');
  assert.ok(!/[^\x09\x0a\x0d\x20-\xff]/.test(out));
});

test('sanitizeNotation is idempotent and null-safe', () => {
  const once = sanitizeNotation('!`-!c-!d and A♭7');
  assert.equal(sanitizeNotation(once), once);
  assert.equal(sanitizeNotation(null), '');
  assert.equal(sanitizeNotation(undefined), '');
  assert.equal(repairNotationMojibake(null), '');
  assert.equal(repairRomanChain(null), '');
});

// ================================================================================
// 2. Sectioned note schema
// ================================================================================

test('the four sections round-trip through serialize/parse', () => {
  const obj = {
    intro_cue: 'Cold open', form_harmony: 'Quick-IV in bar 2',
    transition_outro: 'Tag 4x', general_notes: 'Opener',
  };
  const round = parseArrangement(serializeArrangement(obj));
  ARR_SECTIONS.forEach(s => assert.equal(round[s], obj[s]));
  assert.ok(hasArrangementData(serializeArrangement(obj)));
});

test('a lone free-text note still serialises as a plain string (legacy shape kept)', () => {
  assert.equal(serializeArrangement({ global: 'just a note' }), 'just a note');
  assert.equal(parseArrangement('just a note').global, 'just a note');
  assert.equal(parseArrangement('').intro_cue, '');
  assert.deepEqual(ARR_FIELDS.slice(-4), ARR_SECTIONS);
});

test('roles and sections coexist without either clobbering the other', () => {
  const s = serializeArrangement({ drums: 'Fill on 8', form_harmony: 'I-IV-V' });
  const p = parseArrangement(s);
  assert.equal(p.drums, 'Fill on 8');
  assert.equal(p.form_harmony, 'I-IV-V');
});

test('classifyArrLine routes each kind of directive', () => {
  assert.equal(classifyArrLine('[Cold Open]'), 'intro_cue');
  assert.equal(classifyArrLine('[OPENER] Establish groove before vocal.'), 'intro_cue');
  assert.equal(classifyArrLine('feature a cold guitar opening'), 'intro_cue');
  // A leading tag is authoritative: "Ending"/"Segue" wins over the later "intro".
  assert.equal(classifyArrLine('[Ending is Direct Segue] Into red House intro'), 'transition_outro');
  assert.equal(classifyArrLine('[Tag x 3] The intro line'), 'transition_outro');
  assert.equal(classifyArrLine('[CLOSER] Extended vamp - end on visual cue.'), 'transition_outro');
  // Harmony beats cue words in free prose: "starts with the V chord" is form.
  assert.equal(classifyArrLine('Slow blues in the key of G starts with the V chord'), 'form_harmony');
  assert.equal(classifyArrLine('16-bar minor blues: i - iv - i - i'), 'form_harmony');
  assert.equal(classifyArrLine('The arrangement is exactly like the record'), 'general_notes');
  assert.equal(classifyArrLine('   '), null);
});

test('legacy role prose is derived into sections, repaired before it is classified', () => {
  const arrangement = serializeArrangement({
    global: '[Cold Open]\nReturning to conventional !`-!c-!d form after the solos\nThe arrangement is like the record',
    drums: '[Drum Intro]',
    endingCue: 'Tag the pre-chorus 4X end on I',
  });
  const secs = deriveArrangementSections(arrangement);
  assert.equal(secs.intro_cue, '[Cold Open]\nDrums: [Drum Intro]');
  // Repaired to "I-IV-V" first, which is what makes it classifiable as harmony.
  assert.equal(secs.form_harmony, 'Returning to conventional I-IV-V form after the solos');
  assert.equal(secs.transition_outro, 'Ending Cue: Tag the pre-chorus 4X end on I');
  assert.equal(secs.general_notes, 'The arrangement is like the record');
});

test('explicit sections always win over derivation', () => {
  const arrangement = serializeArrangement({
    global: 'bars 7 to 8 substitutions',
    form_harmony: 'Quick-IV, Stormy Monday subs',
  });
  const secs = deriveArrangementSections(arrangement);
  assert.equal(secs.form_harmony, 'Quick-IV, Stormy Monday subs');
  assert.equal(secs.general_notes, '');   // the role text is NOT folded in
});

// ================================================================================
// 3. Export models
// ================================================================================

const SETS = () => ([{
  name: 'Set 1', totalTime: 62,
  songs: [
    { id: 'a', title: 'Shaky Ground', artist: 'Temptations', key: 'E', bpm: '104', style: 'funk',
      arrangement: '[OPENER] Establish groove before vocal.' },
    { id: 'b', title: 'Slow Blues for Z', key: 'G', bpm: '62', style: 'slow blues',
      arrangement: 'standard 12 bar !`-!c-!d Pattern' },
    { id: 'c', title: 'Cold Shot', artist: 'SRV', key: 'Em', bpm: '108', style: 'blues', arrangement: '' },
  ],
}, {
  name: 'Set 2', totalTime: 30,
  songs: [
    { id: 'd', title: 'Whipping Post', key: 'Am', bpm: '96', style: 'rock',
      arrangement: serializeArrangement({
        intro_cue: 'Bass intro, 11/8 figure',
        transition_outro: '[CLOSER] Extended vamp – end on visual cue.',
        drums: 'Half-time at the bridge',
      }) },
  ],
}]);

test('the stage model keeps every song and carries no arrangement prose', () => {
  const m = buildStageSetlistModel(SETS(), { includeCues: false });
  assert.equal(m.length, 2);
  assert.deepEqual(m[0].songs.map(s => s.no), [1, 2, 3]);
  assert.equal(m[0].name, 'SET 1');
  assert.ok(m[0].songs.every(s => s.cue === ''), 'no cue text without includeCues');
  assert.deepEqual(m[0].songs.map(s => s.hasNotes), [true, true, false]);
  // Sanitised on the way out, even on the stage sheet.
  assert.ok(!m[0].songs.some(s => /!`/.test(JSON.stringify(s))));
});

test('the stage model emits one short cue per song when cues are requested', () => {
  const m = buildStageSetlistModel(SETS(), { includeCues: true });
  const cue = m[0].songs[0].cue;
  assert.ok(cue.length > 0 && cue.length <= 41, 'cue is a tag, not a paragraph: ' + cue);
  assert.ok(!/\n/.test(cue));
});

test('the guide model only holds songs with notes and is fully sanitised', () => {
  const g = buildArrangementGuideModel(SETS(), {});
  assert.equal(g.length, 3);                       // Cold Shot has no notes
  assert.deepEqual(g.map(e => e.songNo), [1, 2, 1]);
  assert.deepEqual(g.map(e => e.setIdx), [0, 0, 1]);
  assert.deepEqual(g.map(e => e.num), [1, 2, 3]);
  const slow = g[1];
  assert.match(slow.sections.map(s => s.text).join(' '), /I-IV-V/);
  assert.ok(!/!`/.test(JSON.stringify(g.map(e => e.sections))));
  assert.equal(slow.arr.global, 'standard 12 bar !`-!c-!d Pattern',
    'the raw note is preserved for the lossless embedded block');
});

test('derived sections suppress the role block so no note is printed twice', () => {
  const g = buildArrangementGuideModel(SETS(), {});
  const derived = g[0];
  assert.equal(derived.derivedFromRoles, true);
  assert.deepEqual(derived.roles, [], 'roles would only repeat the derived sections');
  const explicit = g[2];                            // Whipping Post has explicit sections
  assert.equal(explicit.derivedFromRoles, false);
  assert.deepEqual(explicit.roles.map(r => r.label), ['Drums']);
  assert.deepEqual(explicit.sections.map(s => s.key), ['intro_cue', 'transition_outro']);
  assert.equal(explicit.sections[1].text, '[CLOSER] Extended vamp - end on visual cue.');
});

test('the guide model honours a role filter and survives empty input', () => {
  const g = buildArrangementGuideModel(SETS(), { roleFilter: new Set(['global']) });
  assert.deepEqual(g[2].roles, []);                 // 'drums' filtered out
  assert.deepEqual(buildArrangementGuideModel([], {}), []);
  assert.deepEqual(buildArrangementGuideModel(null, {}), []);
  assert.deepEqual(buildStageSetlistModel(null, {}), []);
});

// ================================================================================
// 4. Render pipelines (recording stub jsPDF — no dependency)
// ================================================================================
// The stub records every text draw with its position and the font size in force, so
// the tests can assert on what actually lands on the page.

function stubJsPDF(w = 612, h = 792) {
  const calls = { text: [], pages: 1, images: 0 };
  let size = 12;
  function Doc() {}
  Doc.prototype.internal = { pageSize: { getWidth: () => w, getHeight: () => h } };
  const noop = () => {};
  ['setFillColor', 'setDrawColor', 'setTextColor', 'setLineWidth', 'rect', 'roundedRect',
    'line', 'setFont', 'saveGraphicsState', 'restoreGraphicsState', 'setGState'].forEach(m => { Doc.prototype[m] = noop; });
  Doc.prototype.GState = function () {};
  Doc.prototype.setFontSize = function (n) { size = n; };
  Doc.prototype.getTextWidth = function (t) { return String(t).length * size * 0.5; };
  Doc.prototype.splitTextToSize = function (t, maxW) {
    const per = Math.max(1, Math.floor(maxW / (size * 0.5)));
    const out = [];
    String(t).split('\n').forEach(para => {
      let rest = para;
      if (!rest) { out.push(''); return; }
      while (rest.length > per) { out.push(rest.slice(0, per)); rest = rest.slice(per); }
      out.push(rest);
    });
    return out;
  };
  Doc.prototype.addPage = function () { calls.pages++; };
  Doc.prototype.addImage = function () { calls.images++; };
  Doc.prototype.text = function (t, x, y) {
    (Array.isArray(t) ? t : [t]).forEach((ln, i) =>
      calls.text.push({ str: String(ln), x, y: y + i * size, size, page: calls.pages }));
  };
  Doc.prototype.output = function () { return new ArrayBuffer(0); };
  Doc.prototype.save = function (n) { calls.saved = n; };
  Doc.calls = calls;
  return Doc;
}
const drawn = (Doc) => Doc.calls.text.map(t => t.str).join('\n');

const CTX = (Doc, over) => ({
  jsPDF: Doc, ps: {}, bandName: 'The Late Shift', eventLabel: 'Sand Dollar - Fri',
  setlistTitle: '2 sets', watermarkImg: null, includeCues: false, ...over,
});

test('the stage document renders every song and no arrangement prose', () => {
  const Doc = stubJsPDF();
  const model = buildStageSetlistModel(SETS(), { includeCues: false });
  generateStageSetlistPDF(model, CTX(Doc, { summary: { guideCount: 3 } }));
  const text = drawn(Doc);
  assert.match(text, /SHAKY GROUND/);
  assert.match(text, /WHIPPING POST/);
  assert.match(text, /SETLIST SUMMARY/);
  assert.doesNotMatch(text, /ARRANGEMENT NOTES/);
  assert.doesNotMatch(text, /Establish groove/);
  assert.doesNotMatch(text, /12 bar/);
  assert.doesNotMatch(text, /Extended vamp/);
  assert.match(text, /separate document/, 'the summary points at the guide');
});

test('the stage document adds one cue line per song in cue mode, still no prose', () => {
  const Doc = stubJsPDF();
  generateStageSetlistPDF(buildStageSetlistModel(SETS(), { includeCues: true }),
    CTX(Doc, { includeCues: true }));
  const text = drawn(Doc);
  assert.match(text, /Establish groove/);
  // A cue is a tag, never the note: only the first 40 characters ever reach the stage.
  const long = [{ name: 'Set 1', totalTime: 5, songs: [{ id: 'x', title: 'Long', key: 'A',
    arrangement: 'Stormy Monday substitutions in bars 7 to 8 then a dominant turnaround' }] }];
  const Doc2 = stubJsPDF();
  generateStageSetlistPDF(buildStageSetlistModel(long, { includeCues: true }),
    CTX(Doc2, { includeCues: true }));
  assert.doesNotMatch(drawn(Doc2), /dominant turnaround/, 'the long note is still guide-only');
});

test('the guide document renders the header, columns, set bands and sections', () => {
  const Doc = stubJsPDF();
  generateArrangementGuidePDF(buildArrangementGuideModel(SETS(), {}), CTX(Doc));
  const text = drawn(Doc);
  assert.match(text, /MASTER ARRANGEMENT GUIDE/);
  assert.match(text, /The Late Shift/);
  assert.match(text, /Sand Dollar - Fri/);
  assert.match(text, /SONG # & TITLE/);
  assert.match(text, /KEY \/ BPM \/ STYLE/);
  assert.match(text, /ARRANGEMENT & HARMONIC DIRECTIVES/);
  assert.match(text, /^SET 1$/m);
  assert.match(text, /^SET 2$/m);
  ARR_SECTIONS.forEach(s => { /* labels are drawn uppercase */ });
  assert.match(text, /INTRO \/ CUE/);
  assert.match(text, /FORM & HARMONY/);
  assert.match(text, /TRANSITION \/ OUTRO/);
  assert.match(text, /I-IV-V/, 'repaired notation reaches the page');
  assert.doesNotMatch(text, /!`/);
});

test('the guide lays columns out without overlap, at every page size', () => {
  for (const [w, h] of [[612, 792], [842, 595], [595, 842]]) {
    const Doc = stubJsPDF(w, h);
    generateArrangementGuidePDF(buildArrangementGuideModel(SETS(), {}), CTX(Doc));
    const xs = [...new Set(Doc.calls.text.map(t => Math.round(t.x)))].sort((a, b) => a - b);
    assert.ok(xs.every(x => x >= 0 && x < w), `every draw inside the page at ${w}x${h}`);
    // Directive text must start right of the key/BPM column, never on top of it.
    const directive = Doc.calls.text.find(t => /^I-IV-V|^standard 12 bar/.test(t.str));
    const keyCell = Doc.calls.text.find(t => t.str === '62 BPM');
    if (directive && keyCell) assert.ok(directive.x > keyCell.x, 'directives sit in column C');
  }
});

test('the guide paginates rather than overflowing the page', () => {
  const many = [{
    name: 'Set 1', totalTime: 200,
    songs: Array.from({ length: 30 }, (_, i) => ({
      id: 's' + i, title: 'Song ' + i, key: 'A', bpm: '100', style: 'blues',
      arrangement: serializeArrangement({
        form_harmony: 'bars 7 to 8 substitutions repeated at length '.repeat(4),
      }),
    })),
  }];
  const Doc = stubJsPDF();
  generateArrangementGuidePDF(buildArrangementGuideModel(many, {}), CTX(Doc));
  assert.ok(Doc.calls.pages > 1, 'a long guide spans pages');
  assert.ok(Doc.calls.text.every(t => t.y > 0 && t.y < 792), 'nothing is drawn off-page');
  const headers = Doc.calls.text.filter(t => t.str === 'MASTER ARRANGEMENT GUIDE').length;
  // Every content page carries the header band; the embedded data block may spill onto
  // one further page of its own (drawn white at 1pt, so it is not a content page).
  assert.ok(headers >= Doc.calls.pages - 1, `headers ${headers} vs pages ${Doc.calls.pages}`);
});

test('the guide never lays a background graphic under the directives', () => {
  const Doc = stubJsPDF();
  generateArrangementGuidePDF(buildArrangementGuideModel(SETS(), {}),
    CTX(Doc, { watermarkImg: 'data:image/png;base64,AAAA' }));
  assert.equal(Doc.calls.images, Doc.calls.pages,
    'the logo is a per-page header mark, not a full-bleed wash');
});

test('an empty guide degrades to a message instead of a broken page', () => {
  const Doc = stubJsPDF();
  generateArrangementGuidePDF([], CTX(Doc));
  assert.match(drawn(Doc), /No arrangement notes/);
});

test('export filenames name the document', () => {
  assert.match(pdfExportFilename('stage', 'Chris Zemba & The Late Shift'), /^setlist-chris-zemba/);
  assert.match(pdfExportFilename('guide', 'Chris Zemba'), /^arrangement-guide-chris-zemba/);
  assert.match(pdfExportFilename('stage', ''), /^setlist-band-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.deepEqual(PDF_DOC_KINDS, ['stage', 'guide', 'package']);
  PDF_DOC_KINDS.forEach(k => assert.ok(PDF_DOC_LABELS[k]));
});

// ================================================================================
// 5. Guide -> library round-trip (visible grid geometry)
// ================================================================================
// Fixture mirrors generateArrangementGuidePDF's layout: colA=36, colB=187, colC=272.

let _y = 760;
const row = (pairs) => ({ y: (_y -= 12), items: pairs.map(([str, x]) => ({ str, x })) });

test('the guide grid parses back into notes when the data block is absent', () => {
  _y = 760;
  const pages = [{ page: 1, rows: [
    row([['MASTER ARRANGEMENT GUIDE', 44]]),
    row([['The Late Shift', 44]]),
    row([['SONG # & TITLE', 44], ['KEY / BPM / STYLE', 195], ['ARRANGEMENT & HARMONIC DIRECTIVES', 280]]),
    row([['SET 1', 44]]),
    row([['1', 55], ['SHAKY GROUND', 72], ['E', 195], ['INTRO / CUE', 280]]),
    row([['Temptations', 72], ['104 BPM', 195], ['[OPENER] Establish groove.', 280]]),
    row([['2', 55], ['SLOW BLUES FOR Z', 72], ['G', 195], ['FORM & HARMONY', 280]]),
    row([['62 BPM', 195], ['standard 12 bar I-IV-V pattern', 280]]),
    row([['with subs in bars 7 to 8', 280]]),
    row([['GENERAL NOTES', 280]]),
    row([['Watch the guitar.', 280]]),
    row([['SET 2', 44]]),
    row([['1', 55], ['WHIPPING POST', 72], ['Am', 195], ['TRANSITION / OUTRO', 280]]),
    row([['96 BPM', 195], ['[CLOSER] Extended vamp.', 280]]),
  ] }];
  const notes = pdfParseArrangementGuideVisible(pages);
  assert.equal(notes.length, 3);
  assert.deepEqual(notes.map(n => n.title), ['SHAKY GROUND', 'SLOW BLUES FOR Z', 'WHIPPING POST']);
  assert.deepEqual(notes.map(n => n.setName), ['SET 1', 'SET 1', 'SET 2']);
  assert.equal(notes[0].arr.intro_cue, '[OPENER] Establish groove.');
  // Wrapped continuation lines join the section they belong to.
  assert.equal(notes[1].arr.form_harmony, 'standard 12 bar I-IV-V pattern with subs in bars 7 to 8');
  assert.equal(notes[1].arr.general_notes, 'Watch the guitar.');
  assert.equal(notes[2].arr.transition_outro, '[CLOSER] Extended vamp.');
  // ...and merge back onto a library song without dropping untouched fields.
  const merged = arrApplyNoteToArrangement(serializeArrangement({ drums: 'keep me' }), notes[1]);
  const p = parseArrangement(merged);
  assert.equal(p.drums, 'keep me');
  assert.match(p.form_harmony, /I-IV-V/);
});

test('wrapped multi-line guide titles are recovered via the bold title font', () => {
  // A long title wraps across two column-A rows in the SAME bold title font, while the
  // artist line just below it is italic. A single-line title's artist even shares the
  // BPM row, so column geometry alone can't separate title-continuation from artist --
  // the font does. Both must resolve to their full titles so a note matches its song.
  _y = 760;
  const T = 'g_d0_f1', A = 'g_d0_f3', N = 'g_d0_f4';   // bold title / italic artist / meta
  const it = (str, x, font) => ({ str, x, font });
  const frow = (arr) => ({ y: (_y -= 12), items: arr });
  const pages = [{ page: 1, rows: [
    frow([it('MASTER ARRANGEMENT GUIDE', 44, T)]),
    frow([it('SONG # & TITLE', 44, T), it('KEY / BPM / STYLE', 195, T), it('ARRANGEMENT & HARMONIC DIRECTIVES', 280, T)]),
    frow([it('SET 1', 44, T)]),
    // wrapped title over two bold rows; italic artist below carries the section body
    frow([it('14', 55, T), it('PRIDE & JOY - LITTLE', 72, T), it('Em', 195, T), it('INTRO / CUE', 280, T)]),
    frow([it('WING', 72, T), it('128 BPM', 195, N)]),
    frow([it('Stevie Ray Vaughan', 72, A), it('blues-rock', 195, N), it('[Cold Open]', 280, T)]),
    // single-line title whose italic artist shares the BPM row -- must NOT fold into title
    frow([it('2', 55, T), it('COLD SHOT', 72, T), it('A', 195, T), it('TRANSITION / OUTRO', 280, T)]),
    frow([it('Stevie Ray Vaughan', 72, A), it('94 BPM', 195, N), it('[Segue] into Red House', 280, T)]),
  ] }];
  const notes = pdfParseArrangementGuideVisible(pages);
  assert.deepEqual(notes.map(n => n.title), ['PRIDE & JOY - LITTLE WING', 'COLD SHOT']);
  assert.equal(notes[0].arr.intro_cue, '[Cold Open]');
  assert.equal(notes[1].arr.transition_outro, '[Segue] into Red House');
});

test('the legacy footnote layout still wins over the guide parser', () => {
  _y = 760;
  const pages = [{ page: 1, rows: [
    row([['ARRANGEMENT NOTES', 36]]),
    row([['1', 36], ['SHAKY GROUND', 50], ['(Set 1)', 140]]),
    row([['GENERAL', 50], ['[OPENER] groove first.', 122]]),
  ] }];
  const notes = pdfParseArrangementNotes(pages);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].arr.global, '[OPENER] groove first.');
});

// ================================================================================
// 6. arrRowText — geometry-aware joining
// ================================================================================

test('rows without measured widths keep the original single-space join', () => {
  assert.equal(arrRowText([{ str: 'GENERAL', x: 50 }, { str: 'a note', x: 122 }]), 'GENERAL a note');
  assert.equal(arrRowText([]), '');
});

test('a per-glyph row is rejoined into words instead of being letter-spaced', () => {
  // "So slow": glyph advance ~2pt, the dropped space glyph leaves a ~4pt hole.
  const items = [];
  let x = 144;
  for (const ch of 'So slow') {
    if (ch === ' ') { x += 4; continue; }
    items.push({ str: ch, x, w: 2 });
    x += 4;                       // 2pt glyph + 2pt gap -> below the word threshold
  }
  assert.equal(arrRowText(items), 'So slow');
});

test('a real column gap still produces a space', () => {
  assert.equal(arrRowText([
    { str: 'GENERAL', x: 50, w: 30 },
    { str: 'the note', x: 122, w: 40 },
  ]), 'GENERAL the note');
});

// ================================================================================
// 7. Import dedup: fill-empty arrangement merge onto the existing song
// ================================================================================
// A duplicate song name is not re-added, but its rehearsal notes attach to the copy
// already in the library — filling only empty fields, never overwriting a curated one.

test('an incoming note fills an empty field on the existing song', () => {
  const existing = serializeArrangement({ drums: 'Fill on 8' });          // no harmony yet
  const incoming = serializeArrangement({ form_harmony: 'I-IV-V, quick IV' });
  const { arrangement, filled } = mergeArrangementFillEmpty(existing, incoming);
  const p = parseArrangement(arrangement);
  assert.equal(filled, 1);
  assert.equal(p.drums, 'Fill on 8');                 // untouched
  assert.equal(p.form_harmony, 'I-IV-V, quick IV');   // filled from the import
});

test('a curated note is never overwritten by a conflicting import', () => {
  const existing = serializeArrangement({ form_harmony: 'my hand-typed chart', intro_cue: '' });
  const incoming = serializeArrangement({ form_harmony: 'bulk import chart', intro_cue: 'Cold open' });
  const { arrangement, filled } = mergeArrangementFillEmpty(existing, incoming);
  const p = parseArrangement(arrangement);
  assert.equal(filled, 1);                             // only intro_cue was empty
  assert.equal(p.form_harmony, 'my hand-typed chart'); // conflict → existing wins
  assert.equal(p.intro_cue, 'Cold open');              // gap → filled
});

test('all four sections and the roles are eligible to be filled', () => {
  const incoming = serializeArrangement({
    intro_cue: 'Drum intro', form_harmony: 'Stormy Monday subs',
    transition_outro: 'Tag 4x', general_notes: 'Opener', bass: 'Root only',
  });
  const { arrangement, filled } = mergeArrangementFillEmpty('', incoming);
  const p = parseArrangement(arrangement);
  assert.equal(filled, 5);
  ARR_SECTIONS.forEach(sec => assert.ok(p[sec], sec + ' filled'));
  assert.equal(p.bass, 'Root only');
});

test('a mojibake note imported onto a duplicate stays raw in storage but renders clean', () => {
  // Storage keeps the raw import (sanitize happens at render, per the guide pipeline);
  // deriveArrangementSections repairs it on the way to the Arrangement Guide.
  const { arrangement } = mergeArrangementFillEmpty('', serializeArrangement({
    form_harmony: 'conventional !`-!c-!d blues',
  }));
  assert.match(parseArrangement(arrangement).form_harmony, /!`/);   // raw preserved
  assert.match(deriveArrangementSections(arrangement).form_harmony, /I-IV-V/); // clean on display
});

test('nothing to merge returns the original arrangement unchanged', () => {
  const existing = serializeArrangement({ global: 'just a note' });
  const a = mergeArrangementFillEmpty(existing, '');
  assert.equal(a.filled, 0);
  assert.equal(a.arrangement, existing);              // byte-identical, no churn
  const b = mergeArrangementFillEmpty('', '');
  assert.equal(b.arrangement, '');
  assert.equal(b.filled, 0);
});

test('merging is stable across repeated imports of the same duplicate (idempotent)', () => {
  const incoming = serializeArrangement({ form_harmony: 'I-IV-V' });
  const once = mergeArrangementFillEmpty('', incoming).arrangement;
  const twice = mergeArrangementFillEmpty(once, incoming);
  assert.equal(twice.filled, 0);                      // already present → no-op
  assert.equal(twice.arrangement, once);
});
