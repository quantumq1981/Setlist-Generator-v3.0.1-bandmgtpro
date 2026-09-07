'use strict';
/*
 * Reference Clips (YouTube) — the per-song audio the arrangement notes point at.
 * These lock down the bug fix ("Add did nothing" on playlist/other URLs → now it
 * either resolves a video id or explains why) plus true start→end segment embeds.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { getYTVideoId, getYTEmbedUrl, ytUrlIssue, ytStartFromUrl, tsToSeconds } = algorithm;

test('getYTVideoId accepts every common single-video URL form', () => {
  const ID = 'dQw4w9WgXcQ';
  assert.equal(getYTVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(getYTVideoId(`https://youtu.be/${ID}`), ID);
  assert.equal(getYTVideoId(`https://youtu.be/${ID}?t=90`), ID, 'youtu.be with query');
  assert.equal(getYTVideoId(`https://www.youtube.com/embed/${ID}`), ID);
  assert.equal(getYTVideoId(`https://www.youtube.com/shorts/${ID}`), ID, 'shorts');
  assert.equal(getYTVideoId(`https://www.youtube.com/live/${ID}`), ID, 'live');
  // The video id wins even when a playlist rides along (this is the common paste).
  assert.equal(getYTVideoId(`https://www.youtube.com/watch?v=${ID}&list=PLabc123`), ID);
  assert.equal(getYTVideoId(`https://m.youtube.com/watch?v=${ID}`), ID, 'mobile host');
});

test('getYTVideoId returns null for URLs with no single video (the failure cases)', () => {
  assert.equal(getYTVideoId('https://www.youtube.com/playlist?list=PLabcdef'), null, 'playlist');
  assert.equal(getYTVideoId('https://youtube.com/clip/UgkxAbc'), null, 'clip');
  assert.equal(getYTVideoId('not a url'), null);
  assert.equal(getYTVideoId(''), null);
  assert.equal(getYTVideoId(null), null);
});

test('ytUrlIssue explains WHY a URL was rejected instead of failing silently', () => {
  const ID = 'dQw4w9WgXcQ';
  assert.equal(ytUrlIssue(`https://youtu.be/${ID}`), null, 'valid → no issue');
  assert.match(ytUrlIssue(''), /Paste a YouTube link/i);
  assert.match(ytUrlIssue('https://www.youtube.com/playlist?list=PLx'), /playlist/i);
  assert.match(ytUrlIssue('https://youtube.com/clip/UgkxAbc'), /[Cc]lip/);
  assert.match(ytUrlIssue('https://www.youtube.com/@somechannel'), /video id/i);
  assert.match(ytUrlIssue('https://vimeo.com/12345'), /YouTube video URL/i);
});

test('tsToSeconds parses MM:SS, H:MM:SS, bare seconds and numbers', () => {
  assert.equal(tsToSeconds('1:30'), 90);
  assert.equal(tsToSeconds('0:05'), 5);
  assert.equal(tsToSeconds('1:02:03'), 3723);
  assert.equal(tsToSeconds('45'), 45, 'bare seconds string');
  assert.equal(tsToSeconds(90), 90, 'number passthrough');
  assert.equal(tsToSeconds(''), 0);
  assert.equal(tsToSeconds(null), 0);
});

test('ytStartFromUrl lifts a start time embedded in the URL into MM:SS', () => {
  assert.equal(ytStartFromUrl('https://youtu.be/dQw4w9WgXcQ?t=90'), '1:30');
  assert.equal(ytStartFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s'), '1:30');
  assert.equal(ytStartFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=5'), '0:05');
  assert.equal(ytStartFromUrl('https://youtu.be/dQw4w9WgXcQ'), '', 'no time → empty');
});

test('getYTEmbedUrl builds a start-only or a true start→end segment embed', () => {
  const ID = 'dQw4w9WgXcQ';
  const base = `https://www.youtube.com/embed/${ID}`;
  assert.equal(getYTEmbedUrl(`https://youtu.be/${ID}`), base, 'no times → plain embed');
  assert.equal(getYTEmbedUrl(`https://youtu.be/${ID}`, '1:30'), `${base}?start=90`, 'start only');
  assert.equal(getYTEmbedUrl(`https://youtu.be/${ID}`, '1:30', '2:00'), `${base}?start=90&end=120`, 'segment');
  // An end at/behind the start is ignored (not a valid segment).
  assert.equal(getYTEmbedUrl(`https://youtu.be/${ID}`, '2:00', '1:00'), `${base}?start=120`);
  assert.equal(getYTEmbedUrl('https://www.youtube.com/playlist?list=PLx', '1:00'), null, 'no id → null');
});
