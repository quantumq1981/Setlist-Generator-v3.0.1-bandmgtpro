'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary, flatIds, hasDuplicate, lastId, everyTrial } = require('./helpers.js');
const { generateSetlistsCore } = algorithm;

const baseOpts = (over) => ({
  defaultSetDuration: 20, allowSongReuse: false, useEnergyCurve: false,
  setTemplate: 'freeform', randomness: 50, ...over,
});

test('single locked opener never duplicates across sets and opens set 1', () => {
  const res = generateSetlistsCore(makeLibrary(30), baseOpts({
    numSets: 3, forceOpener: true, lockedOpeners: ['S0'],
  }));
  const ids = flatIds(res);
  assert.ok(!hasDuplicate(ids), 'no cross-set duplicates');
  assert.equal(ids.filter((x) => x === 'S0').length, 1, 'opener appears exactly once');
  assert.equal(res[0].songs[0].id, 'S0', 'set 1 opens with the locked opener');
});

test('three locked openers distribute one-per-set with no overlap', () => {
  const res = generateSetlistsCore(makeLibrary(30), baseOpts({
    numSets: 3, forceOpener: true, lockedOpeners: ['S0', 'S1', 'S2'],
  }));
  assert.ok(!hasDuplicate(flatIds(res)), 'no cross-set duplicates');
  const openers = res.map((s) => s.songs[0].id).sort();
  assert.deepEqual(openers, ['S0', 'S1', 'S2'], 'each set opens with a distinct locked opener');
});

test('single locked closer never duplicates across sets and closes set 1', () => {
  const res = generateSetlistsCore(makeLibrary(30), baseOpts({
    numSets: 3, forceCloser: true, lockedClosers: ['S5'],
  }));
  const ids = flatIds(res);
  assert.ok(!hasDuplicate(ids), 'no cross-set duplicates');
  assert.equal(ids.filter((x) => x === 'S5').length, 1, 'closer appears exactly once');
  assert.equal(lastId(res[0]), 'S5', 'set 1 closes with the locked closer');
});

test('three locked closers distribute one-per-set with no overlap', () => {
  const res = generateSetlistsCore(makeLibrary(30), baseOpts({
    numSets: 3, forceCloser: true, lockedClosers: ['S5', 'S6', 'S7'],
  }));
  assert.ok(!hasDuplicate(flatIds(res)), 'no cross-set duplicates');
  const closers = res.map(lastId).sort();
  assert.deepEqual(closers, ['S5', 'S6', 'S7'], 'each set closes with a distinct locked closer');
});

test('opener + closer pools together stay unique across sets', () => {
  assert.ok(everyTrial(15, () => {
    const res = generateSetlistsCore(makeLibrary(30), baseOpts({
      numSets: 2, forceOpener: true, forceCloser: true,
      lockedOpeners: ['S0'], lockedClosers: ['S5'],
    }));
    const ids = flatIds(res);
    return !hasDuplicate(ids)
      && ids.filter((x) => x === 'S0').length === 1
      && ids.filter((x) => x === 'S5').length === 1;
  }));
});

test('designated openers/closers are reserved from filler (not consumed early)', () => {
  // With exactly enough openers for the sets, each must still be available for its
  // slot — reservation prevents an opener being used as a mid-set filler in set 1.
  assert.ok(everyTrial(20, () => {
    const res = generateSetlistsCore(makeLibrary(24), baseOpts({
      numSets: 2, forceOpener: true, lockedOpeners: ['S0', 'S1'],
    }));
    const openers = res.map((s) => s.songs[0].id).sort();
    return openers[0] === 'S0' && openers[1] === 'S1' && !hasDuplicate(flatIds(res));
  }));
});

test('plain forced opener+closer generation produces no integrity warnings', () => {
  const res = generateSetlistsCore(makeLibrary(40), baseOpts({
    numSets: 3, defaultSetDuration: 30, forceOpener: true, forceCloser: true,
  }));
  assert.ok(!hasDuplicate(flatIds(res)), 'no duplicates');
  assert.ok(!(res.generationWarnings || []).some((w) => /INTEGRITY ERROR/.test(w)), 'no integrity error');
});
