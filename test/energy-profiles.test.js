'use strict';
/*
 * Energy/tonal optimizer profiles — the pure extract/apply pair behind "save the current
 * optimizer knobs as a reusable profile, then reapply it". extractEnergyProfile picks only
 * the optimizer fields off a settings object; applyEnergyProfile merges a saved profile's
 * config back onto a settings object without disturbing anything else. The Profile-bar UI
 * (save/load/delete + persistence) is exercised in the headless drive.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { ENERGY_PROFILE_FIELDS, extractEnergyProfile, applyEnergyProfile } = algorithm;

const FULL = {
  numSets: 3, setDuration: 50, allowSongReuse: true,          // non-optimizer noise
  useEnergyCurve: true, energyCurveType: 'party', energyWeight: 0.5,
  useTonalGravity: true, tonalSmoothness: 40, anchorKey: 'A', tonalWeight: 0.3,
  setTemplate: 'slowBurn', optimizationLevel: 'deep', randomness: 20, diversityWeight: 0.8,
};

test('extractEnergyProfile picks exactly the optimizer fields, nothing else', () => {
  const cfg = extractEnergyProfile(FULL);
  assert.deepEqual(Object.keys(cfg).sort(), [...ENERGY_PROFILE_FIELDS].sort());
  assert.equal(cfg.energyCurveType, 'party');
  assert.equal(cfg.optimizationLevel, 'deep');
  // non-optimizer fields must not leak into the profile
  assert.equal('numSets' in cfg, false);
  assert.equal('allowSongReuse' in cfg, false);
});

test('extractEnergyProfile omits fields absent from settings', () => {
  const cfg = extractEnergyProfile({ energyWeight: 0.4 });
  assert.deepEqual(cfg, { energyWeight: 0.4 });
});

test('applyEnergyProfile overlays the profile config and preserves other settings', () => {
  const base = { numSets: 2, setDuration: 45, energyCurveType: 'standard', optimizationLevel: 'standard', useTonalGravity: false, tonalWeight: 0.25 };
  const profile = { name: 'Party', config: extractEnergyProfile(FULL) };
  const out = applyEnergyProfile(base, profile);
  // optimizer fields come from the profile
  assert.equal(out.energyCurveType, 'party');
  assert.equal(out.optimizationLevel, 'deep');
  assert.equal(out.useTonalGravity, true);
  assert.equal(out.tonalWeight, 0.3);
  // non-optimizer fields untouched
  assert.equal(out.numSets, 2);
  assert.equal(out.setDuration, 45);
  // input not mutated
  assert.equal(base.energyCurveType, 'standard');
});

test('extract → apply is a faithful round-trip of the optimizer knobs', () => {
  const restored = applyEnergyProfile({}, { config: extractEnergyProfile(FULL) });
  ENERGY_PROFILE_FIELDS.forEach(f => assert.deepEqual(restored[f], FULL[f]));
});

test('applyEnergyProfile tolerates a missing/empty config', () => {
  const base = { energyWeight: 0.35, numSets: 4 };
  assert.deepEqual(applyEnergyProfile(base, null), base);
  assert.deepEqual(applyEnergyProfile(base, {}), base);
  assert.deepEqual(applyEnergyProfile(base, { config: {} }), base);
});
