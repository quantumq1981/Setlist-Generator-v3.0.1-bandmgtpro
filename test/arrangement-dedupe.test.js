'use strict';
// Notes stored twice (CLAUDE.md §9ba): a re-imported guide wrote its derived sections
// ("Drums: …", "Ending Cue: …", the whole-band note again under a section) next to the role
// notes they came from. dedupeArrangement keeps one copy. Cases are the owner's real notes.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./extract-algorithm.js');
const {
  dedupeArrangement, parseArrangement, arrApplyNoteToArrangement, mergeArrangementFillEmpty,
  getArrangementCue, MASTER_LIBRARY, masterTitleKey, serializeArrangement, ARR_FIELDS,
} = A;

const fields = (s) => { const o = parseArrangement(s); return Object.keys(o).filter(k => o[k] && String(o[k]).trim()).sort(); };

test('whole-band note repeated in a section: one copy, the section keeps it', () => {
  const s = JSON.stringify({ global: '[Cold Open] Guitar kicks it off.', intro_cue: '[Cold Open] Guitar kicks it off.' });
  const out = dedupeArrangement(s);
  assert.deepEqual(fields(out), ['intro_cue']);
  assert.equal(parseArrangement(out).intro_cue, '[Cold Open] Guitar kicks it off.');
});

test('dash / bullet / case differences still count as the same note', () => {
  const s = JSON.stringify({ global: 'Big ending – hit on the one.', transition_outro: '• BIG ENDING - hit on the one.' });
  assert.deepEqual(fields(dedupeArrangement(s)), ['transition_outro']);
});

test('ending cue echoed as "Ending Cue: …" in Transition/Outro: role dropped, label stripped', () => {
  const s = JSON.stringify({ endingCue: 'look for visual cue from soloist then ending the same as the intro',
    transition_outro: 'Ending Cue: look for visual cue from soloist then ending the same as the intro' });
  const o = parseArrangement(dedupeArrangement(s));
  assert.equal(o.endingCue, '');
  assert.equal(o.transition_outro, 'look for visual cue from soloist then ending the same as the intro');
});

test('instrument note keeps its role; its "Drums: …" echo leaves the section (Do It Again)', () => {
  const s = JSON.stringify({
    global: 'Done as an instrumental, guitar covers the melody',
    drums: 'drum intro pocket groove',
    endingCue: 'ends on the V Chord ( D7#9) and then immediately transitions into peg',
    intro_cue: 'Done as an instrumental, guitar covers the melody Drums: drum intro pocket groove',
    transition_outro: 'Ending Cue: ends on the V Chord ( D7#9) and then immediately transitions into peg',
  });
  const o = parseArrangement(dedupeArrangement(s));
  assert.equal(o.global, '');
  assert.equal(o.endingCue, '');
  assert.equal(o.drums, 'drum intro pocket groove');
  assert.equal(o.intro_cue, 'Done as an instrumental, guitar covers the melody');
  assert.equal(o.transition_outro, 'ends on the V Chord ( D7#9) and then immediately transitions into peg');
});

test('a short drum cue echoed on its own line is removed from the section', () => {
  const s = JSON.stringify({ drums: '[Drum Intro]', intro_cue: '• Drums: [Drum Intro]' });
  assert.deepEqual(fields(dedupeArrangement(s)), ['drums']);
});

test('a whole-band note split across several sections is still one copy (Black Cat Bone)', () => {
  const s = JSON.stringify({
    global: 'This has it quick IV change ( like crossroads) in the key of C\nMy arrangement is as follows, I kick off the intro on the I , band comes in on the IV [Cold Open]',
    guitar2: 'Cold Guitar open band comes in on the |V',
    intro_cue: 'My arrangement is as follows, I kick off the intro on the I , band comes in on the IV [Cold Open] Guitar 2: Cold Guitar open band comes in on the |V',
    form_harmony: 'This has it quick IV change ( like crossroads) in the key of C',
  });
  const o = parseArrangement(dedupeArrangement(s));
  assert.equal(o.global, '');
  assert.equal(o.guitar2, 'Cold Guitar open band comes in on the |V');
  assert.equal(o.intro_cue, 'My arrangement is as follows, I kick off the intro on the I , band comes in on the IV [Cold Open]');
});

test('the garbled-encoding copy of a note matches its repaired section copy (Red House)', () => {
  const garbled = 'Slow blues, in the key of A cold guitar open band comes in on the IV adding stormy Monday chord substitutions in bars 7 to 8 returning to conventional form after the solo';
  const repaired = 'Slow blues, in the key of A cold guitar open band comes in on the IV adding stormy Monday chord substitutions in bars 7 to 8 returning to conventional I-IV-V form after the solo';
  assert.deepEqual(fields(dedupeArrangement(JSON.stringify({ global: garbled, form_harmony: repaired }))), ['form_harmony']);
});

test('different notes are never merged, and untouched input is returned byte-identical', () => {
  const distinct = JSON.stringify({ global: 'ending tags the opening line 3 times', endingCue: '[Tag×3] The intro line', intro_cue: 'Cold open' });
  assert.equal(dedupeArrangement(distinct), distinct);
  const rolesOnly = JSON.stringify({ global: 'Same text', drums: 'Same text' });
  assert.equal(dedupeArrangement(rolesOnly), rolesOnly, 'nothing is touched without sections');
  assert.equal(dedupeArrangement('plain legacy note'), 'plain legacy note');
  assert.equal(dedupeArrangement(''), '');
  const once = dedupeArrangement(JSON.stringify({ global: 'Hit on the one', intro_cue: 'Hit on the one' }));
  assert.equal(dedupeArrangement(once), once, 'idempotent');
});

test('re-importing a guide onto a song that has role notes no longer doubles them', () => {
  const song = JSON.stringify({ global: 'Vamp out – end on a visual cue from the leader.', drums: 'tight groove' });
  // What the guide's visible text parses back into: derived sections, role names inlined.
  const note = { arr: { transition_outro: 'Vamp out - end on a visual cue from the leader.', general_notes: 'Drums: tight groove' } };
  const o = parseArrangement(arrApplyNoteToArrangement(song, note));
  assert.equal(o.global, '');
  assert.equal(o.drums, 'tight groove');
  assert.equal(o.general_notes, '');
  assert.equal(o.transition_outro, 'Vamp out - end on a visual cue from the leader.');
  const merged = mergeArrangementFillEmpty(song, JSON.stringify(note.arr));
  assert.deepEqual(fields(merged.arrangement), ['drums', 'transition_outro']);
});

test('auto opener/closer tags from generate() never stay in stored notes', () => {
  const o = parseArrangement(dedupeArrangement(JSON.stringify({
    global: '[OPENER] Establish groove before vocal. this tradition is done as an instrumental\n[CLOSER] Extended vamp – end on visual cue.',
    transition_outro: '[CLOSER] Extended vamp - end on visual cue.',
  })));
  assert.equal(o.global, 'this tradition is done as an instrumental');
  assert.equal(o.transition_outro, '');
  assert.equal(dedupeArrangement('[OPENER] Establish groove before vocal.'), '', 'a tag-only note is emptied');
  const own = JSON.stringify({ global: '[OPENER] Count it in fast' });
  assert.equal(dedupeArrangement(own), own, "the user's own [OPENER] notes stay");
});

test('stage cue: one clean line, headings and bullets skipped, never multi-line', () => {
  assert.equal(getArrangementCue(JSON.stringify({ endingCue: 'Outro:•::\n• Ending Cue: Tag the pre-chorus\n• 4 times' })), 'Ending Cue: Tag the pre-chorus');
  assert.equal(getArrangementCue(JSON.stringify({ global: 'Song Structure:\n• Intro: Guitar pickup octave line' })), 'Intro: Guitar pickup octave line');
  assert.equal(getArrangementCue('[OPENER] Count it in fast'), 'Count it in fast');
  assert.equal(getArrangementCue(JSON.stringify({ transition_outro: '[Ending is Direct Segue] Into Red House intro' })), '[Ending is Direct Segue] Into Red House…');
  const long = getArrangementCue(JSON.stringify({ form_harmony: 'x'.repeat(10) + ' ' + 'y'.repeat(60) }));
  assert.ok(long.length <= 41 && !/\n/.test(long));
  assert.equal(getArrangementCue(''), '');
});

test('the default master list carries no duplicated notes and no medley-component singles', () => {
  for (const e of MASTER_LIBRARY) {
    if (!e.arrangement) continue;
    const s = serializeArrangement(e.arrangement);
    assert.equal(dedupeArrangement(s), s, `${e.title} still holds a duplicated note`);
    for (const f of Object.keys(e.arrangement)) assert.ok(ARR_FIELDS.includes(f));
  }
  const keys = new Set(MASTER_LIBRARY.map(e => masterTitleKey(e.title)));
  assert.ok(keys.has(masterTitleKey("Ain't Too Proud to Beg / My Girl")), 'the medley is in the list');
  for (const single of ["Ain't Too Proud to Beg", 'My Girl', 'Superstition', 'Living for the City', 'Roadhouse Blues']) {
    assert.ok(!keys.has(masterTitleKey(single)), `${single} is covered by its medley`);
  }
  assert.equal(MASTER_LIBRARY.filter(e => /^Superstition/.test(e.title)).length, 1);
  for (const t of ['Trouble No More', 'Soul Medley', 'Heartbreaker', "Let's Stay Together", 'Gravity', 'Susie Q']) {
    assert.ok(keys.has(masterTitleKey(t)), `${t} added from the July list`);
  }
});
