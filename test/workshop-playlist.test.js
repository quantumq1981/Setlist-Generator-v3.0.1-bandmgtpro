'use strict';
// Band-wide workshop playlist (CLAUDE.md §9az): link normalisation and the
// default / custom / off resolution that decides whether the bundled QR is shown.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WORKSHOP_PLAYLIST_DEFAULT_URL, WORKSHOP_PLAYLIST_QR_SRC, normalizePlaylistUrl, workshopPlaylistFor,
} = require('./extract-algorithm.js');

test('normalizePlaylistUrl: keeps http(s), adds https to bare links, rejects junk', () => {
  assert.equal(normalizePlaylistUrl('https://tr.ee/abc'), 'https://tr.ee/abc');
  assert.equal(normalizePlaylistUrl('  linktr.ee/band  '), 'https://linktr.ee/band');
  assert.equal(normalizePlaylistUrl('http://example.com/x?y=1'), 'http://example.com/x?y=1');
  assert.equal(normalizePlaylistUrl(''), '');
  assert.equal(normalizePlaylistUrl(null), '');
  assert.equal(normalizePlaylistUrl('javascript:alert(1)'), '');
  assert.equal(normalizePlaylistUrl('not a link'), '');
});

test('workshopPlaylistFor: absent -> built-in playlist with its QR', () => {
  for (const settings of [undefined, {}, { workshopPlaylistUrl: null }]) {
    assert.deepEqual(workshopPlaylistFor(settings), { url: WORKSHOP_PLAYLIST_DEFAULT_URL, qr: WORKSHOP_PLAYLIST_QR_SRC });
  }
});

test('workshopPlaylistFor: custom link has no QR (the bundled one encodes another URL)', () => {
  assert.deepEqual(workshopPlaylistFor({ workshopPlaylistUrl: 'linktr.ee/other' }), { url: 'https://linktr.ee/other', qr: '' });
  // Re-entering the built-in link brings its QR back.
  assert.equal(workshopPlaylistFor({ workshopPlaylistUrl: WORKSHOP_PLAYLIST_DEFAULT_URL }).qr, WORKSHOP_PLAYLIST_QR_SRC);
});

test('workshopPlaylistFor: empty string means turned off; junk is treated as off', () => {
  assert.equal(workshopPlaylistFor({ workshopPlaylistUrl: '' }), null);
  assert.equal(workshopPlaylistFor({ workshopPlaylistUrl: 'javascript:void(0)' }), null);
});
