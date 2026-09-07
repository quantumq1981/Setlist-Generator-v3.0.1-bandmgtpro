'use strict';
/*
 * Offline attachment backup helpers — the base64<->blob round-trip that carries embedded
 * charts / lead sheets through Backup/Restore. IndexedDB itself is exercised in the headless
 * browser drive; here we lock the pure serialisation that must be byte-exact.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { algorithm } = require('./helpers.js');

const { bytesToB64, b64ToBytes, blobToB64, b64ToBlob, fmtBytes } = algorithm;

test('bytesToB64 / b64ToBytes round-trip is byte-exact, including binary bytes', () => {
  const bytes = new Uint8Array([0, 1, 2, 254, 255, 65, 66, 0, 128, 127]);
  const b64 = bytesToB64(bytes);
  assert.equal(typeof b64, 'string');
  const back = b64ToBytes(b64);
  assert.deepEqual(Array.from(back), Array.from(bytes));
});

test('bytesToB64 handles large payloads without call-stack overflow (chunked)', () => {
  const big = new Uint8Array(200000).map((_, i) => i % 256);
  const back = b64ToBytes(bytesToB64(big));
  assert.equal(back.length, big.length);
  assert.equal(back[0], 0);
  assert.equal(back[199999], 199999 % 256);
});

test('blobToB64 / b64ToBlob round-trip preserves bytes and mime (the backup path)', async () => {
  const original = new Uint8Array([37, 80, 68, 70, 45, 1, 2, 3, 255]); // "%PDF-" + binary
  const blob = new Blob([original], { type: 'application/pdf' });
  const b64 = await blobToB64(blob);
  const restored = b64ToBlob(b64, 'application/pdf');
  assert.equal(restored.type, 'application/pdf');
  const back = new Uint8Array(await restored.arrayBuffer());
  assert.deepEqual(Array.from(back), Array.from(original));
});

test('b64ToBlob defaults the mime when none is given', () => {
  assert.equal(b64ToBlob('AAAA').type, 'application/octet-stream');
  assert.equal(b64ToBlob('', 'image/png').type, 'image/png');
});

test('fmtBytes renders human sizes', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(512), '512 B');
  assert.equal(fmtBytes(2048), '2 KB');
  assert.equal(fmtBytes(1572864), '1.5 MB');
});
