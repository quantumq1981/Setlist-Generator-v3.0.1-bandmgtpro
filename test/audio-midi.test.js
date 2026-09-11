'use strict';
/*
 * Audio / MIDI phase — pure helpers. The metronome timing and the MIDI byte construction are
 * the logic worth locking; the Web Audio click, the <audio> transport, and the Web MIDI send
 * are runtime/device concerns exercised in the headless drive (and, for real MIDI out, only in
 * a real browser with a device attached).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { resolveChartFormat, isRenderableChart, beatIntervalMs, midiProgramChange, midiControlChange } = algorithm;

test('resolveChartFormat recognises audio by extension and MIME', () => {
  assert.equal(resolveChartFormat({ name: 'track.mp3' }), 'audio');
  assert.equal(resolveChartFormat({ name: 'track.m4a' }), 'audio');
  assert.equal(resolveChartFormat({ name: 'track.wav' }), 'audio');
  assert.equal(resolveChartFormat({ name: 'track.ogg' }), 'audio');
  assert.equal(resolveChartFormat({ name: 'blob', mime: 'audio/mpeg' }), 'audio');
});

test('isRenderableChart excludes audio and unsupported, keeps drawable charts', () => {
  assert.equal(isRenderableChart('pdf'), true);
  assert.equal(isRenderableChart('image'), true);
  assert.equal(isRenderableChart('chordpro'), true);
  assert.equal(isRenderableChart('musicxml'), true);
  assert.equal(isRenderableChart('guitarpro'), true);
  assert.equal(isRenderableChart('powertab'), true); // shows a guidance card, still an entry
  assert.equal(isRenderableChart('audio'), false);
  assert.equal(isRenderableChart('unsupported'), false);
});

test('beatIntervalMs converts BPM to ms/beat and clamps', () => {
  assert.equal(beatIntervalMs(120), 500);
  assert.equal(beatIntervalMs(60), 1000);
  assert.equal(beatIntervalMs(240), 250);
  assert.equal(beatIntervalMs(0), 60000 / 20);       // clamps up to 20
  assert.equal(beatIntervalMs(10), 60000 / 20);
  assert.equal(beatIntervalMs(9999), 60000 / 400);   // clamps down to 400
  assert.equal(beatIntervalMs('90'), 60000 / 90);     // string BPM (song.bpm is a string)
});

test('midiProgramChange builds status+program, clamping channel 1-16 and program 0-127', () => {
  assert.deepEqual(midiProgramChange(1, 0), [0xC0, 0]);
  assert.deepEqual(midiProgramChange(1, 40), [0xC0, 40]);   // e.g. violin
  assert.deepEqual(midiProgramChange(16, 127), [0xCF, 127]);
  assert.deepEqual(midiProgramChange(10, 5), [0xC9, 5]);
  // Clamping / defaults.
  assert.deepEqual(midiProgramChange(0, 0), [0xC0, 0]);     // channel 0 → treated as 1
  assert.deepEqual(midiProgramChange(99, 999), [0xCF, 127]); // over-range clamps
  assert.deepEqual(midiProgramChange(1, -5), [0xC0, 0]);
});

test('midiControlChange builds status+controller+value with clamping', () => {
  assert.deepEqual(midiControlChange(1, 7, 100), [0xB0, 7, 100]);   // channel volume
  assert.deepEqual(midiControlChange(16, 64, 127), [0xBF, 64, 127]); // sustain on ch16
  assert.deepEqual(midiControlChange(1, 200, 200), [0xB0, 127, 127]);
});
