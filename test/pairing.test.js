'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary, flatIds, hasDuplicate, setOfSong, everyTrial } = require('./helpers.js');
const { generateSetlistsCore, generateSetlistsCore_WithTonalGravity } = algorithm;

const baseOpts = (over) => ({
  numSets: 2, defaultSetDuration: 20, allowSongReuse: false, useEnergyCurve: false,
  forceOpener: false, forceCloser: false, setTemplate: 'freeform', randomness: 70, ...over,
});

// --- Greedy path ---------------------------------------------------------------

test('"pair together" keeps songs adjacent and in order (A → B)', () => {
  assert.ok(everyTrial(40, () => {
    const res = generateSetlistsCore(makeLibrary(20), baseOpts({ songAffinities: [['S3', 'S8']] }));
    for (const set of res) {
      const i3 = set.songs.findIndex((s) => s.id === 'S3');
      const i8 = set.songs.findIndex((s) => s.id === 'S8');
      if (i3 >= 0 && i8 >= 0 && i8 !== i3 + 1) return false; // must be immediately after, in order
    }
    return true;
  }));
});

test('"pair together" never splits the pair across sets', () => {
  assert.ok(everyTrial(40, () => {
    const res = generateSetlistsCore(makeLibrary(20), baseOpts({ songAffinities: [['S3', 'S8']] }));
    const a = setOfSong(res, 'S3');
    const b = setOfSong(res, 'S8');
    return !(a >= 0 && b >= 0 && a !== b);
  }));
});

test('affinity chain A→B→C stays contiguous and ordered', () => {
  assert.ok(everyTrial(40, () => {
    const res = generateSetlistsCore(makeLibrary(20), baseOpts({
      songAffinities: [['S2', 'S5'], ['S5', 'S9']], defaultSetDuration: 30,
    }));
    for (const set of res) {
      const i2 = set.songs.findIndex((s) => s.id === 'S2');
      const i5 = set.songs.findIndex((s) => s.id === 'S5');
      const i9 = set.songs.findIndex((s) => s.id === 'S9');
      if (i2 >= 0 && i5 >= 0 && i5 !== i2 + 1) return false;
      if (i5 >= 0 && i9 >= 0 && i9 !== i5 + 1) return false;
    }
    return true;
  }));
});

test('"keep apart" never places the pair adjacent', () => {
  assert.ok(everyTrial(40, () => {
    const res = generateSetlistsCore(makeLibrary(20), baseOpts({ songAntiAffinities: [['S3', 'S8']] }));
    for (const set of res) {
      for (let k = 1; k < set.songs.length; k++) {
        const a = set.songs[k - 1].id, b = set.songs[k].id;
        if ((a === 'S3' && b === 'S8') || (a === 'S8' && b === 'S3')) return false;
      }
    }
    return true;
  }));
});

// --- Tonal-gravity path (real tonal scoring; refinement must respect pairings) --

test('tonal refinement keeps an affinity pair adjacent', () => {
  assert.ok(everyTrial(30, () => {
    const songs = makeLibrary(18, (i) => ({ key: ['C', 'G', 'D', 'A', 'E', 'F'][i % 6] }));
    const res = generateSetlistsCore_WithTonalGravity(songs, baseOpts({
      useTonalGravity: true, tonalSmoothness: 70, songAffinities: [['S3', 'S8']], defaultSetDuration: 24,
    }));
    for (const set of res) {
      const i3 = set.songs.findIndex((s) => s.id === 'S3');
      const i8 = set.songs.findIndex((s) => s.id === 'S8');
      if (i3 >= 0 && i8 >= 0 && Math.abs(i3 - i8) !== 1) return false;
    }
    return true;
  }));
});

test('tonal refinement keeps an anti pair non-adjacent', () => {
  assert.ok(everyTrial(30, () => {
    const songs = makeLibrary(18, (i) => ({ key: ['C', 'G', 'D', 'A', 'E', 'F'][i % 6] }));
    const res = generateSetlistsCore_WithTonalGravity(songs, baseOpts({
      useTonalGravity: true, songAntiAffinities: [['S3', 'S8']], defaultSetDuration: 24,
    }));
    for (const set of res) {
      for (let k = 1; k < set.songs.length; k++) {
        const a = set.songs[k - 1].id, b = set.songs[k].id;
        if ((a === 'S3' && b === 'S8') || (a === 'S8' && b === 'S3')) return false;
      }
    }
    return true;
  }));
});

// --- Deep (simulated annealing) path -------------------------------------------

test('deep-mode SA preserves affinity and separates anti', () => {
  assert.ok(everyTrial(20, () => {
    const songs = makeLibrary(20, (i) => ({ key: ['C', 'G', 'D', 'A'][i % 4] }));
    const res = generateSetlistsCore_WithTonalGravity(songs, baseOpts({
      numSets: 1, defaultSetDuration: 60, useEnergyCurve: true, useTonalGravity: true,
      optimizationLevel: 'deep', songAffinities: [['S3', 'S8']], songAntiAffinities: [['S5', 'S12']],
    }));
    for (const set of res) {
      const i3 = set.songs.findIndex((s) => s.id === 'S3');
      const i8 = set.songs.findIndex((s) => s.id === 'S8');
      if (i3 >= 0 && i8 >= 0 && Math.abs(i3 - i8) !== 1) return false;
      for (let k = 1; k < set.songs.length; k++) {
        const a = set.songs[k - 1].id, b = set.songs[k].id;
        if ((a === 'S5' && b === 'S12') || (a === 'S12' && b === 'S5')) return false;
      }
    }
    return !hasDuplicate(flatIds(res));
  }));
});
