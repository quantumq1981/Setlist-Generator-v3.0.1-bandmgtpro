'use strict';
/*
 * "Pair together" order + adjacency under forced openers/closers, across every
 * generator path. Regression net for three bugs that let a pair break:
 *   1. the forced-closer swap replaced a pair's trailing song (orphaning it);
 *   2. the end-of-set deadlock fallback placed a follower before its leader when it
 *      was the only song that fit the remaining time;
 *   3. tonal refinement + deep SA scored a pair symmetrically, so B,A was as good as
 *      A,B and a marginal tonal gain could reverse it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary, flatIds, hasDuplicate, lastId } = require('./helpers.js');
const { generateSetlistsCore, generateSetlistsCore_WithTonalGravity } = algorithm;

const lib = (n) => makeLibrary(n, (i) => ({
  duration: 3 + (i % 4) * 0.75,
  style: ['rock', 'blues', 'funk', 'ballad', 'soul'][i % 5],
  energy: 1 + (i % 10),
  key: ['C', 'G', 'Am', 'F', 'D'][i % 5],
}));
const PAIRS = [['S10', 'S11'], ['S11', 'S12'], ['S30', 'S31']];

const posOf = (sets, id) => {
  for (let si = 0; si < sets.length; si++) {
    const k = sets[si].songs.findIndex((x) => x.id === id);
    if (k >= 0) return [si, k];
  }
  return null;
};
// A pair is honoured when both members are absent, or both present, same set, b right after a.
const pairsHonoured = (sets, pairs) => pairs.every(([a, b]) => {
  const pa = posOf(sets, a), pb = posOf(sets, b);
  if (!pa && !pb) return true;
  return !!pa && !!pb && pa[0] === pb[0] && pb[1] === pa[1] + 1;
});

const run = (fn, mode, extra) => fn(lib(60), {
  setLengthMode: mode, setDuration: 45, numSets: 3, useEnergyCurve: true,
  forceOpener: true, forceCloser: true,
  lockedOpeners: ['S4', 'S5', 'S6'], lockedClosers: ['S1', 'S2', 'S3'],
  songAffinities: PAIRS, songAntiAffinities: [['S20', 'S21']], ...extra,
});

const PATHS = [
  ['greedy core', generateSetlistsCore, {}],
  ['tonal refinement', generateSetlistsCore_WithTonalGravity, { useTonalGravity: true }],
  ['deep SA', generateSetlistsCore_WithTonalGravity, { useTonalGravity: true, optimizationLevel: 'deep' }],
];

for (const mode of ['time', 'library']) {
  for (const [label, fn, extra] of PATHS) {
    test(`${mode} mode / ${label}: pairs stay adjacent + ordered with locked openers & closers`, () => {
      const trials = label === 'deep SA' ? 40 : 120;
      for (let t = 0; t < trials; t++) {
        const res = run(fn, mode, extra);
        assert.ok(!hasDuplicate(flatIds(res)), 'no duplicates');
        assert.ok(pairsHonoured(res, PAIRS), `pair broken on trial ${t}: ${res.map((s) => s.songs.map((x) => x.id).join(',')).join(' / ')}`);
        assert.deepEqual(res.map((s) => s.songs[0].id).sort(), ['S4', 'S5', 'S6'], 'locked openers open');
        assert.deepEqual(res.map(lastId).sort(), ['S1', 'S2', 'S3'], 'locked closers close');
        if (mode === 'library') assert.equal(flatIds(res).length, 60, 'whole library placed');
      }
    });
  }
}

test('a pair ending a set is kept: the designated closer is appended after it', () => {
  // Library of exactly-fitting songs where the pair is the obvious tail.
  let seen = 0;
  for (let t = 0; t < 300; t++) {
    const res = generateSetlistsCore(lib(30), {
      setDuration: 30, numSets: 1, forceCloser: true, lockedClosers: ['S1'],
      songAffinities: [['S10', 'S11']], useEnergyCurve: true,
    });
    const ids = res[0].songs.map((x) => x.id);
    assert.equal(ids[ids.length - 1], 'S1');
    const a = ids.indexOf('S10');
    if (a >= 0) { assert.equal(ids[a + 1], 'S11'); if (a === ids.length - 3) seen++; }
    else assert.equal(ids.indexOf('S11'), -1, 'follower never placed without its leader');
  }
  assert.ok(seen > 0, 'the pair-at-tail case was exercised');
});
