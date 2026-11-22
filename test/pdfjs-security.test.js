'use strict';
/*
 * Audit §12 #2 — PDF.js 3.11.174 is exposed to CVE-2024-4367 (arbitrary JS via a crafted
 * font) unless every getDocument() call disables eval-based glyph compilation. User-supplied
 * PDFs are parsed on import and rendered in Stage Mode / OCR, so one missed call site is
 * enough. This scan keeps every call site honest.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCES = ['index.html', 'featureHelp.js', 'InfoModal.jsx', 'InfoTrigger.jsx'];

// Return the argument text of each `getDocument(` call (balanced parens).
function getDocumentCalls(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf('getDocument(', i)) !== -1) {
    let j = i + 'getDocument('.length, depth = 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') depth--;
      j++;
    }
    out.push({ at: i, args: src.slice(i, j) });
    i = j;
  }
  return out;
}

test('every PDF.js getDocument() call passes isEvalSupported: false', () => {
  let total = 0;
  for (const f of SOURCES) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const call of getDocumentCalls(src)) {
      total++;
      const line = src.slice(0, call.at).split('\n').length;
      assert.match(call.args, /isEvalSupported\s*:\s*false/, `${f}:${line} — getDocument without isEvalSupported:false`);
    }
  }
  assert.ok(total >= 4, `expected the known PDF.js call sites, found ${total}`);
});
