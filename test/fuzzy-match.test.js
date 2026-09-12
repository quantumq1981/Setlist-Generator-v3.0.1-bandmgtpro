'use strict';
/*
 * Chart → song fuzzy matcher (F1). Maps a loose chart title (filename or OCR'd title) to the
 * best library song so an imported chart auto-suggests onto the right song. Pure, no dependency.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { normalizeTitle, titleSimilarity, fuzzyMatchSong, ocrTitleGuess } = algorithm;

test('normalizeTitle strips extension, track number, punctuation and noise words', () => {
  assert.equal(normalizeTitle('03 - Sweet_Home Alabama (Live).pdf'), 'sweet home alabama');
  assert.equal(normalizeTitle('The Weight - lead sheet.cho'), 'weight');
  assert.equal(normalizeTitle('Superstition'), 'superstition');
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle(null), '');
});

test('titleSimilarity: exact-normalized = 1, unrelated ≈ 0, partial in between', () => {
  assert.equal(titleSimilarity('Superstition', 'superstition'), 1);
  assert.equal(titleSimilarity('03 - Superstition.pdf', 'Superstition'), 1);
  assert.equal(titleSimilarity('Brown Eyed Girl', 'Purple Rain') < 0.2, true);
  const partial = titleSimilarity('Sweet Home Alabama chart', 'Sweet Home Chicago');
  assert.equal(partial > 0 && partial < 0.8, true); // share "sweet home", differ on the last word
});

test('titleSimilarity gives a substring bonus', () => {
  // "Superstition" is a substring of "Stevie Wonder Superstition" (after noise strip).
  assert.equal(titleSimilarity('Superstition', 'Stevie Wonder Superstition') >= 0.85, true);
});

const songs = [
  { id: '1', title: 'Superstition' },
  { id: '2', title: 'Brown Eyed Girl' },
  { id: '3', title: 'Sweet Home Alabama' },
];

test('fuzzyMatchSong picks the best song above threshold', () => {
  assert.equal(fuzzyMatchSong('03 - superstition (live).pdf', songs).song.id, '1');
  assert.equal(fuzzyMatchSong('Sweet Home Alabama - lead sheet.cho', songs).song.id, '3');
  assert.equal(fuzzyMatchSong('brown_eyed_girl.gp5', songs).song.id, '2');
});

test('fuzzyMatchSong returns null when nothing clears the threshold', () => {
  assert.equal(fuzzyMatchSong('Bohemian Rhapsody', songs), null);
  assert.equal(fuzzyMatchSong('', songs), null);
  assert.equal(fuzzyMatchSong('Superstition', []), null);
});

test('fuzzyMatchSong honors a custom threshold', () => {
  // A weak partial match clears a low threshold but not the default.
  const weak = 'Sweet Caroline';
  assert.equal(fuzzyMatchSong(weak, songs, 0.9), null);
  const lenient = fuzzyMatchSong(weak, songs, 0.1);
  assert.equal(lenient && lenient.song.id, '3'); // "sweet" overlaps Sweet Home Alabama
});

test('ocrTitleGuess picks the title line from OCR text, skipping noise', () => {
  // Page number and symbol rows are dropped; the letter-rich title line wins.
  assert.equal(
    ocrTitleGuess('12\n\nSuperstition\nStevie Wonder\n\nIntro: Em7 ...'),
    'Superstition'
  );
  // Leading noise then the title.
  assert.equal(ocrTitleGuess('///  \n1.\nBrown Eyed Girl'), 'Brown Eyed Girl');
  // Empty / letterless input yields nothing.
  assert.equal(ocrTitleGuess(''), '');
  assert.equal(ocrTitleGuess('42\n- - -\n#### '), '');
});
