'use strict';
/*
 * Feedback-driven scoring — the learning loop. Outcome extraction from contact
 * logs (attempted/replied + template attribution), aggregation by room type and
 * template, Laplace-smoothed multipliers with min-sample gating and clamps, and
 * the best-performer insight picker.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { MIN_LEARN_SAMPLE, venueOutcome, collectOutreachStats, smoothedRate, typeScoreMultiplier, bestStatInsight } = algorithm;

const sent = (date, template) => ({ date, kind: 'sent', template });
const statusEv = (date, status) => ({ date, kind: 'status', status });

test('venueOutcome: untouched venue is not attempted; a no_answer ring-out alone is not a touch', () => {
  assert.equal(venueOutcome({ type: 'Bar', contactLog: [] }).attempted, false);
  assert.equal(venueOutcome({ type: 'Bar', contactLog: [{ date: '2026-07-01', kind: 'call', outcome: 'no_answer' }] }).attempted, false);
  assert.equal(venueOutcome({ type: 'Bar', contactLog: [{ date: '2026-07-01', kind: 'call', outcome: 'voicemail' }] }).attempted, true);
});

test('venueOutcome: reply detected from the status log and attributed to the last send before it', () => {
  const o = venueOutcome({
    type: 'Bar', status: 'responded',
    contactLog: [sent('2026-07-01', 'Initial Outreach'), sent('2026-07-08', 'Follow-Up'), statusEv('2026-07-09', 'responded'), sent('2026-07-20', 'Booking Confirmed')],
  });
  assert.equal(o.replied, true);
  assert.equal(o.repliedTemplate, 'Follow-Up', 'reply attributed to the send just before the status move');
});

test('venueOutcome: legacy manual bumps (status field, no log event) still count as replied', () => {
  const o = venueOutcome({ type: 'Lounge', status: 'call_scheduled', contactLog: [sent('2026-07-01', 'Initial Outreach')] });
  assert.equal(o.replied, true);
});

test('collectOutreachStats aggregates by room type and template', () => {
  const venues = [
    { type: 'Bar', status: 'responded', contactLog: [sent('2026-07-01', 'Initial Outreach'), statusEv('2026-07-02', 'responded')] },
    { type: 'Bar', status: 'contacted', contactLog: [sent('2026-07-01', 'Initial Outreach')] },
    { type: 'Restaurant', status: 'contacted', contactLog: [sent('2026-07-01', 'Follow-Up')] },
    { type: 'Restaurant', status: 'prospect', contactLog: [] }, // never attempted → excluded
  ];
  const s = collectOutreachStats(venues);
  assert.deepEqual([s.attempted, s.replied], [3, 1]);
  assert.deepEqual(s.byType.Bar, { attempted: 2, replied: 1 });
  assert.deepEqual(s.byType.Restaurant, { attempted: 1, replied: 0 });
  assert.deepEqual(s.byTemplate['Initial Outreach'], { attempted: 2, replied: 1 });
});

test('smoothedRate keeps tiny samples honest', () => {
  assert.equal(smoothedRate(0, 0), 0.5);
  assert.ok(smoothedRate(1, 1) < 1, '1-for-1 is not treated as a 100% rate');
});

const mkStats = (barReplied, barN, restReplied, restN) => ({
  attempted: barN + restN, replied: barReplied + restReplied,
  byType: { Bar: { attempted: barN, replied: barReplied }, Restaurant: { attempted: restN, replied: restReplied } },
  byTemplate: {},
});

test('typeScoreMultiplier: neutral below the min sample, boosted/penalized within clamps above it', () => {
  const small = mkStats(2, MIN_LEARN_SAMPLE - 1, 0, MIN_LEARN_SAMPLE - 1);
  assert.equal(typeScoreMultiplier(small, 'Bar'), 1, 'under-sampled types stay neutral');
  const s = mkStats(4, 5, 0, 5);
  assert.equal(typeScoreMultiplier(s, 'Bar'), 1.4, 'strong over-performers clamp at 1.4');
  assert.equal(typeScoreMultiplier(s, 'Restaurant'), 0.6, 'dead types clamp at 0.6');
  assert.equal(typeScoreMultiplier(s, 'Casino'), 1, 'unseen types stay neutral');
  assert.equal(typeScoreMultiplier(null, 'Bar'), 1, 'no stats at all → neutral');
});

test('bestStatInsight picks the highest smoothed performer with enough data, else null', () => {
  assert.equal(bestStatInsight({ Bar: { attempted: MIN_LEARN_SAMPLE - 1, replied: 2 } }), null);
  const best = bestStatInsight({
    'Initial Outreach': { attempted: 6, replied: 1 },
    'Venue-Tailored Pitch': { attempted: 4, replied: 3 },
    'Follow-Up': { attempted: 2, replied: 2 }, // hot but under-sampled → ignored
  });
  assert.equal(best.key, 'Venue-Tailored Pitch');
  assert.deepEqual([best.replied, best.attempted, best.rate], [3, 4, 75]);
});
