'use strict';
/*
 * Outreach sequences ("Today's Outreach") — the pure sequence brain. Which action
 * a venue resolves to today, snooze handling, halt-on-reply, sequence exhaustion,
 * the daily send counter, and date arithmetic.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { MAX_SEQUENCE_SENDS, SEQUENCE_STEP_DAYS, addDaysISO, sendsToday, nextActionFor } = algorithm;

const TODAY = '2026-07-16';
const sent = (date, n = 1) => Array.from({ length: n }, () => ({ date, kind: 'sent', template: 'Initial Outreach' }));
const ctx = (rebookDue = false) => ({ today: TODAY, rebookDue });

test('addDaysISO does calendar math across month boundaries', () => {
  assert.equal(addDaysISO('2026-07-16', 7), '2026-07-23');
  assert.equal(addDaysISO('2026-07-28', 7), '2026-08-04');
  assert.equal(addDaysISO('bogus', 7), 'bogus');
});

test('prospect routing: email → first outreach, phone-only → call, neither → find_email', () => {
  assert.deepEqual(nextActionFor({ status: 'prospect', email: 'a@b.com' }, ctx()), { action: 'first_outreach', template: 'outreach' });
  assert.deepEqual(nextActionFor({ status: 'prospect', email: '', phone: '(702) 555-1234' }, ctx()), { action: 'call', template: null });
  assert.deepEqual(nextActionFor({ status: 'prospect' }, ctx()), { action: 'find_email', template: null });
});

test('contacted venue comes due for a follow-up only after the step interval', () => {
  const recent = { status: 'contacted', email: 'a@b.com', lastContactDate: addDaysISO(TODAY, -(SEQUENCE_STEP_DAYS - 1)), contactLog: sent('2026-07-10') };
  assert.equal(nextActionFor(recent, ctx()), null);
  const due = { ...recent, lastContactDate: addDaysISO(TODAY, -SEQUENCE_STEP_DAYS) };
  assert.deepEqual(nextActionFor(due, ctx()), { action: 'followup', template: 'followup' });
});

test('sequence exhausts after MAX_SEQUENCE_SENDS sends with no reply', () => {
  const v = { status: 'contacted', email: 'a@b.com', lastContactDate: '2026-07-01', contactLog: sent('2026-07-01', MAX_SEQUENCE_SENDS) };
  assert.deepEqual(nextActionFor(v, ctx()), { action: 'exhausted', template: null });
});

test('the sequence halts the moment the buyer moves (responded/call_scheduled/booked/pass)', () => {
  for (const status of ['responded', 'call_scheduled', 'booked', 'pass']) {
    assert.equal(nextActionFor({ status, email: 'a@b.com', lastContactDate: '2026-06-01' }, ctx()), null, `${status} is out of the automated queue`);
  }
});

test('snooze hides a venue until the date passes', () => {
  const v = { status: 'prospect', email: 'a@b.com', snoozedUntil: addDaysISO(TODAY, 3) };
  assert.equal(nextActionFor(v, ctx()), null);
  assert.notEqual(nextActionFor({ ...v, snoozedUntil: TODAY }, ctx()), null, 'due again the day the snooze expires');
});

test('a rebook-due room outranks everything else — but only once per step interval', () => {
  const v = { status: 'booked', email: 'a@b.com' };
  assert.deepEqual(nextActionFor(v, ctx(true)), { action: 'rebook', template: 'postGig' });
  const justAsked = { ...v, lastContactDate: addDaysISO(TODAY, -1) };
  assert.equal(nextActionFor(justAsked, ctx(true)), null, 'rebook nudge sent yesterday does not re-queue');
  const askedAgesAgo = { ...v, lastContactDate: addDaysISO(TODAY, -SEQUENCE_STEP_DAYS) };
  assert.deepEqual(nextActionFor(askedAgesAgo, ctx(true)), { action: 'rebook', template: 'postGig' });
});

test('contacted but email-less venues fall back to the call / find-email motions', () => {
  assert.deepEqual(nextActionFor({ status: 'contacted', phone: '555', contactLog: sent('2026-07-01') }, ctx()), { action: 'call', template: null });
  assert.deepEqual(nextActionFor({ status: 'contacted', contactLog: sent('2026-07-01') }, ctx()), { action: 'find_email', template: null });
});

test('sendsToday counts only sends stamped today — not calls, not older sends', () => {
  const venues = [
    { contactLog: [...sent(TODAY, 2), ...sent('2026-07-10'), { date: TODAY, kind: 'call', outcome: 'voicemail' }] },
    { contactLog: sent(TODAY) },
    { contactLog: [{ date: TODAY, kind: 'status', status: 'responded' }] },
  ];
  assert.equal(sendsToday(venues, TODAY), 3);
});
