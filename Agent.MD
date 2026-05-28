
AGENT.MD — Setlist Generator Pro v3.8+ Handoff Document
Last updated: 2026-05-28

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT OVERVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Single-file React app (index.html + featureHelp.js + InfoModal.jsx + InfoTrigger.jsx).
No build step. React 18 loaded from CDN via Babel standalone transpilation.
All state stored in localStorage. No backend.

Key dependencies (CDN):
  - React 18 / ReactDOM 18
  - Babel Standalone (JSX transpilation in-browser)
  - jsPDF 2.5.1 (PDF export)
  - PapaParse 5.4.1 (CSV parsing)
  - PDF.js 3.11.174 (PDF import)
  - Mobile Drag-Drop polyfill

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SONG OBJECT SCHEMA (current)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  id:          string    — genId() UUID
  status:      'active' | 'cold'
  title:       string
  artist:      string
  duration:    number    — decimal minutes (e.g. 4.5)
  style:       string    — genre key (e.g. 'uptempo', 'blues', 'midtempo')
  key:         string    — musical key (e.g. 'Am', 'F#')
  bpm:         string    — tempo as string (e.g. '120')
  vocalist:    string    — vocalist name or 'ALL'
  arrangement: string    — optional arrangement/cue notes (ADDED v3.9)
  styleInferred: bool   — optional, set when style was auto-inferred from artist
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT HIERARCHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

App (line ~5443)
├── SongLibrary (line ~3384)         — Add/Edit/Import song library
├── SetConfiguration (line ~3741)   — Settings panel + Generate/Export buttons
│     Toolbar buttons: Copy Text | 📧 Email / Share | Export PDF
├── SetlistView (line ~4373) × N    — One per generated set
│     Props include: viewMode ('stage'|'advance')
├── UnusedSongsPanel (line ~4233)
├── EmailShareModal (line ~4331)    — NEW v3.9: email-ready text modal
├── BandModal
├── ImportSongsModal (line ~4529)
├── GigProfileModal
└── PrintView (hidden, print-only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RECENT WORK — MERGED PRs
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── PR #56 (genre-circle-fifths-params) ──────────────────
  - Added 60-genre GENRE_DATABASE with BPM ranges, energy, and Circle of Fifths params
  - Style inference from artist name (ARTIST_GENRE_DATABASE lookup)
  - Genre badge CSS for all 60 canonical styles
  - BPM-based fallback style inference when artist lookup fails

── PR #58 (arrangement-layer-integration) ───────────────
  Merged: 2026-05-28
  Branch: claude/arrangement-layer-integration-W7RMu

  What shipped:
  • arrangement: '' field added to song schema (fully backward compatible)
  • Add form + Edit form: textarea for "Arrangement Notes (Advance View)"
  • CSV: ARRANGEMENT column in Quick Import, Import+Normalize modal,
    Canonical Import, Export CSV, and Sample CSV download
  • IMPORT_COLUMN_SYNONYMS extended: 'arrangement','arr','notes','cues',
    'chart notes','advance notes' → arrangementCol
  • Global viewMode state ('stage'|'advance') in App
  • Stage View toggle / Advance View toggle buttons next to setlist heading
    - Stage View: shows short 40-char cue beneath song meta
    - Advance View: expands full arrangement text (green-tinted full-width block)
  • Smart notes injection in generate():
    - forceOpener=true → prepends "[OPENER] Establish groove before vocal."
    - forceCloser=true → appends "[CLOSER] Extended vamp – end on visual cue."
    - Guards against double-injection on re-generate
  • PDF export respects viewMode:
    - Advance: renders arrangement block per song with word-wrap + page safety
    - Filename: setlist-{band}-stage-{date}.pdf or -advance-{date}.pdf
  • Clipboard copy includes [ARR] lines per song in Advance mode
  • Summary page notes which view was exported

── PR #59 (email-ready-export-agentmd) ──────────────────
  Merged: 2026-05-28
  Branch: claude/email-ready-export-agentmd

  What shipped:
  • EmailShareModal component — modal shows formatted plain text, click-to-select,
    Copy All button with ✓ Copied! confirmation
  • openEmailShare() function in App — builds email-ready text:
    - Band name + date header
    - Per-set section with heavy divider and song count/duration
    - Each song: NUMBER. TITLE — Artist on one line, Key | BPM | Style below
    - Advance View: arrangement notes indented with ▸ prefix per line
    - Stage View: minimal (no arrangement block)
  • 📧 Email / Share button added to SetConfiguration toolbar
    (between Copy Text and Export PDF, styled in blue)
  • CSS: .email-share-modal, .email-share-textarea, .email-share-copied

── PR #61 (structured-arrangement-roles) ────────────────
  Merged: 2026-05-28
  Branch: claude/structured-arrangement-roles

  What shipped:
  • Replaced single free-text arrangement textarea with 6-role grid:
    General Notes | Drums | Keys | Bass | Guitar 2 | Ending Cue
  • ARR_ROLES array + ARR_ROLE_LABELS map for ordering and display
  • parseArrangement(str) → { global, drums, keys, bass, guitar2, endingCue }
    - Plain-text strings (from PR #58) auto-migrate to global field
  • serializeArrangement(obj) → JSON string, or plain string if only global set
    - Preserves full CSV/import round-trip compat for single-field arrangements
  • getArrangementCue(str) → 40-char Stage View cue
    - Prefers endingCue over global, strips [OPENER]/[CLOSER] tags
  • hasArrangementData(str) → bool for badge/conditional render
  • Add form + Edit form: arr-roles-grid 2-col CSS layout, per-role textareas
  • Advance View: per-role labeled rows (ARR_ROLE_LABELS display names)
  • Email share: role labels padded (GENERAL   / DRUMS   / KEYS   etc.)
  • PDF export: ROLE: text lines per populated role in arrangement block
  • Library card: 📋 arr badge when any role field is non-empty
  • Smart notes injection updated: [OPENER]/[CLOSER] targets global field
    of parsed structure, then re-serialized — handles both legacy and new data
  • CSS added: .arr-roles-grid, .arr-role-item, .arr-role-full,
    .arr-role-item-label, .arr-role-input, .arr-role-display,
    .arr-role-display-row, .arr-role-display-label, .arr-role-display-text,
    .arr-roles-section, .arr-roles-header, .arr-roles-header-badge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY FUNCTIONS & LINE NUMBERS (approximate — verify on read)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

parseArrangement()            ~562   — str → { global, drums, keys, bass, guitar2, endingCue }
serializeArrangement()        ~572   — obj → JSON string (plain string if only global)
getArrangementCue()           ~585   — 40-char Stage View cue from arrangement
hasArrangementData()          ~593   — bool: any role field populated
generateSetlistsCore()        ~2860  — main setlist algorithm
generateSetlistsCore_WithTonalGravity()  ~2350
generate()                    ~5590  — App-level trigger, calls core + injects arrangement notes
exportSongs()                 ~5700  — CSV export (includes Arrangement column)
importCSVRobust()             ~5830  — Quick Import (CSV/PDF, fuzzy dedup)
importCanonicalRows()         ~6090  — Import+Normalize modal finalizer
exportPDF()                   ~6190  — jsPDF export (view-mode aware)
copyToClipboard()             ~6220  — Plain text copy (view-mode aware)
openEmailShare()              ~6230  — Formats email-ready text, opens EmailShareModal
downloadSampleCSV()           ~6070  — Downloads sample CSV with Arrangement column

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EARLIER FIXES (pre-PR #56, documented in previous Agent.MD)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ LEAK #1 — Force Closer dedup key removal
   unmarkUsed(lastSong) called before locked-closer search (~line 2304, 2339)
   markUsed(closer) called after placement (~line 2332/2365)

✅ LEAK #2 — Cross-set hard abort on pool exhaustion
   generationAborted = true on pool exhaustion (~line 2167)
   outer for-loop breaks before partial set is pushed (~line 2291)

✅ Post-generation duplicate audit guard (~line 2381)
   Runtime scan — flags cross-set duplicates as INTEGRITY ERROR in UI

✅ Print formatting correct (Times New Roman 19pt, page-break-after, line-height 1.0)
✅ Manual edit mode correct (toggle, generate disabled, duration recalc)
✅ CSV hardening solid (quoting, delimiter detection, fuzzy dedup)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUGGESTED NEXT STEPS (in priority order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. "Remaining songs" meter in SetConfiguration
   Show songs available vs. required before generation to prevent
   pool-exhaustion warnings. (Suggested in original Agent.MD)

2. Soft pre-generation warning if library is too small for requested sets/duration

3. Mobile Stage View optimisation
   Large-font, high-contrast mode for reading from 3 feet on stage
   (current Stage View works but could be larger on mobile)

4. Phase 3 arrangement: per-role fields in CSV import/export
   Currently the Arrangement CSV column carries the raw JSON blob.
   Could be expanded to individual columns (ARRANGEMENT_DRUMS,
   ARRANGEMENT_KEYS, etc.) with IMPORT_COLUMN_SYNONYMS mapping,
   for easier spreadsheet editing outside the app.
