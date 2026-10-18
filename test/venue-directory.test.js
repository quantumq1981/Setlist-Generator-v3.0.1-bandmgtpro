'use strict';
/*
 * Built-in Vegas venue directory — data integrity. The directory browser and
 * bulkAddVenues both dedup by lowercase name, so a duplicate name here would
 * silently hide one of the two entries; closed rooms must never be listed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { VENUE_DIRECTORY, VENUE_TYPES, directoryEntryToVenue } = algorithm;
const key = (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

test('no duplicate names (case- and accent-insensitive)', () => {
  const seen = new Map();
  for (const d of VENUE_DIRECTORY) {
    const k = key(d.name);
    assert.ok(!seen.has(k), `duplicate directory name: "${d.name}" vs "${seen.get(k)}"`);
    seen.set(k, d.name);
  }
  assert.ok(VENUE_DIRECTORY.length >= 230);
});

test('every entry is well-formed', () => {
  for (const d of VENUE_DIRECTORY) {
    assert.ok(d.region && d.name && d.city, `missing region/name/city: ${d.name}`);
    assert.ok(VENUE_TYPES.includes(d.type), `bad type "${d.type}" on ${d.name}`);
    assert.equal(d.state, 'NV');
    assert.equal(typeof d.verified, 'boolean');
    if (d.email) assert.match(d.email, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, `bad email on ${d.name}`);
  }
});

test('closed and not-a-fit rooms are not listed', () => {
  const names = VENUE_DIRECTORY.map(d => key(d.name));
  for (const dead of ['fat cat', 'mama rabbit', 'vino del lago', 'skyfall', 'double down', 'foundation room']) {
    assert.ok(!names.some(n => n.includes(dead)), `closed/unfit venue listed: ${dead}`);
  }
});

test('the direct-booking leads carry their published channels', () => {
  const byName = Object.fromEntries(VENUE_DIRECTORY.map(d => [d.name, d]));
  assert.equal(byName['The Sand Dollar Lounge'].email, 'booking@thesanddollarlv.com');
  assert.equal(byName["Vic's Las Vegas"].email, 'chris@stoneys.com');
  assert.equal(byName['The Dispensary Lounge'].email, 'ulimusic@gmail.com');
  assert.equal(byName['Maxan Jazz Club'].email, 'owner@maxanjazz.com');
  assert.equal(byName['Gold Mine Tavern'].email, 'sam@goldminetavern.com');
  assert.equal(byName['Category 10 (Flamingo)'].email, 'promotions@category10.com');
});

test('directoryEntryToVenue flags unverified entries and keeps contacts', () => {
  const unverified = VENUE_DIRECTORY.find(d => !d.verified);
  const v = directoryEntryToVenue(unverified);
  assert.match(v.notes, /verify current booking contact/);
  assert.equal(v.status, 'prospect');
  const gm = directoryEntryToVenue(VENUE_DIRECTORY.find(d => d.name === 'Gold Mine Tavern'));
  assert.equal(gm.email, 'sam@goldminetavern.com');
  assert.doesNotMatch(gm.notes, /verify current booking contact/);
  assert.match(gm.notes, /23 S Water St/);
});
