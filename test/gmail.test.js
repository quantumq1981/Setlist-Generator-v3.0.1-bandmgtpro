'use strict';
/*
 * Gmail integration — pure helpers (§10). Message building (RFC 2822 + base64url),
 * reply detection over Gmail thread-metadata fixtures, and the reply-check
 * candidate filter (status + threadId + cooldown).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const {
  GMAIL_REPLY_CHECK_COOLDOWN_MS,
  gmailB64Utf8, gmailBase64Url, gmailEncodeHeader, gmailBuildRfc2822,
  gmailThreadHasReply, gmailReplyCheckCandidates,
} = algorithm;

const b64decodeUtf8 = (b64) => Buffer.from(b64, 'base64').toString('utf8');

test('gmailBase64Url is url-safe, unpadded, and round-trips UTF-8', () => {
  const s = 'Zemba Music — Sí señor 🎸';
  const enc = gmailBase64Url(s);
  assert.doesNotMatch(enc, /[+/=]/, 'must contain no +, /, or padding =');
  const std = enc.replace(/-/g, '+').replace(/_/g, '/');
  assert.equal(Buffer.from(std, 'base64').toString('utf8'), s);
});

test('gmailEncodeHeader leaves ASCII alone and RFC-2047-encodes non-ASCII', () => {
  assert.equal(gmailEncodeHeader('Live music inquiry'), 'Live music inquiry');
  const enc = gmailEncodeHeader('Nöche Live — booking');
  assert.match(enc, /^=\?UTF-8\?B\?.+\?=$/);
  assert.equal(b64decodeUtf8(enc.slice(10, -2)), 'Nöche Live — booking');
});

test('gmailBuildRfc2822 emits well-formed headers and a base64 UTF-8 body', () => {
  const msg = gmailBuildRfc2822({
    to: 'booking@venue.com',
    from: 'me@gmail.com',
    subject: 'Live music inquiry',
    body: 'Hi there,\n\nWe would love to play your room — Chris Zemba Band 🎸.\n',
  });
  const [head, bodyB64] = msg.split('\r\n\r\n');
  const lines = head.split('\r\n');
  assert.equal(lines[0], 'To: booking@venue.com');
  assert.equal(lines[1], 'From: me@gmail.com');
  assert.equal(lines[2], 'Subject: Live music inquiry');
  assert.ok(lines.includes('MIME-Version: 1.0'));
  assert.ok(lines.includes('Content-Type: text/plain; charset="UTF-8"'));
  assert.ok(lines.includes('Content-Transfer-Encoding: base64'));
  for (const l of bodyB64.split('\r\n')) assert.ok(l.length <= 76, 'body lines wrapped at 76 chars');
  assert.match(b64decodeUtf8(bodyB64.replace(/\r\n/g, '')), /Chris Zemba Band 🎸/);
});

test('gmailBuildRfc2822 omits From when unknown and survives an empty body', () => {
  const msg = gmailBuildRfc2822({ to: 'a@b.com', subject: 'Hi', body: '' });
  assert.doesNotMatch(msg, /^From:/m);
  assert.match(msg, /Content-Transfer-Encoding: base64\r\n\r\n$/);
});

const mkThread = (froms) => ({
  id: 't1',
  messages: froms.map((f) => ({ payload: { headers: [{ name: 'From', value: f }] } })),
});

test('gmailThreadHasReply: false while only the connected user has written', () => {
  const t = mkThread(['Chris Zemba <me@gmail.com>', 'me@gmail.com']);
  assert.equal(gmailThreadHasReply(t, 'me@gmail.com'), false);
});

test('gmailThreadHasReply: true when a foreign From appears (display-name form, any case)', () => {
  const t = mkThread(['me@gmail.com', 'Booker Sue <SUE@venue.com>']);
  assert.equal(gmailThreadHasReply(t, 'Me@Gmail.com'), true);
});

test('gmailThreadHasReply: safe on malformed input', () => {
  assert.equal(gmailThreadHasReply(null, 'me@gmail.com'), false);
  assert.equal(gmailThreadHasReply({}, 'me@gmail.com'), false);
  assert.equal(gmailThreadHasReply(mkThread(['x@y.com']), ''), false);
  assert.equal(gmailThreadHasReply({ messages: [{}, { payload: {} }] }, 'me@gmail.com'), false);
});

test('gmailReplyCheckCandidates picks only contacted venues with a Gmail threadId, honoring the cooldown', () => {
  const now = Date.now();
  const sentGmail = [{ kind: 'sent', template: 'Initial Outreach', threadId: 'th-1' }];
  const venues = [
    { id: 'a', status: 'contacted', contactLog: sentGmail },                                        // due
    { id: 'b', status: 'contacted', contactLog: [{ kind: 'sent', template: 'Initial Outreach' }] }, // mailto-only: no threadId
    { id: 'c', status: 'responded', contactLog: sentGmail },                                        // already advanced
    { id: 'd', status: 'contacted', contactLog: sentGmail, lastReplyCheckAt: now - 1000 },          // checked seconds ago
    { id: 'e', status: 'contacted', contactLog: sentGmail, lastReplyCheckAt: now - GMAIL_REPLY_CHECK_COOLDOWN_MS - 1000 }, // cooldown elapsed
    { id: 'f', status: 'prospect', contactLog: sentGmail },                                         // never contacted
  ];
  assert.deepEqual(gmailReplyCheckCandidates(venues, now).map((v) => v.id), ['a', 'e']);
});
