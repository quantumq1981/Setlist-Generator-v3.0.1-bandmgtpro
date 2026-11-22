'use strict';
/*
 * Audit §12 #4/#5 + minor: reply detection must (a) not count bounces / auto-replies as a
 * buyer's reply, (b) patch the LIVE venue instead of overwriting it with a stale copy, and
 * (c) refuse header injection through an imported address.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');
const { gmailMessageKind, gmailClassifyThread, gmailThreadHasReply, gmailBuildRfc2822,
  applyVenuePatch, venueNeedsEmail, venueEmailBounced, nextActionFor } = algorithm;

const ME = 'me@band.com';
const msg = (headers) => ({ payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) } });

test('a mailer-daemon NDR in the thread is a bounce, not a reply', () => {
  const thread = { messages: [
    msg({ From: 'Me <me@band.com>', Subject: 'Live music' }),
    msg({ From: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', Subject: 'Delivery Status Notification (Failure)' }),
  ] };
  assert.deepEqual(gmailClassifyThread(thread, ME), { replied: false, bounced: true, autoReplied: false });
  assert.equal(gmailThreadHasReply(thread, ME), false);
});

test('bounces are recognised by sender, DSN content type, or subject', () => {
  assert.equal(gmailMessageKind(msg({ From: 'postmaster@venue.com' }), ME), 'bounce');
  assert.equal(gmailMessageKind(msg({ From: 'x@relay.net', 'Content-Type': 'multipart/report; report-type=delivery-status' }), ME), 'bounce');
  assert.equal(gmailMessageKind(msg({ From: 'Exchange <ex@venue.com>', Subject: 'Undeliverable: Live music' }), ME), 'bounce');
});

test('auto-replies (OOO, no-reply, Auto-Submitted, Precedence) are not replies', () => {
  assert.equal(gmailMessageKind(msg({ From: 'Jane <jane@venue.com>', 'Auto-Submitted': 'auto-replied' }), ME), 'auto');
  assert.equal(gmailMessageKind(msg({ From: 'jane@venue.com', Subject: 'Automatic reply: Live music' }), ME), 'auto');
  assert.equal(gmailMessageKind(msg({ From: 'jane@venue.com', Subject: 'Out of Office' }), ME), 'auto');
  assert.equal(gmailMessageKind(msg({ From: 'noreply@venue.com' }), ME), 'auto');
  assert.equal(gmailMessageKind(msg({ From: 'jane@venue.com', Precedence: 'auto_reply' }), ME), 'auto');
  assert.equal(gmailMessageKind(msg({ From: 'jane@venue.com', 'X-Autoreply': 'yes' }), ME), 'auto');
});

test('a human reply still counts — including Auto-Submitted: no and "Re:" subjects', () => {
  assert.equal(gmailMessageKind(msg({ From: 'Jane <jane@venue.com>', Subject: 'Re: Live music', 'Auto-Submitted': 'no' }), ME), 'reply');
  const thread = { messages: [
    msg({ From: ME, Subject: 'Live music' }),
    msg({ From: 'Jane <JANE@venue.com>', Subject: 'Re: Out of office next week, but yes let us talk' }),
    msg({ From: 'mailer-daemon@googlemail.com' }),
  ] };
  assert.equal(gmailClassifyThread(thread, ME).replied, true);
  assert.equal(gmailMessageKind(msg({ From: 'Me <ME@band.com>' }), ME), 'mine');
  assert.equal(gmailMessageKind(msg({ Subject: 'x' }), ME), 'none');
});

test('applyVenuePatch merges into the live venue and never loses a concurrent change', () => {
  const stale = { id: 'v', status: 'contacted', contactLog: [{ kind: 'sent', date: '2026-11-01' }] };
  // While the check ran, the user logged a call and booked the room.
  const live = { ...stale, status: 'booked', contactLog: [...stale.contactLog, { kind: 'call', outcome: 'interested' }, { kind: 'status', status: 'booked' }] };
  const guard = (cur) => (cur.status === 'contacted' ? { status: 'responded', lastReplyCheckAt: 1 } : { lastReplyCheckAt: 1 });
  const out = applyVenuePatch(live, guard, '2026-11-22');
  assert.equal(out.status, 'booked');                 // not pulled back to Responded
  assert.equal(out.contactLog.length, 3);             // the call survives
  assert.equal(out.lastReplyCheckAt, 1);
  const moved = applyVenuePatch(stale, guard, '2026-11-22');
  assert.equal(moved.status, 'responded');
  assert.deepEqual(moved.contactLog.at(-1), { date: '2026-11-22', kind: 'status', status: 'responded' });
  assert.equal(applyVenuePatch(live, () => null, 'd'), live);
});

test('a bounced address puts the venue back in the needs-email queue until it changes', () => {
  const v = { id: 'v', status: 'contacted', email: 'old@venue.com', bouncedEmail: 'OLD@venue.com', phone: '', lastContactDate: '2026-11-01', contactLog: [{ kind: 'sent' }] };
  assert.equal(venueEmailBounced(v), true);
  assert.equal(venueNeedsEmail(v), true);
  assert.equal(nextActionFor(v, { today: '2026-11-22' }).action, 'find_email');   // no follow-up to a dead inbox
  const fixed = { ...v, email: 'new@venue.com' };
  assert.equal(venueNeedsEmail(fixed), false);
  assert.equal(nextActionFor(fixed, { today: '2026-11-22' }).action, 'followup');
});

test('gmailBuildRfc2822 refuses CR/LF in To/From (header injection)', () => {
  assert.throws(() => gmailBuildRfc2822({ to: 'a@b.com\r\nBcc: evil@x.com', subject: 's', body: 'b' }), /line break/);
  assert.throws(() => gmailBuildRfc2822({ to: 'a@b.com', from: 'me@x.com\nBcc: e@x', subject: 's', body: 'b' }), /line break/);
  assert.match(gmailBuildRfc2822({ to: 'a@b.com', subject: 'Line\r\nBcc: x', body: 'b' }), /^Subject: =\?UTF-8\?B\?/m);   // subject is encoded, not injected
});
