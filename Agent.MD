
AGENT.MD — Setlist Generator Pro v3.8+ Handoff Document
Last updated: 2026-05-28 (PR #71)

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
├── EmailShareModal (line ~4331)    — email-ready text modal
├── VenueModal (line ~5630)         — NEW PR #64: Venues CRM + Booking Calendar + EPK
│     Tab 1 — Venues: pipeline list, add/edit/delete, per-venue mailto: send buttons
│     Tab 2 — Bookings: month-view calendar + booking CRUD
│     Tab 3 — EPK & Templates: links + 4 editable email templates
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

── PR #64 (venue-crm-booking-calendar) ──────────────────
  Merged: 2026-05-28
  Branch: claude/venue-crm-booking-calendar

  What shipped:
  • VenueModal component — 📍 Venues button in band-bar, 3-tab modal:

  TAB 1 — VENUES
  • Add/edit/delete venue contacts:
    name, email, phone, booker/contact name, city, state, venue type, website, notes
  • Status pipeline: Prospect → Contacted → Responded → Call Scheduled → Booked → Pass
  • Venues sorted by pipeline stage (booked first, pass last)
  • 4 one-click email buttons per venue (Initial Outreach / Follow-Up /
    Let's Connect / Booking Confirmed)
    - Opens system email client via mailto: with pre-filled subject + body
    - Placeholders substituted from EPK settings + active band name
    - Auto-stamps lastContactDate; advances status Prospect → Contacted on send

  TAB 2 — BOOKINGS
  • Month-view booking calendar (confirmed=green, pending=yellow, cancelled=red)
  • Add/edit/delete bookings linked to venue contacts
  • Fields: venue, date, start/end time, fee, status, notes
  • Booking list sorted chronologically; editing navigates calendar to that month

  TAB 3 — EPK & TEMPLATES
  • Store EPK URL, demo video URL, website, contact email/phone
    — global (not per-band), persists in 'setlist_epk_settings_v3' localStorage key
  • 4 fully editable email templates with Reset to Default per template
  • Placeholders: {{band_name}} {{venue_name}} {{contact_name}} {{epk_link}}
    {{demo_link}} {{date}} {{start_time}} {{fee}} {{contact_email}} {{contact_phone}}

  DATA
  • Venues: bandVenues(id) → 'setlist_band_venues_v3_{id}'  (per-band)
  • Bookings: bandBookings(id) → 'setlist_band_bookings_v3_{id}'  (per-band)
  • EPK settings: 'setlist_epk_settings_v3'  (global)
  • Constants: VENUE_TYPES, VENUE_STATUSES, VENUE_STATUS_ORDER,
    EMAIL_TEMPLATES_DEFAULT, EPK_SETTINGS_DEFAULT, BLANK_VENUE, BLANK_BOOKING

── PR #67 (arrangement-macros) ──────────────────────────
  Merged: 2026-05-28
  Branch: claude/arrangement-macros

  What shipped:
  • 22 clickable quick-tag buttons above the arrangement role grid in
    both Add Song and Edit Song forms — eliminates typing common cues
    across large song libraries
  • ARRANGEMENT_MACROS constant array { cat, label, role, text }
  • MACRO_CATS ordering: ['intro', 'ending', 'feel', 'cues']
  • 4 colour-coded categories:
    - intro  (blue)   — 4-Bar Count-In, Acoustic Start, Direct Segue,
                        Cold Open, Drum Intro, Keys Lead-In
    - ending (orange) — Hard Stop on 1, Trash-Can / Visual Cue, Fade on Groove,
                        Big Ending, Tag × 3, Vamp Out
    - feel   (purple) — Half-Time Feel, Double-Time Feel, Build to Chorus, Breakdown
    - cues   (green)  — Root Notes Only, Fill on Bar 8, Organ Tone,
                        Rootless Voicings, Rhythm Only
  • Each macro targets its natural role (endings → endingCue, fills → drums, etc.)
  • Click appends with space separator — existing content never overwritten
  • Tooltip on hover shows target role name
  • appendMacro(role, text) helper inside each form IIFE
  • CSS: .macro-strip, .macro-btn, .macro-cat-label, .macro-btn.cat-{intro|ending|feel|cues}

── PR #68 (advance-role-filter) ─────────────────────────
  Merged: 2026-05-28
  Branch: claude/advance-role-filter

  What shipped:
  • "Show roles:" checkbox bar — appears below Advance View toggle,
    one checkbox per ARR_ROLE, hidden in Stage View
  • advanceRoleFilter state (Set<role>) in App — default: all 6 roles checked
  • Unchecking a role hides it consistently across:
    - SetlistView Advance render (role rows filtered)
    - exportPDF (role text lines filtered)
    - openEmailShare (role label block filtered)
    - copyToClipboard (per-role [LABEL] lines filtered)
  • Enables bassist-only or drummer-only targeted document generation
  • Session-only preference (resets to all-checked on reload — correct default)
  • SetlistView accepts advanceRoleFilter prop; falls back to all roles if undefined
  • CSS: .role-filter-bar, .role-filter-label, .role-filter-check

── PR #70 (venue-csv-import) ────────────────────────────
  Merged: 2026-05-28
  Branch: claude/venue-csv-import

  What shipped:
  • "⬆ Import CSV" button in Venues tab — triggers hidden file input (PapaParse)
  • "⬇ Sample CSV" button — downloads a two-row template (venue-import-sample.csv)
    Columns: Name, Email, Phone, Contact Name, City, State, Venue Type,
             Website, Status, Notes
  • Column synonym map — flexible header matching:
    name/venue, email/e-mail, phone/telephone/tel/mobile/cell,
    contact/booker/contact name, city/town, state/province/region,
    type/venue type/category, website/url/web/site,
    status/pipeline/stage, notes/note/comments/description
  • Deduplication by name (case-insensitive) — safe to re-import
  • Toast: "Added X venues, skipped Y duplicates" / warning if no name col found
  • bulkAddVenues(newVenues[]) in App — deduplicates against current venues state,
    assigns genId() + createdAt, merges with BLANK_VENUE defaults
  • onBulkAddVenues prop added to VenueModal signature and wired in App render
  • venueCsvRef = React.useRef(null) added to VenueModal for the hidden input

── PR #71 (pool-meter-songcount) ─────────────────────────
  Merged: 2026-05-28
  Branch: claude/pool-meter-songcount

  What shipped:
  • Pool meter bar above the Generate button in SetConfiguration
    - Estimates songs needed: Σ ceil(setDuration_i / avgSongDuration) across all sets
    - Green "X available · ~Y needed" when pool is sufficient
    - Orange "X available · ~Y needed  ⚠ may exhaust" when pool would run out
    - Hidden when allowSongReuse is true (no exhaustion possible) or library empty
  • poolAvailable / poolRequired / poolOk derived values in SetConfiguration
    — computed from activeSongs prop + settings, zero runtime cost

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
VenueModal()                  ~5710  — Venue CRM + Booking Calendar + EPK templates
fillAndSend()                 inside VenueModal — builds mailto: from template + placeholders
bulkAddVenues()               ~6335  — deduplicates + batch-adds venues from CSV import
addVenue/updateVenue/...      ~6332  — CRUD for venues, bookings, EPK settings in App
ARRANGEMENT_MACROS            ~661   — 22 quick-tag constants { cat, label, role, text }
advanceRoleFilter             App state (Set<role>) — controls which roles appear in exports
poolRequired / poolOk         SetConfiguration derived values — pool meter calculation

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

1. Mobile Stage View optimisation
   Large-font, high-contrast mode for reading from 3 feet on stage.
   Tap to enlarge individual song row, lock screen orientation.

2. Phase 3 arrangement: per-role CSV columns
   Expand ARRANGEMENT CSV column into ARRANGEMENT_GLOBAL / ARRANGEMENT_DRUMS /
   ARRANGEMENT_KEYS / ARRANGEMENT_BASS / ARRANGEMENT_GUITAR2 / ARRANGEMENT_ENDING_CUE
   with IMPORT_COLUMN_SYNONYMS mapping, for spreadsheet editing outside the app.
