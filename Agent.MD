
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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY FUNCTIONS & LINE NUMBERS (approximate — verify on read)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

1. Structured per-role arrangement modal (Phase 2 of arrangement layer)
   Replace free-text arrangement string with structured fields:
   { global, drums, keys, bass, guitar2, endingCue }
   Render per-role rows in Advance View. Store as JSON string in arrangement field
   for backward compatibility. Existing plain-text lives in 'global'.

2. "Remaining songs" meter in SetConfiguration
   Show songs available vs. required before generation to prevent
   pool-exhaustion warnings. (Suggested in original Agent.MD)

3. Soft pre-generation warning if library is too small for requested sets/duration

4. Mobile Stage View optimisation
   Large-font, high-contrast mode for reading from 3 feet on stage
   (current Stage View works but could be larger on mobile)
