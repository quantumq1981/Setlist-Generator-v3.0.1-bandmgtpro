'use strict';
/*
 * Stage chart viewer — the pure navigation core behind the full-screen performance
 * "music stand". These lock the renderer-registry key, the setlist→queue flattening
 * (including the cue-card fallback for songs with no chart), the 1-based page clamp,
 * and the page/song stepping with spill-over across entries and set boundaries.
 * The React rendering (PDF.js canvas, image, cue card) is exercised in the headless
 * browser drive; here we prove the state machine that drives page turns.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { resolveChartKind, buildChartQueue, clampChartPage, stageNavStep } = algorithm;

// ── resolveChartKind ─────────────────────────────────────────────────────────
test('resolveChartKind maps PDF and image MIME types, else unsupported', () => {
  assert.equal(resolveChartKind('application/pdf'), 'pdf');
  assert.equal(resolveChartKind('application/x-pdf'), 'pdf');
  assert.equal(resolveChartKind('APPLICATION/PDF'), 'pdf'); // case-insensitive
  assert.equal(resolveChartKind('image/png'), 'image');
  assert.equal(resolveChartKind('image/jpeg'), 'image');
  assert.equal(resolveChartKind('image/webp'), 'image');
  assert.equal(resolveChartKind('audio/mpeg'), 'unsupported');
  assert.equal(resolveChartKind('application/vnd.recordare.musicxml+xml'), 'unsupported'); // future seam
  assert.equal(resolveChartKind(''), 'unsupported');
  assert.equal(resolveChartKind(undefined), 'unsupported');
});

// ── buildChartQueue ──────────────────────────────────────────────────────────
const pdf = (id) => ({ id, name: id + '.pdf', mime: 'application/pdf', kind: 'leadsheet' });
const img = (id) => ({ id, name: id + '.png', mime: 'image/png', kind: 'chart' });
const song = (id, atts) => ({ id, title: id, attachments: atts || [] });

test('buildChartQueue: one entry per renderable chart; song without a chart gets one cue-card entry', () => {
  const setlists = [{
    id: 's1', name: 'Set 1', songs: [
      song('A', [pdf('a1'), img('a2')]), // 2 charts → 2 entries
      song('B', []),                     // no chart → 1 cue-card entry (att:null)
      song('C', [pdf('c1')]),            // 1 chart → 1 entry
    ],
  }];
  const q = buildChartQueue(setlists);
  assert.equal(q.length, 4);
  assert.deepEqual(q.map(e => e.song.id), ['A', 'A', 'B', 'C']);
  assert.equal(q[0].att.id, 'a1');
  assert.equal(q[0].chartCount, 2);
  assert.equal(q[1].att.id, 'a2');
  assert.equal(q[1].chartIdx, 1);
  assert.equal(q[2].att, null);        // cue card
  assert.equal(q[2].chartCount, 0);
  assert.equal(q[3].att.id, 'c1');
});

test('buildChartQueue: unsupported attachments are filtered, falling back to a cue card', () => {
  const setlists = [{
    id: 's1', name: 'Set 1', songs: [
      song('A', [{ id: 'x', name: 'track.mp3', mime: 'audio/mpeg' }]),
    ],
  }];
  const q = buildChartQueue(setlists);
  assert.equal(q.length, 1);
  assert.equal(q[0].att, null); // the mp3 is not a renderable chart
});

test('buildChartQueue: spans multiple sets and keys entries by set/song/chart', () => {
  const setlists = [
    { id: 's1', name: 'Set 1', songs: [song('A', [pdf('a1')])] },
    { id: 's2', name: 'Set 2', songs: [song('B', [pdf('b1')]), song('C', [])] },
  ];
  const q = buildChartQueue(setlists);
  assert.deepEqual(q.map(e => e.key), ['0-0-0', '1-0-0', '1-1-x']);
  assert.deepEqual(q.map(e => e.si), [0, 1, 1]);
});

test('buildChartQueue: empty / missing input is safe', () => {
  assert.deepEqual(buildChartQueue([]), []);
  assert.deepEqual(buildChartQueue(null), []);
  assert.deepEqual(buildChartQueue([{ id: 's', name: 'S', songs: [] }]), []);
});

// ── clampChartPage ───────────────────────────────────────────────────────────
test('clampChartPage keeps a 1-based page within [1, numPages]', () => {
  assert.equal(clampChartPage(1, 4), 1);
  assert.equal(clampChartPage(4, 4), 4);
  assert.equal(clampChartPage(0, 4), 1);
  assert.equal(clampChartPage(-3, 4), 1);
  assert.equal(clampChartPage(9, 4), 4);
  assert.equal(clampChartPage(2, 0), 1);   // numPages<1 → single page
  assert.equal(clampChartPage(2, 1), 1);
});

// ── stageNavStep ─────────────────────────────────────────────────────────────
// Queue: song A (3-page PDF), song A (image), song B (cue card), song C (2-page PDF)
const navQueue = [
  { key: '0-0-0', si: 0, songIdx: 0 }, // A chart 1
  { key: '0-0-1', si: 0, songIdx: 0 }, // A chart 2
  { key: '0-1-x', si: 0, songIdx: 1 }, // B cue card
  { key: '0-2-0', si: 0, songIdx: 2 }, // C chart
];

test('stageNavStep nextPage advances within a multi-page chart', () => {
  assert.deepEqual(stageNavStep(navQueue, 0, 1, 3, 'nextPage'), { cursor: 0, page: 2 });
  assert.deepEqual(stageNavStep(navQueue, 0, 2, 3, 'nextPage'), { cursor: 0, page: 3 });
});

test('stageNavStep nextPage at the last page spills to the next queue entry, page 1', () => {
  assert.deepEqual(stageNavStep(navQueue, 0, 3, 3, 'nextPage'), { cursor: 1, page: 1 });
});

test('stageNavStep nextPage holds at the very end of the set', () => {
  assert.deepEqual(stageNavStep(navQueue, 3, 2, 2, 'nextPage'), { cursor: 3, page: 2 });
});

test('stageNavStep prevPage steps back within a chart, then spills to the previous entry', () => {
  assert.deepEqual(stageNavStep(navQueue, 0, 3, 3, 'prevPage'), { cursor: 0, page: 2 });
  assert.deepEqual(stageNavStep(navQueue, 1, 1, 1, 'prevPage'), { cursor: 0, page: 1 });
});

test('stageNavStep prevPage holds at the very start of the set', () => {
  assert.deepEqual(stageNavStep(navQueue, 0, 1, 3, 'prevPage'), { cursor: 0, page: 1 });
});

test('stageNavStep nextSong jumps past a song\'s extra charts to the next song', () => {
  // From A's first chart → skip A's second chart → land on B.
  assert.deepEqual(stageNavStep(navQueue, 0, 1, 3, 'nextSong'), { cursor: 2, page: 1 });
  // From A's second chart → still lands on B (same song group).
  assert.deepEqual(stageNavStep(navQueue, 1, 1, 1, 'nextSong'), { cursor: 2, page: 1 });
});

test('stageNavStep nextSong holds at the last song', () => {
  assert.deepEqual(stageNavStep(navQueue, 3, 1, 2, 'nextSong'), { cursor: 3, page: 1 });
});

test('stageNavStep prevSong returns to the previous song group\'s first entry', () => {
  // From C → previous song is B.
  assert.deepEqual(stageNavStep(navQueue, 3, 2, 2, 'prevSong'), { cursor: 2, page: 1 });
  // From B → previous song is A, whose group starts at cursor 0.
  assert.deepEqual(stageNavStep(navQueue, 2, 1, 1, 'prevSong'), { cursor: 0, page: 1 });
  // From A's second chart → previous song group is A itself, starting at 0.
  assert.deepEqual(stageNavStep(navQueue, 1, 1, 1, 'prevSong'), { cursor: 0, page: 1 });
});

test('stageNavStep first / last jump to the ends (last = final song group start)', () => {
  assert.deepEqual(stageNavStep(navQueue, 2, 1, 1, 'first'), { cursor: 0, page: 1 });
  assert.deepEqual(stageNavStep(navQueue, 0, 1, 3, 'last'), { cursor: 3, page: 1 });
});

test('stageNavStep clamps an out-of-range cursor and is empty-queue safe', () => {
  assert.deepEqual(stageNavStep(navQueue, 99, 1, 2, 'nextPage'), { cursor: 3, page: 2 });
  assert.deepEqual(stageNavStep([], 0, 1, 1, 'nextPage'), { cursor: 0, page: 1 });
  assert.deepEqual(stageNavStep(null, 0, 1, 1, 'nextSong'), { cursor: 0, page: 1 });
});
