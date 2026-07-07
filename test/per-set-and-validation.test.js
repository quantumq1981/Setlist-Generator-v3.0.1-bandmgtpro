'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary, flatIds, hasDuplicate, lastId, everyTrial } = require('./helpers.js');
const { generateSetlistsCore, validateGenerationConstraints } = algorithm;

const baseOpts = (over) => ({
  defaultSetDuration: 20, allowSongReuse: false, useEnergyCurve: false,
  setTemplate: 'freeform', randomness: 50, ...over,
});

// --- Per-set opener/closer placement -------------------------------------------

test('per-set openers land in their exact set with no cross-set duplicates', () => {
  assert.ok(everyTrial(30, () => {
    const res = generateSetlistsCore(makeLibrary(30), baseOpts({
      numSets: 3, forceOpener: true, openerBySet: { 0: 'S0', 1: 'S1', 2: 'S2' },
    }));
    return !hasDuplicate(flatIds(res))
      && res[0].songs[0].id === 'S0' && res[1].songs[0].id === 'S1' && res[2].songs[0].id === 'S2';
  }));
});

test('per-set closers land at the end of their exact set', () => {
  assert.ok(everyTrial(30, () => {
    const res = generateSetlistsCore(makeLibrary(30), baseOpts({
      numSets: 2, forceCloser: true, closerBySet: { 0: 'S7', 1: 'S9' },
    }));
    return !hasDuplicate(flatIds(res)) && lastId(res[0]) === 'S7' && lastId(res[1]) === 'S9';
  }));
});

test('a per-set pick overrides the pool for that set', () => {
  assert.ok(everyTrial(30, () => {
    const res = generateSetlistsCore(makeLibrary(30), baseOpts({
      numSets: 2, forceOpener: true, lockedOpeners: ['S5', 'S6'], openerBySet: { 0: 'S0' },
    }));
    // Set 1 uses the explicit pick; set 2 falls back to the pool.
    return res[0].songs[0].id === 'S0'
      && ['S5', 'S6'].includes(res[1].songs[0].id)
      && !hasDuplicate(flatIds(res));
  }));
});

test('per-set opener + closer together are exact and distinct', () => {
  assert.ok(everyTrial(25, () => {
    const res = generateSetlistsCore(makeLibrary(30), baseOpts({
      numSets: 2, defaultSetDuration: 24, forceOpener: true, forceCloser: true,
      openerBySet: { 0: 'S0', 1: 'S1' }, closerBySet: { 0: 'S10', 1: 'S11' },
    }));
    return !hasDuplicate(flatIds(res))
      && res[0].songs[0].id === 'S0' && res[1].songs[0].id === 'S1'
      && lastId(res[0]) === 'S10' && lastId(res[1]) === 'S11';
  }));
});

// --- Constraint validation -----------------------------------------------------

const sev = (issues, re) => issues.filter((i) => re.test(i.message));

test('flags a song assigned as both opener and closer of one set (error)', () => {
  const issues = validateGenerationConstraints(
    { numSets: 2, forceOpener: true, forceCloser: true, openerBySet: { 0: 'S0' }, closerBySet: { 0: 'S0' } },
    makeLibrary(10));
  assert.ok(sev(issues, /BOTH opener and closer/).some((i) => i.severity === 'error'));
});

test('flags a song forced into multiple sets without reuse (error)', () => {
  const issues = validateGenerationConstraints(
    { numSets: 2, allowSongReuse: false, forceOpener: true, openerBySet: { 0: 'S3', 1: 'S3' } },
    makeLibrary(10));
  assert.ok(sev(issues, /different sets/).some((i) => i.severity === 'error'));
});

test('flags a contradictory pair-together + keep-apart (error)', () => {
  const issues = validateGenerationConstraints(
    { numSets: 2, songAffinities: [['S1', 'S2']], songAntiAffinities: [['S2', 'S1']] },
    makeLibrary(10));
  assert.ok(sev(issues, /keep apart/).some((i) => i.severity === 'error'));
});

test('flags per-set picks made while the Force toggle is off (info)', () => {
  const issues = validateGenerationConstraints(
    { numSets: 1, forceOpener: false, openerBySet: { 0: 'S1' } }, makeLibrary(10));
  assert.ok(sev(issues, /Force Opener/).some((i) => i.severity === 'info'));
});

test('flags paired songs pinned to different sets (warning)', () => {
  const issues = validateGenerationConstraints(
    {
      numSets: 2, allowSongReuse: false, songAffinities: [['S1', 'S2']],
      songSetPins: [{ songId: 'S1', setIndex: 0 }, { songId: 'S2', setIndex: 1 }],
    }, makeLibrary(10));
  assert.ok(sev(issues, /different sets/).some((i) => i.severity === 'warning'));
});

test('flags a library too small for the requested set minutes (warning)', () => {
  // 4 short songs (~16 min) but two 45-min sets requested.
  const issues = validateGenerationConstraints(
    { numSets: 2, setDuration: 45, allowSongReuse: false }, makeLibrary(4));
  assert.ok(sev(issues, /come up short/).some((i) => i.severity === 'warning'));
});

test('a clean per-set configuration produces no errors', () => {
  const issues = validateGenerationConstraints(
    {
      numSets: 2, allowSongReuse: false, forceOpener: true, forceCloser: true,
      openerBySet: { 0: 'S0', 1: 'S1' }, closerBySet: { 0: 'S8', 1: 'S9' },
    }, makeLibrary(20));
  assert.ok(!issues.some((i) => i.severity === 'error'));
});
