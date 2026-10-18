'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary, flatIds, hasDuplicate, lastId, everyTrial } = require('./helpers.js');
const {
  generateSetlistsCore, generateSetlistsCore_WithTonalGravity, libraryDistributedDurations,
  resolveSetDurations, distributeLeftoverSongs, validateGenerationConstraints,
} = algorithm;

const lib = (n) => makeLibrary(n, (i) => ({
  duration: 3 + (i % 4) * 0.75,
  style: ['rock', 'blues', 'funk', 'ballad', 'soul'][i % 5],
  energy: 1 + (i % 10),
}));
const opts = (over) => ({
  setLengthMode: 'library', allowSongReuse: false, useEnergyCurve: true,
  forceOpener: false, forceCloser: true, setTemplate: 'freeform', randomness: 50, ...over,
});

test('libraryDistributedDurations splits total minutes evenly; blank durations count as 4', () => {
  assert.deepEqual(libraryDistributedDurations(makeLibrary(12), 3), [16, 16, 16]);
  assert.deepEqual(libraryDistributedDurations([{ duration: '' }, { duration: 6 }], 2), [5, 5]);
  assert.deepEqual(libraryDistributedDurations([], 0), [1], 'empty library / zero sets is safe');
});

test('resolveSetDurations honours mode; time mode keeps per-set overrides', () => {
  const songs = makeLibrary(20);
  assert.deepEqual(resolveSetDurations({ numSets: 2, setDuration: 45, setDurations: [30] }, songs), [30, 45]);
  assert.deepEqual(resolveSetDurations({ numSets: 4, setLengthMode: 'library', setDurations: [30] }, songs), [20, 20, 20, 20]);
});

test('whole-library mode places every song exactly once, across exactly N sets', () => {
  for (const n of [1, 3, 4]) {
    assert.ok(everyTrial(15, () => {
      const songs = lib(200);
      const res = generateSetlistsCore(songs, opts({ numSets: n }));
      const ids = flatIds(res);
      return res.length === n && ids.length === 200 && !hasDuplicate(ids)
        && res.every(s => s.songs.length > 0);
    }), `n=${n}`);
  }
});

test('whole-library sets come out balanced by running time', () => {
  assert.ok(everyTrial(10, () => {
    const res = generateSetlistsCore(lib(200), opts({ numSets: 4 }));
    const times = res.map(s => s.totalTime);
    return Math.max(...times) - Math.min(...times) <= 8;
  }));
  const res = generateSetlistsCore(lib(40), opts({ numSets: 3 }));
  assert.equal(res.targetDurations.length, 3);
});

test('whole-library mode keeps locked closers last', () => {
  assert.ok(everyTrial(15, () => {
    const res = generateSetlistsCore(lib(60), opts({ numSets: 3, lockedClosers: ['S1', 'S2', 'S3'] }));
    const ids = flatIds(res);
    return ids.length === 60 && !hasDuplicate(ids) && res.map(lastId).sort().join() === 'S1,S2,S3';
  }));
});

test('whole-library mode keeps pairs adjacent + in order and anti pairs apart', () => {
  assert.ok(everyTrial(25, () => {
    const res = generateSetlistsCore(lib(60), opts({
      numSets: 3, forceCloser: false,
      songAffinities: [['S10', 'S11']], songAntiAffinities: [['S20', 'S21']],
    }));
    if (flatIds(res).length !== 60) return false;
    for (const s of res) {
      const sid = s.songs.map(x => x.id);
      const a = sid.indexOf('S10');
      if (a >= 0 && sid[a + 1] !== 'S11') return false;
      for (let i = 1; i < sid.length; i++) {
        if ([sid[i - 1], sid[i]].sort().join() === 'S20,S21') return false;
      }
    }
    return true;
  }));
});

test('distributeLeftoverSongs seats a leftover beside its placed pair partner', () => {
  const sets = [
    { songs: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] },
    { songs: [{ id: 'D' }] },
  ];
  distributeLeftoverSongs(sets, [{ id: 'X' }], { songAffinities: [['B', 'X']] });
  assert.deepEqual(sets[0].songs.map(s => s.id), ['A', 'B', 'X', 'C']);
});

test('whole-library mode also works through the tonal-gravity / deep path', () => {
  const songs = lib(50).map((s, i) => ({ ...s, key: ['C', 'G', 'Am', 'F', 'D'][i % 5] }));
  const res = generateSetlistsCore_WithTonalGravity(songs, opts({
    numSets: 3, useTonalGravity: true, optimizationLevel: 'deep',
  }));
  const ids = flatIds(res);
  assert.equal(ids.length, 50);
  assert.ok(!hasDuplicate(ids));
  assert.equal(res.qualityScores.length, 3);
});

test('time mode is unchanged: does not sweep in the whole library', () => {
  const res = generateSetlistsCore(lib(200), { numSets: 2, setDuration: 30, useEnergyCurve: true });
  assert.ok(flatIds(res).length < 40);
});

test('distributeLeftoverSongs never displaces opener/closer and is a no-op on empty input', () => {
  const sets = [{ songs: [{ id: 'O', duration: 4 }, { id: 'C', duration: 4 }], totalTime: 8 }];
  distributeLeftoverSongs(sets, [], {});
  assert.equal(sets[0].songs.length, 2);
  distributeLeftoverSongs(sets, [{ id: 'X', duration: 4 }, { id: 'Y', duration: 4 }], { forceOpener: true, forceCloser: true });
  const ids = sets[0].songs.map(s => s.id);
  assert.equal(ids[0], 'O'); assert.equal(ids[ids.length - 1], 'C');
  assert.equal(sets[0].totalTime, 16);
});

test('validator skips the minutes-shortfall warning in whole-library mode', () => {
  const songs = makeLibrary(5);
  const msgs = (s) => validateGenerationConstraints(s, songs).map(i => i.message).join(' ');
  assert.match(msgs({ numSets: 3, setDuration: 45 }), /sets may come up short/);
  assert.doesNotMatch(msgs({ numSets: 3, setDuration: 45, setLengthMode: 'library' }), /sets may come up short/);
});

test('whole-library mode ignores allowSongReuse — still exactly once each', () => {
  assert.ok(everyTrial(10, () => {
    const ids = flatIds(generateSetlistsCore(lib(80), opts({ numSets: 3, allowSongReuse: true })));
    return ids.length === 80 && !hasDuplicate(ids);
  }));
});
