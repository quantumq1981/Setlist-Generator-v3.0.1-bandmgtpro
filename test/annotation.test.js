'use strict';
/*
 * Annotation (personal ink) — pure geometry. The eraser hit-test and the store key are the
 * logic worth locking; the Pointer-Events drawing, the canvas rendering, and IndexedDB
 * persistence are runtime concerns exercised in the headless drive.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { annoKey, pointSegDist, strokeNearPoint } = algorithm;

test('annoKey composes attachment id + page', () => {
  assert.equal(annoKey('att-1', 3), 'att-1:3');
  assert.equal(annoKey('att-1'), 'att-1:1');   // default page 1
  assert.equal(annoKey('', 2), ':2');
});

test('pointSegDist measures distance to a segment (endpoints + interior + perpendicular)', () => {
  // Horizontal segment (0,0)-(10,0).
  assert.equal(pointSegDist(5, 0, 0, 0, 10, 0), 0);      // on the segment
  assert.equal(pointSegDist(5, 3, 0, 0, 10, 0), 3);      // perpendicular
  assert.equal(pointSegDist(-4, 0, 0, 0, 10, 0), 4);     // beyond the A endpoint
  assert.equal(pointSegDist(13, 0, 0, 0, 10, 0), 3);     // beyond the B endpoint
  // Degenerate segment (a point) → plain distance.
  assert.equal(pointSegDist(3, 4, 0, 0, 0, 0), 5);
});

test('strokeNearPoint hits when the eraser radius touches any segment', () => {
  const stroke = { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] };
  assert.equal(strokeNearPoint(stroke, 0.5, 0.02, 0.05), true);  // near the first segment
  assert.equal(strokeNearPoint(stroke, 1.0, 0.5, 0.05), true);   // on the second segment
  assert.equal(strokeNearPoint(stroke, 0.5, 0.5, 0.05), false);  // interior, far from both
  assert.equal(strokeNearPoint(stroke, 0.5, 0.2, 0.25), true);   // bigger radius reaches it
});

test('strokeNearPoint handles a single-point stroke (a dot) and empties', () => {
  assert.equal(strokeNearPoint({ points: [{ x: 0.5, y: 0.5 }] }, 0.52, 0.5, 0.05), true);
  assert.equal(strokeNearPoint({ points: [{ x: 0.5, y: 0.5 }] }, 0.9, 0.9, 0.05), false);
  assert.equal(strokeNearPoint({ points: [] }, 0.5, 0.5, 0.1), false);
  assert.equal(strokeNearPoint(null, 0.5, 0.5, 0.1), false);
});
