'use strict';
/*
 * Contact enrichment + phone-first outreach — pure helpers. The "needs email"
 * predicate, the Google lookup deep-link, call-outcome application (status
 * advancement without regression, touch stamping, kind:'call' logging), and the
 * personalized call script.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { venueNeedsEmail, googleEmailSearchUrl, CALL_OUTCOMES, applyCallOutcome, buildCallScript } = algorithm;

test('venueNeedsEmail: missing, blank, and whitespace emails count as needing one', () => {
  assert.equal(venueNeedsEmail({ name: 'X' }), true);
  assert.equal(venueNeedsEmail({ name: 'X', email: '  ' }), true);
  assert.equal(venueNeedsEmail({ name: 'X', email: 'a@b.com' }), false);
  assert.equal(venueNeedsEmail(null), false);
});

test('googleEmailSearchUrl quotes the venue name and includes location + booking terms', () => {
  const url = googleEmailSearchUrl({ name: "Danny's Hideaway", city: 'Las Vegas', state: 'NV' });
  assert.ok(url.startsWith('https://www.google.com/search?q='));
  const q = decodeURIComponent(url.split('q=')[1]);
  assert.equal(q, `"Danny's Hideaway" Las Vegas NV booking email contact`);
});

test('CALL_OUTCOMES: unique keys, every entry carries label/status/touch', () => {
  const keys = CALL_OUTCOMES.map((o) => o.key);
  assert.equal(new Set(keys).size, keys.length);
  for (const o of CALL_OUTCOMES) {
    assert.ok(o.label && typeof o.touch === 'boolean' && 'status' in o, `outcome ${o.key} is fully specified`);
  }
});

const prospect = () => ({ id: 'v1', name: 'Room', status: 'prospect', lastContactDate: '', contactLog: [] });

test('voicemail: logs a call, stamps the touch, bumps prospect → contacted', () => {
  const v = applyCallOutcome(prospect(), 'voicemail', '2026-07-16');
  assert.equal(v.status, 'contacted');
  assert.equal(v.lastContactDate, '2026-07-16');
  assert.deepEqual(v.contactLog, [{ date: '2026-07-16', kind: 'call', outcome: 'voicemail' }]);
});

test('no_answer: logs the attempt but changes neither status nor lastContactDate', () => {
  const base = { ...prospect(), lastContactDate: '2026-07-01' };
  const v = applyCallOutcome(base, 'no_answer', '2026-07-16');
  assert.equal(v.status, 'prospect');
  assert.equal(v.lastContactDate, '2026-07-01');
  assert.equal(v.contactLog.length, 1);
  assert.equal(v.contactLog[0].outcome, 'no_answer');
});

test('interested advances to responded but never regresses a later stage', () => {
  assert.equal(applyCallOutcome(prospect(), 'interested', '2026-07-16').status, 'responded');
  const scheduled = { ...prospect(), status: 'call_scheduled' };
  assert.equal(applyCallOutcome(scheduled, 'interested', '2026-07-16').status, 'call_scheduled');
  const booked = { ...prospect(), status: 'booked' };
  assert.equal(applyCallOutcome(booked, 'voicemail', '2026-07-16').status, 'booked');
});

test('pass marks the venue passed — except a booked room stays booked', () => {
  assert.equal(applyCallOutcome({ ...prospect(), status: 'responded' }, 'pass', '2026-07-16').status, 'pass');
  assert.equal(applyCallOutcome({ ...prospect(), status: 'booked' }, 'pass', '2026-07-16').status, 'booked');
});

test('unknown outcome is a no-op', () => {
  const base = prospect();
  assert.equal(applyCallOutcome(base, 'nope', '2026-07-16'), base);
});

test('buildCallScript personalizes from EPK + venue and includes the email-capture branch', () => {
  const s = buildCallScript({
    bandName: 'Zemba Music',
    epk: { actType: 'a solo-to-full-band act', location: 'Las Vegas', tagline: 'High-energy rock & soul.', genres: 'Rock, Soul', formats: 'Solo, Duo, Full band', contactPhone: '(702) 555-0000', contactEmail: 'book@zemba.com' },
    venue: { name: 'The Copper Still', contactName: 'Dana' },
    pitch: 'For a neighborhood bar, we build the night around groove-heavy favorites.',
  });
  for (const needle of ['Zemba Music', 'Dana', 'The Copper Still', 'High-energy rock & soul.',
    'groove-heavy favorites', "what's the best email for booking", 'VOICEMAIL VERSION', '(702) 555-0000']) {
    assert.ok(s.includes(needle), `script includes: ${needle}`);
  }
});

test('buildCallScript survives empty inputs with sensible fallbacks', () => {
  const s = buildCallScript({});
  assert.ok(s.includes('whoever books your entertainment'));
  assert.ok(s.includes('your venue'));
  assert.ok(s.includes('VOICEMAIL VERSION'));
});
