'use strict';
/*
 * EPK link infrastructure — per-venue tagged links so host analytics show which
 * buyer clicked. Slug sanitization and query-string composition.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { epkVenueSlug, epkLinkForVenue, genTrackingToken, VENUE_FORMATS } = algorithm;

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

// ── PR #128: per-venue format + tracking-token links ────────────────────────

test('genTrackingToken produces short url-safe tokens that are not constant', () => {
  const seen = new Set();
  for (let i = 0; i < 50; i++) {
    const t = genTrackingToken();
    assert.match(t, /^[a-z0-9]{6}$/, `token "${t}" should be 6 lowercase base36 chars`);
    seen.add(t);
  }
  assert.ok(seen.size > 1, 'tokens should vary across calls');
});

test('epkLinkForVenue tags venues with a trackingToken using ?act=&track= instead of ?ref=', () => {
  const v = { name: 'Test Tavern', preferredFormat: 'band', trackingToken: 'v7x9p2' };
  assert.equal(epkLinkForVenue('https://quantumq1981.github.io/chriszemba-EPK/', v),
    'https://quantumq1981.github.io/chriszemba-EPK/?act=band&track=v7x9p2');
  // Existing query string on the base URL: appended with &, not ?
  assert.equal(epkLinkForVenue('https://example.com/epk?utm=1', v),
    'https://example.com/epk?utm=1&act=band&track=v7x9p2');
});

test('epkLinkForVenue defaults to the "band" act for an unset/invalid preferredFormat, and covers every declared format', () => {
  assert.equal(epkLinkForVenue('https://a.com', { name: 'X', trackingToken: 'abc123' }),
    'https://a.com?act=band&track=abc123', 'blank preferredFormat falls back to band');
  assert.equal(epkLinkForVenue('https://a.com', { name: 'X', preferredFormat: 'not-a-real-format', trackingToken: 'abc123' }),
    'https://a.com?act=band&track=abc123', 'unrecognized preferredFormat falls back to band');
  VENUE_FORMATS.forEach(f => {
    assert.equal(epkLinkForVenue('https://a.com', { name: 'X', preferredFormat: f, trackingToken: 'abc123' }),
      `https://a.com?act=${f}&track=abc123`);
  });
});

test('epkLinkForVenue falls back to the legacy ?ref=<slug> scheme for venues with no trackingToken', () => {
  // Venues created before PR #128 (or any object missing the field) keep the old behavior.
  const v = { name: 'Test Tavern', preferredFormat: 'band' };
  assert.equal(epkLinkForVenue('https://zemba.example.com/epk', v), 'https://zemba.example.com/epk?ref=test-tavern');
});

test('epkLinkForVenue URL-encodes act/track values that need it', () => {
  const v = { name: 'X', preferredFormat: 'band', trackingToken: 'a b&c' };
  assert.equal(epkLinkForVenue('https://a.com', v), 'https://a.com?act=band&track=a%20b%26c');
});
