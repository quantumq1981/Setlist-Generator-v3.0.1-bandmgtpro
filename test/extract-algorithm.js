'use strict';
/*
 * extract-algorithm.js — the test harness's bridge into the single-file app.
 *
 * This repo ships as one big index.html with a `type="text/babel"` script and no
 * build step, so the pure setlist-algorithm functions can't be `require()`d
 * directly. Rather than duplicate them (which would rot), this module lifts the
 * exact source of a whitelisted set of top-level declarations out of index.html
 * and evaluates them in a Node sandbox, then hands the live functions to the
 * tests. If a function's source changes in index.html, the tests exercise the new
 * source automatically — there is nothing to keep in sync.
 *
 * Two extraction primitives:
 *   - extractDecl(name): a `function NAME(...) {...}` or `const NAME = ...;`
 *     lifted with a comment/string/template/regex-aware brace or semicolon scan.
 *   - extractRange(startNeedle, endNeedle): a literal contiguous slice, used for
 *     the data maps (GENRE_PARAMS / ENERGY_MAP) that are populated by `for` loops
 *     immediately after their declaration.
 */
const fs = require('fs');
const path = require('path');

const INDEX_HTML = path.join(__dirname, '..', 'index.html');
const src = fs.readFileSync(INDEX_HTML, 'utf8');

// --- Tokenizer-aware end finder -------------------------------------------------
// Walks characters from `start`, skipping line/block comments, single/double
// strings, template literals (treated opaque between backticks), and regex
// literals (detected via the preceding significant char). Tracks ()[]{ } depth.
// mode 'brace': returns index just past the matching close of the first '{'.
// mode 'semi' : returns index just past the first ';' seen at depth 0.
function findEnd(source, start, mode) {
  let i = start;
  let depth = 0;
  let seenBrace = false;
  let prevSig = ''; // previous significant (non-space/comment) char, for regex detection
  const n = source.length;

  const isRegexPrev = (c) => c === '' || '(,=:[!&|?{};'.includes(c) || c === '\n';

  while (i < n) {
    const c = source[i];
    const c2 = source[i + 1];

    // Comments
    if (c === '/' && c2 === '/') { i += 2; while (i < n && source[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(source[i] === '*' && source[i + 1] === '/')) i++; i += 2; continue; }

    // Strings
    if (c === '"' || c === "'") {
      const q = c; i++;
      while (i < n) { if (source[i] === '\\') { i += 2; continue; } if (source[i] === q) { i++; break; } i++; }
      prevSig = q; continue;
    }
    // Template literal (opaque between backticks; no nested ${} handling needed here)
    if (c === '`') {
      i++;
      while (i < n) { if (source[i] === '\\') { i += 2; continue; } if (source[i] === '`') { i++; break; } i++; }
      prevSig = '`'; continue;
    }
    // Regex literal
    if (c === '/' && isRegexPrev(prevSig)) {
      i++; let inClass = false;
      while (i < n) {
        const rc = source[i];
        if (rc === '\\') { i += 2; continue; }
        if (rc === '[') inClass = true;
        else if (rc === ']') inClass = false;
        else if (rc === '/' && !inClass) { i++; break; }
        i++;
      }
      // skip flags
      while (i < n && /[a-z]/i.test(source[i])) i++;
      prevSig = '/'; continue;
    }

    if (c === '{' || c === '(' || c === '[') { depth++; if (c === '{') seenBrace = true; prevSig = c; i++; continue; }
    if (c === '}' || c === ')' || c === ']') {
      depth--; prevSig = c; i++;
      if (mode === 'brace' && seenBrace && depth === 0) return i;
      continue;
    }
    if (c === ';' && mode === 'semi' && depth === 0) return i + 1;

    if (!/\s/.test(c)) prevSig = c;
    i++;
  }
  throw new Error('findEnd: unterminated declaration from index ' + start);
}

function extractDecl(name) {
  const fnIdx = src.search(new RegExp('\\bfunction\\s+' + name + '\\s*\\('));
  if (fnIdx >= 0) {
    const braceStart = src.indexOf('{', fnIdx);
    const end = findEnd(src, braceStart, 'brace');
    return src.slice(fnIdx, end);
  }
  const constIdx = src.search(new RegExp('\\bconst\\s+' + name + '\\b'));
  if (constIdx >= 0) {
    const end = findEnd(src, constIdx, 'semi');
    return src.slice(constIdx, end);
  }
  throw new Error('extractDecl: symbol not found: ' + name);
}

function extractRange(startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  if (a < 0) throw new Error('extractRange: start not found: ' + startNeedle);
  const b = src.indexOf(endNeedle, a);
  if (b < 0) throw new Error('extractRange: end not found: ' + endNeedle);
  return src.slice(a, b + endNeedle.length);
}

// --- Assemble the sandbox source in dependency order ----------------------------
const pieces = [];

// Plain constants.
for (const c of [
  'DEFAULT_DURATION_MINUTES', 'MAX_GUARD',
  'DURATION_TOLERANCE_POSITIVE', 'DURATION_TOLERANCE_NEGATIVE',
  'DEFAULT_PASSES', 'TONAL_SWAP_THRESHOLD',
  // Circle-of-fifths lookup tables backing the tonal helpers.
  'CIRCLE_OF_FIFTHS', 'SHARP_TO_FLAT', 'CANONICAL_SET', 'DISPLAY_OVERRIDES',
]) pieces.push(extractDecl(c));

// Genre data + the loops that derive GENRE_PARAMS / ENERGY_MAP from it. The block
// runs from `const GENRE_DATABASE = [` through the ENERGY_MAP extend loop, which
// ends just before the "STYLE PICKER OPTIONS" section (JSX territory we skip).
pieces.push(extractRange('const GENRE_DATABASE = [', 'STYLE PICKER OPTIONS').replace(/\/\/ ─+ STYLE PICKER OPTIONS[\s\S]*$/, ''));

// Energy curve presets + arc shapes (skip the JSX StyleOptions/STYLE_GROUPS between).
pieces.push(extractDecl('ENERGY_CURVE_PRESETS'));
pieces.push(extractDecl('_clamp01'));
pieces.push(extractDecl('ENERGY_ARC_SHAPES'));
pieces.push(extractDecl('SET_STRUCTURE_TEMPLATES'));

// Gmail integration — pure message-building / reply-detection helpers (const arrow
// functions, so dependency order matters: b64 first).
for (const g of [
  'GMAIL_REPLY_CHECK_COOLDOWN_MS',
  'gmailB64Utf8', 'gmailBase64Url', 'gmailEncodeHeader', 'gmailBuildRfc2822',
  'gmailThreadHasReply', 'gmailReplyCheckCandidates',
]) pieces.push(extractDecl(g));

// Contact enrichment + phone-first outreach helpers (CALL_OUTCOMES before its users).
for (const g of [
  'venueNeedsEmail', 'googleEmailSearchUrl', 'CALL_OUTCOMES', 'applyCallOutcome', 'buildCallScript',
]) pieces.push(extractDecl(g));

// Outreach sequences ("Today's Outreach") — constants before the brain that uses them.
for (const g of [
  'FOLLOWUP_DUE_DAYS', 'DAILY_OUTREACH_CAP', 'MAX_SEQUENCE_SENDS', 'SEQUENCE_STEP_DAYS',
  'addDaysISO', 'sendsToday', 'nextActionFor',
]) pieces.push(extractDecl(g));

// Pure functions. (Function declarations hoist, so order among them is not
// significant — grouped by concern for readability.)
for (const f of [
  'parseDuration', 'genId', 'getGenreParams', 'getCompositeEnergy', 'targetEnergyCurve',
  'templateStylePenalty',
  // Tonal-gravity helpers + the transition scorer they compose into.
  'normalizeKey_TG', 'getCircleIndex_TG', 'circleDistance_TG', 'areRelativeKeys_TG',
  'areParallelKeys_TG', 'circleDirection_TG', 'anchorKeyBonus_TG', 'determineAnchorKey_TG',
  'isContrastSlot_TG', 'calculateTonalTransitionScore_TG',
  'calculateSetlistQualityScore', 'generateTonalDiagnostics_TG',
  'simulatedAnnealingOptimize', 'generateSetlistsCore', 'generateSetlistsCore_WithTonalGravity',
  'validateGenerationConstraints',
]) pieces.push(extractDecl(f));

const EXPORTS = [
  'GENRE_DATABASE', 'GENRE_PARAMS', 'ENERGY_MAP', 'ENERGY_ARC_SHAPES', 'SET_STRUCTURE_TEMPLATES',
  'parseDuration', 'getGenreParams', 'getCompositeEnergy', 'targetEnergyCurve', 'templateStylePenalty',
  'normalizeKey_TG', 'circleDistance_TG', 'determineAnchorKey_TG', 'calculateTonalTransitionScore_TG',
  'calculateSetlistQualityScore', 'generateTonalDiagnostics_TG', 'simulatedAnnealingOptimize',
  'generateSetlistsCore', 'generateSetlistsCore_WithTonalGravity', 'validateGenerationConstraints',
  'GMAIL_REPLY_CHECK_COOLDOWN_MS', 'gmailB64Utf8', 'gmailBase64Url', 'gmailEncodeHeader',
  'gmailBuildRfc2822', 'gmailThreadHasReply', 'gmailReplyCheckCandidates',
  'venueNeedsEmail', 'googleEmailSearchUrl', 'CALL_OUTCOMES', 'applyCallOutcome', 'buildCallScript',
  'DAILY_OUTREACH_CAP', 'MAX_SEQUENCE_SENDS', 'SEQUENCE_STEP_DAYS', 'addDaysISO', 'sendsToday', 'nextActionFor',
];

// Minimal browser shims the algorithm touches (genId uses window.crypto).
const preamble = `
  const window = { crypto: (typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined) };
  const crypto = window.crypto;
`;

let sandbox;
try {
  const body = preamble + '\n' + pieces.join('\n\n') + '\n\nreturn { ' + EXPORTS.join(', ') + ' };';
  sandbox = new Function(body)();
} catch (e) {
  throw new Error('extract-algorithm: failed to evaluate lifted source — ' + e.message);
}

module.exports = sandbox;
