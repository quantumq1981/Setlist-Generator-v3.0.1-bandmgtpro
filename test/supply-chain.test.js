'use strict';
/*
 * Audit §12 #8 (supply chain) + #1 (service worker). Every third-party script is an exact
 * version with an SRI hash, and sw.js precaches exactly the scripts index.html loads, so the
 * offline shell can never drift from the page.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const headScripts = [...html.matchAll(/<script\b([^>]*)\bsrc="(https?:[^"]+)"([^>]*)>/g)]
  .map(m => ({ src: m[2], attrs: m[1] + m[3] }));
const EXACT_VERSION_RE = /@\d+\.\d+\.\d+(-[\w.]+)?\//;

test('every external <script> pins an exact version and carries an SRI hash', () => {
  assert.ok(headScripts.length >= 8, `found ${headScripts.length} external scripts`);
  for (const s of headScripts) {
    assert.match(s.src, EXACT_VERSION_RE, `${s.src} — version must be exact (pkg@x.y.z)`);
    assert.match(s.attrs, /integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/, `${s.src} — missing integrity`);
    assert.match(s.attrs, /crossorigin="anonymous"/, `${s.src} — SRI needs crossorigin`);
  }
});

test('lazy-loaded libraries (notation renderers, OCR) carry SRI hashes', () => {
  const block = html.slice(html.indexOf('const NOTATION_LIBS = {'), html.indexOf('const _scriptCache'));
  const urls = [...block.matchAll(/url: '([^']+)'/g)].map(m => m[1]);
  const hashes = [...block.matchAll(/integrity: '(sha384-[^']+)'/g)];
  assert.equal(urls.length, 3);
  assert.equal(hashes.length, urls.length, 'each NOTATION_LIBS entry needs an integrity hash');
  for (const u of urls) assert.match(u, EXACT_VERSION_RE);
  assert.match(html, /const TESSERACT_SRI = 'sha384-/);
  assert.match(html, /loadScriptOnce\(TESSERACT_URL, TESSERACT_SRI\)/);
  assert.match(html, /loadScriptOnce\(lib\.url, lib\.integrity\)/);
});

test('sw.js precaches every head script and the PDF.js worker', () => {
  const pre = sw.slice(sw.indexOf('const CDN_PRECACHE = ['), sw.indexOf('];', sw.indexOf('const CDN_PRECACHE = [')));
  const listed = new Set([...pre.matchAll(/'(https:[^']+)'/g)].map(m => m[1]));
  for (const s of headScripts) assert.ok(listed.has(s.src), `sw.js CDN_PRECACHE is missing ${s.src}`);
  const worker = (html.match(/workerSrc = '([^']+)'/) || [])[1];
  assert.ok(worker && listed.has(worker), 'sw.js must precache the PDF.js worker');
});

test('sw.js serves the app shell network-first and versions its cache', () => {
  assert.match(sw, /const SHELL_VERSION = '/);
  assert.match(sw, /event\.respondWith\(networkFirst\(request\)\)/);
  assert.match(sw, /skipWaiting\(\)/);
  assert.match(sw, /clients\.claim\(\)/);
  // The old bug: a cache-first match in front of the network for index.html.
  assert.doesNotMatch(sw, /caches\.match\(event\.request\)\.then\(\(cached\) => cached \|\| fetch/);
  assert.match(html, /register\('\.\/sw\.js', \{ updateViaCache: 'none' \}\)/);
});
