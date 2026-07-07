'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { algorithm, makeLibrary } = require('./helpers.js');
const {
  ENERGY_ARC_SHAPES, getCompositeEnergy, targetEnergyCurve,
  circleDistance_TG, normalizeKey_TG, calculateSetlistQualityScore,
} = algorithm;

const sample = (fn, n = 101) => Array.from({ length: n }, (_, i) => fn(i / (n - 1)));
const countLocalMaxima = (ys, eps = 1e-4) => {
  let peaks = 0;
  for (let i = 1; i < ys.length - 1; i++) if (ys[i] > ys[i - 1] + eps && ys[i] >= ys[i + 1] - eps) peaks++;
  return peaks;
};

// --- Energy arc shapes (Curve Presets) -----------------------------------------

test('classic arc has a single interior summit', () => {
  assert.equal(countLocalMaxima(sample(ENERGY_ARC_SHAPES.classic)), 1);
});

test('doublePeak has two summits with a valley between', () => {
  const ys = sample(ENERGY_ARC_SHAPES.doublePeak);
  assert.equal(countLocalMaxima(ys), 2, 'exactly two peaks');
  const mid = ys[Math.round(0.5 * (ys.length - 1))];
  assert.ok(mid < ys[Math.round(0.24 * (ys.length - 1))], 'mid-set dips below first peak');
  assert.ok(mid < ys[Math.round(0.74 * (ys.length - 1))], 'mid-set dips below second peak');
});

test('slowBurn rises monotonically to a late peak', () => {
  const ys = sample(ENERGY_ARC_SHAPES.slowBurn);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1] - 1e-9, 'non-decreasing at ' + i);
  assert.ok(ys[ys.length - 1] > ys[0], 'ends higher than it starts');
});

test('highEnergy plateaus high with one strategic mid dip', () => {
  const ys = sample(ENERGY_ARC_SHAPES.highEnergy);
  const mid = ys[Math.round(0.5 * (ys.length - 1))];
  assert.ok(mid < ys[Math.round(0.2 * (ys.length - 1))], 'mid below early plateau');
  assert.ok(mid < ys[Math.round(0.8 * (ys.length - 1))], 'mid below late plateau');
});

// --- Composite energy ----------------------------------------------------------

test('explicit per-song energy overrides style+BPM and is clamped to 1..10', () => {
  assert.equal(getCompositeEnergy({ energy: 9, style: 'ballad', bpm: '60' }), 9, 'manual wins');
  assert.equal(getCompositeEnergy({ energy: 15 }), 10, 'clamped high');
  assert.equal(getCompositeEnergy({ energy: -3, style: 'ballad' }), getCompositeEnergy({ style: 'ballad' }),
    'non-positive manual falls back to style');
});

test('composite energy blends style and BPM when no override', () => {
  const e = getCompositeEnergy({ style: 'rock', bpm: '120' });
  assert.ok(e > 1 && e < 10);
  assert.equal(getCompositeEnergy({}), 4, 'neutral default with no data');
});

// --- targetEnergyCurve ---------------------------------------------------------

test('targetEnergyCurve stays within the 1..10 band for all presets and positions', () => {
  for (const preset of ['standard', 'party', 'jazz', 'festival', 'wedding', 'acoustic']) {
    for (const tpl of ['freeform', 'classic', 'doublePeak', 'slowBurn', 'highEnergy']) {
      for (let p = 0; p <= 1.0001; p += 0.1) {
        const v = targetEnergyCurve(p, preset, tpl);
        assert.ok(v >= 1 && v <= 10, `${preset}/${tpl}@${p.toFixed(1)} = ${v}`);
      }
    }
  }
});

// --- Circle-of-fifths distance -------------------------------------------------

test('circleDistance_TG is zero on identity, symmetric, and never exceeds 6', () => {
  const tonics = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  for (const a of tonics) {
    assert.equal(circleDistance_TG(a, a), 0, `identity ${a}`);
    for (const b of tonics) {
      const d = circleDistance_TG(a, b);
      assert.equal(d, circleDistance_TG(b, a), `symmetry ${a},${b}`);
      assert.ok(d >= 0 && d <= 6, `range ${a},${b} = ${d}`);
    }
  }
});

// --- Key parsing ---------------------------------------------------------------

test('normalizeKey_TG parses major and minor keys', () => {
  const major = normalizeKey_TG('C');
  const minor = normalizeKey_TG('Am');
  assert.ok(major && typeof major.tonic === 'string' && major.mode === 'major');
  assert.ok(minor && typeof minor.tonic === 'string' && minor.mode === 'minor');
  assert.equal(minor.tonic, 'A', 'Am tonic is A');
  assert.ok(normalizeKey_TG('F#'), 'accidental parses');
});

// --- Quality score -------------------------------------------------------------

test('calculateSetlistQualityScore returns 0..100 sub-scores', () => {
  const songs = makeLibrary(8, (i) => ({ key: ['C', 'G', 'D', 'A'][i % 4], bpm: String(90 + i * 8) }));
  const set = { songs, totalTime: songs.reduce((s, x) => s + x.duration, 0) };
  const q = calculateSetlistQualityScore(set, {
    useEnergyCurve: true, useTonalGravity: true, setDuration: 32, setTemplate: 'classic',
  });
  for (const k of ['overall', 'energy', 'tonal', 'diversity', 'duration']) {
    assert.ok(typeof q[k] === 'number' && q[k] >= 0 && q[k] <= 100, `${k}=${q[k]}`);
  }
});
