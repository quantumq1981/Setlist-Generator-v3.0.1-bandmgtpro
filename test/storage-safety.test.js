'use strict';
/* Audit §12 #6 (two tabs) and #7 (watermark size) — the pure decisions behind them. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');
const { crossTabChangeMakesStale, fitWatermarkDims, WATERMARK_MAX_SIDE, WATERMARK_MAX_CHARS } = algorithm;

test('a change to a data store in another tab makes this tab stale', () => {
  for (const k of ['setlist_bands_v3', 'setlist_band_songs_v3_abc', 'setlist_band_venues_v3_abc', 'setlist_epk_settings_v3', 'setlist_energy_profiles_v3']) {
    assert.equal(crossTabChangeMakesStale(k), true, k);
  }
  assert.equal(crossTabChangeMakesStale(null), true);   // localStorage.clear() in the other tab
});

test('housekeeping and foreign keys do not lock the tab', () => {
  for (const k of ['setlist_last_backup_at', 'setlist_stage_prefs_v3', 'setlist_band_snapshots_v3_abc', 'setlist_quarantine_setlist_bands_v3', 'other_app_key', '']) {
    assert.equal(crossTabChangeMakesStale(k), false, k);
  }
  assert.equal(crossTabChangeMakesStale(undefined), false);
});

test('fitWatermarkDims scales the long side down and never upscales', () => {
  assert.deepEqual(fitWatermarkDims(4032, 3024, WATERMARK_MAX_SIDE), { w: 1000, h: 750 });
  assert.deepEqual(fitWatermarkDims(3024, 4032, 1000), { w: 750, h: 1000 });
  assert.deepEqual(fitWatermarkDims(300, 200, 1000), { w: 300, h: 200 });
  assert.deepEqual(fitWatermarkDims(5000, 1, 1000), { w: 1000, h: 1 });
  assert.equal(fitWatermarkDims(0, 10, 1000), null);
  assert.equal(fitWatermarkDims(NaN, 10, 1000), null);
  assert.ok(WATERMARK_MAX_CHARS <= 256 * 1024);
});

test('snapshot ring keeps history ~10 min apart and recovery skips seconds-old copies', () => {
  const { nextSnapshotRing, pickRecoverySnapshot, SNAPSHOT_GAP_MS } = algorithm;
  const MIN = 60 * 1000;
  let ring = [];
  // 40 minutes of continuous editing, an autosave every 2 s.
  for (let t = 0; t <= 40 * MIN; t += 2000) ring = nextSnapshotRing(ring, { ts: t, songs: [t] });
  assert.equal(ring.length, 3);
  assert.equal(ring[0].ts, 40 * MIN);
  assert.ok(ring[0].ts - ring[2].ts >= SNAPSHOT_GAP_MS, 'oldest copy is at least one gap back');
  const pick = pickRecoverySnapshot(ring);
  assert.ok(pick && ring[0].ts - pick.ts >= 60 * 1000, 'recovery never lands on a copy seconds old');
  assert.deepEqual(ring.map(r => r.id), ['snapshot_1', 'snapshot_2', 'snapshot_3']);
  // Edge cases.
  assert.equal(pickRecoverySnapshot([]), null);
  assert.equal(pickRecoverySnapshot([{ ts: 10 }, { ts: 5 }]), null);   // only seconds apart
  assert.equal(nextSnapshotRing(null, { ts: 1 }).length, 1);
});

test('safeImageDataUrl only passes raster base64 data URLs (no attribute breakout, no SVG)', () => {
  const { safeImageDataUrl } = algorithm;
  assert.equal(safeImageDataUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
  assert.equal(safeImageDataUrl('data:image/jpeg;base64,/9j/4AAQ'), 'data:image/jpeg;base64,/9j/4AAQ');
  assert.equal(safeImageDataUrl('data:image/png;base64,AAAA" onerror="alert(1)'), '');
  assert.equal(safeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safeImageDataUrl('javascript:alert(1)'), '');
  assert.equal(safeImageDataUrl(null), '');
});

test('the EPK page CSP allows exactly the print handler it renders', () => {
  const crypto = require('crypto');
  const fs = require('fs');
  const html = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  const handler = (html.match(/<button class="printbtn no-print" onclick="([^"]+)">/) || [])[1];
  assert.equal(handler, 'window.print()');
  const hash = crypto.createHash('sha256').update(handler).digest('base64');
  assert.ok(algorithm.EPK_HTML_CSP.includes(`'sha256-${hash}'`));
  assert.match(algorithm.EPK_HTML_CSP, /default-src 'none'/);
});
