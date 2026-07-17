'use strict';
/*
 * EPK link infrastructure — per-venue tagged links so host analytics show which
 * buyer clicked. Slug sanitization and query-string composition.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { epkVenueSlug, epkLinkForVenue } = algorithm;

test('epkVenueSlug sanitizes venue names into url-safe slugs', () => {
  assert.equal(epkVenueSlug({ name: "Danny's Hideaway & Grill" }), 'danny-s-hideaway-grill');
  assert.equal(epkVenueSlug({ name: '  The   Blue Room  ' }), 'the-blue-room');
  assert.equal(epkVenueSlug({ name: '™©®' }), 'venue', 'all-symbol names fall back');
  assert.equal(epkVenueSlug(null), 'venue');
  assert.ok(epkVenueSlug({ name: 'x'.repeat(100) }).length <= 40, 'capped length');
});

test('epkLinkForVenue appends ?ref=<slug>, or &ref= when the url already has a query', () => {
  const v = { name: 'Test Tavern' };
  assert.equal(epkLinkForVenue('https://zemba.example.com/epk', v), 'https://zemba.example.com/epk?ref=test-tavern');
  assert.equal(epkLinkForVenue('https://zemba.example.com/epk?utm=1', v), 'https://zemba.example.com/epk?utm=1&ref=test-tavern');
});

test('epkLinkForVenue edge cases: empty url → empty; no venue → untouched url', () => {
  assert.equal(epkLinkForVenue('', { name: 'X' }), '');
  assert.equal(epkLinkForVenue('  ', { name: 'X' }), '');
  assert.equal(epkLinkForVenue('https://a.com/epk', null), 'https://a.com/epk');
});
