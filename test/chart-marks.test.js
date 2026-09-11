'use strict';
/*
 * Page-pin markers — the pure core behind jumping a chart to a named page ("Verse 1" → p2).
 * normalizeMarks cleans/sorts the stored list; nextMarkPage powers prev/next-marker keyboard
 * jumps. The editor UI and the Stage-viewer jump strip are exercised in the headless drive.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { normalizeMarks, nextMarkPage } = algorithm;

test('normalizeMarks coerces pages, drops invalid, defaults blank labels, sorts by page', () => {
  const out = normalizeMarks([
    { id: 'a', label: 'Solo', page: 3 },
    { id: 'b', label: '  Verse 1 ', page: '2' },   // string page + padding
    { id: 'c', label: '', page: 5 },               // blank label → "Mark"
    { id: 'd', label: 'Bad', page: 'x' },          // non-numeric → dropped
    { id: 'e', label: 'Zero', page: 0 },           // <1 → dropped
    { id: 'f', label: 'Neg', page: -2 },           // <1 → dropped
  ]);
  assert.deepEqual(out, [
    { id: 'b', label: 'Verse 1', page: 2 },
    { id: 'a', label: 'Solo', page: 3 },
    { id: 'c', label: 'Mark', page: 5 },
  ]);
});

test('normalizeMarks is empty/nullish safe', () => {
  assert.deepEqual(normalizeMarks(null), []);
  assert.deepEqual(normalizeMarks(undefined), []);
  assert.deepEqual(normalizeMarks([]), []);
  assert.deepEqual(normalizeMarks([{}, null]), []); // no page → dropped, null skipped
});

test('normalizeMarks floors fractional pages via parseInt', () => {
  assert.deepEqual(normalizeMarks([{ label: 'x', page: 2.9 }]), [{ id: undefined, label: 'x', page: 2 }]);
});

const marks = [
  { id: '1', label: 'Intro', page: 1 },
  { id: '2', label: 'Verse', page: 2 },
  { id: '3', label: 'Solo', page: 4 },
];

test('nextMarkPage finds the next marker strictly after the current page', () => {
  assert.equal(nextMarkPage(marks, 1, 'next'), 2);
  assert.equal(nextMarkPage(marks, 2, 'next'), 4);
  assert.equal(nextMarkPage(marks, 3, 'next'), 4); // between markers
  assert.equal(nextMarkPage(marks, 4, 'next'), null); // past the last
});

test('nextMarkPage finds the previous marker strictly before the current page', () => {
  assert.equal(nextMarkPage(marks, 4, 'prev'), 2);
  assert.equal(nextMarkPage(marks, 3, 'prev'), 2);
  assert.equal(nextMarkPage(marks, 2, 'prev'), 1);
  assert.equal(nextMarkPage(marks, 1, 'prev'), null); // nothing before page 1
});

test('nextMarkPage is safe with no markers / unsorted input', () => {
  assert.equal(nextMarkPage([], 3, 'next'), null);
  assert.equal(nextMarkPage(null, 3, 'prev'), null);
  // Unsorted input is normalized first, so order does not matter.
  const unsorted = [{ label: 'c', page: 5 }, { label: 'a', page: 2 }, { label: 'b', page: 3 }];
  assert.equal(nextMarkPage(unsorted, 2, 'next'), 3);
  assert.equal(nextMarkPage(unsorted, 4, 'prev'), 3);
});
