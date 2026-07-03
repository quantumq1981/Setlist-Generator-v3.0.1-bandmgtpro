
>>> NOTE (2026-07-03): CLAUDE.md is now the authoritative engineering guide —
>>> architecture, the verification workflow, the genre system, and the setlist
>>> algorithm live there. This AGENT.MD is retained for historical handoff detail
>>> (component map, feature history) but CLAUDE.md takes precedence on any conflict.

AGENT.MD — Setlist Generator Pro v3.8+ Handoff Document
Last updated: 2026-05-31 (branch claude/agent-roadmap-venue-csv-VXJra)

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
  arrangement: string    — JSON-encoded { global, drums, keys, bass, guitar2, endingCue }
                           or plain text (legacy) — parseArrangement() handles both
  styleInferred: bool   — optional, set when style was auto-inferred from artist
  mediaLinks:  array    — YouTube reference clips: [{ id, url, ts, label }]
                           url: YouTube URL (youtu.be/, watch?v=, /embed/ formats, incl. unlisted)
                           ts: optional timestamp string "MM:SS" or "H:MM:SS"
                           label: short description of what the clip demonstrates
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
COMPONENT HIERARCHY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

App (line ~6110)
├── SongLibrary (line ~3520)         — Add/Edit/Import song library
├── SetConfiguration (line ~4080)   — Settings panel + pool meter + Generate/Export buttons
│     Pool meter: green/orange bar showing "X available · ~Y needed"
│     Toolbar buttons: Copy Text | 📧 Email / Share | Export PDF
├── SetlistView (line ~4720) × N    — One per generated set
│     Props include: viewMode ('stage'|'advance'), advanceRoleFilter
├── StageModeOverlay (line ~5934)   — Full-screen dark overlay for on-stage reading
│     Triggered by "📱 Stage Mode" button in view toggle bar
│     Tap-to-highlight: tap a row to mark it active (accent orange), others dim
│     ArrowUp/ArrowDown navigate and auto-scroll; tap active row to clear
│     ESC key or exit button closes; highlight resets on every open
├── Next Gig Banner (~line 8118)    — Inline JSX (no separate component)
│     Appears between band-bar and main-grid when a future confirmed/pending booking exists
│     Shows: venue · date · start time · fee · linked setlist · status badge · days-until
│     Clicking opens VenueModal; hidden when no upcoming bookings
├── UnusedSongsPanel (line ~4600)
├── EmailShareModal (line ~4680)    — email-ready text modal
├── VenueModal (line ~5840)         — Venues CRM + Booking Calendar + Analytics + EPK
│     Tab 1 — Venues: pipeline list, add/edit/delete, CSV import (status-normalised),
│             per-venue mailto: send
│     Tab 2 — Bookings: month-view calendar + booking CRUD
│             Booking fields: venue, date, start/end time, fee, status, setlistId, notes
│             Status options: pending | confirmed | completed | cancelled
│             ✉ button on rows with a venue email → fires bookingConfirmation template
│             Setlist dropdown links a saved setlist to the gig; name shown in list row
│             📄 button on every row → downloadGigSheet() generates jsPDF gig sheet
│             Repeat-venue guard: selecting a venue with prior bookings shows those
│             bookings + the last linked setlist's songs (avoid repeats)
│     Tab 3 — 📊 Analytics: stat cards (gigs, fees, avg songs/gig, pipeline) +
│             most-played-venues bar chart; computed from bookings + setlists
│     Tab 4 — EPK & Templates: links + 4 editable email templates
├── BandModal
├── ImportSongsModal (line ~4600)
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

── PR #73 (mobile-stage-view) ───────────────────────────
  Merged: 2026-05-28
  Branch: claude/mobile-stage-view

  What shipped:
  • StageModeOverlay component — full-screen dark overlay for on-stage reading
  • "📱 Stage Mode" button added to the view toggle bar (purple, distinct from
    Stage View / Advance View toggles)
  • Overlay layout:
    - Background: #0d0d0f (near-black)
    - Song number: 2rem bold, muted (positional reference only)
    - Song title: 1.6rem bold white
    - Meta row: artist · key badge (blue) · BPM · elapsed time
    - Arrangement cue: green italic (from getArrangementCue(), if present)
    - Sets separated by header rows (name · song count · duration)
  • ESC key or "✕ EXIT STAGE MODE" button closes the overlay
  • Read-only, no edit controls — pure display mode
  • stageMode state (boolean) in App
  • CSS: .stage-overlay, .stage-overlay-inner, .stage-overlay-close,
    .stage-overlay-set, .stage-overlay-set-header, .stage-overlay-song,
    .stage-song-num, .stage-song-body, .stage-song-title, .stage-song-meta,
    .stage-song-key, .stage-song-bpm, .stage-song-time, .stage-song-cue,
    .stage-mode-btn

── PR #74 (perRole-csv-columns) ─────────────────────────
  Merged: 2026-05-28
  Branch: claude/perRole-csv-columns

  What shipped:
  • Phase 3: single ARRANGEMENT column replaced with 6 per-role columns
    in all CSV paths:
    Arr General | Arr Drums | Arr Keys | Arr Bass | Arr Guitar2 | Arr Ending Cue
  • exportSongs() — calls parseArrangement() on each song, emits 6 cells
    (handles both JSON and legacy plain-text arrangement fields)
  • downloadSampleCSV() — updated header + sample data using macro-style tags
  • importNormalizeRow() — detects per-role headers via ARR_ROLE_IMPORT_HEADERS
    synonym table, calls serializeArrangement() to reconstruct; falls back to
    legacy single ARRANGEMENT column if no per-role headers found
    (fully backward compatible with old exports)
  • importToCanonicalCSV() — Import+Normalize canonical download now emits 6 cols
  • ARR_ROLE_IMPORT_HEADERS constant (~line 690) — synonym map for each role:
    e.g. 'arr drums', 'arrangement drums', 'arr_drums' all map to drums role

── PR #76 (lv-henderson-venues-data) ────────────────────
  Merged: 2026-05-30
  Branch: claude/lv-henderson-venues-data

  What shipped:
  • las-vegas-henderson-venues.csv — 57 Las Vegas/Henderson live music venue
    prospects, ready to import via Venues tab → ⬆ Import CSV
  • Columns: Name, Email, Phone, Contact Name, City, State, Venue Type,
    Website, Status (all=prospect), Notes (live music days/schedule)
  • Coverage: Strip/casino lounges (20), Fremont East/Downtown/Arts District (12),
    off-Strip Las Vegas (14), Henderson/Green Valley (11)
  • Phone: 54/57 venues; websites: 56/57; booking emails: 3 (Hard Rock Live,
    The Barbershop, SoulBelly BBQ)

── PR #78 (bookings-setlist-link) ───────────────────────
  Merged: 2026-05-30
  Branch: claude/bookings-setlist-link

  What shipped:
  • Setlist linking — booking form shows a setlist dropdown when saved setlists
    exist; selection stored as setlistId on the booking object
  • Linked setlist name rendered in booking list row (accent colour, 🎵 prefix)
  • Completed status added — 4th option alongside pending/confirmed/cancelled
    - Grey styling in both calendar (.booking-cal-event.completed) and list row
  • BLANK_BOOKING gains setlistId: '' field
  • setlists prop threaded App → VenueModal so dropdown stays in sync

── PR #79 (next-gig-widget-email-from-booking) ──────────
  Merged: 2026-05-30
  Branch: claude/next-gig-widget-email-from-booking

  What shipped:
  • Next Gig banner — inline IIFE between band-bar and main-grid (~line 8118)
    - Filters bookings for status confirmed|pending and date >= today
    - Sorts ascending, shows nearest upcoming gig
    - Displays: venue · date · start time · fee · linked setlist · status badge · days-until
    - Clicking banner opens VenueModal; renders nothing if no future bookings
    - CSS: .next-gig-banner, .next-gig-label, .next-gig-venue, .next-gig-date,
      .next-gig-setlist, .next-gig-days, .next-gig-status.confirmed/pending

  • Email from booking — ✉ button in booking list row (~line 6187)
    - Shown only when the linked venue has an email address
    - Calls fillAndSend('bookingConfirmation', bookingVenue, b)
    - Pre-fills template with venue name, contact, date, start time, fee
    - Opens system mail client via mailto:; advances venue status on send

── PR #82 (gig-sheet-pdf) ────────────────────────────────
  Merged: 2026-05-30
  Branch: claude/gig-sheet-pdf

  What shipped:
  • 📄 button on every booking list row — generates and downloads a jsPDF gig sheet
  • downloadGigSheet(booking, venue, linkedSetlist) defined inside VenueModal (~line 5926)
    alongside fillAndSend — uses window.jspdf already loaded by the app
  • PDF sections: Band name header + GIG SHEET label, accent rule divider,
    VENUE (name/city-state/phone/email/contact/website),
    SHOW DETAILS (date/start/end time/fee/status/notes),
    SETLIST (numbered rows: title caps · artist · key · BPM · duration,
    alternating row shading, total songs + runtime footer)
  • Setlist section only appears when a setlist is linked to the booking
  • Handles page overflow for long setlists (new page when within 60pt of bottom)
  • Filename pattern: gig-sheet-{venue-slug}-{YYYYMMDD}.pdf
  • 📄 button always visible regardless of venue email

── PR #84 (youtube-media-links) ─────────────────────────
  Merged: 2026-05-30
  Branch: claude/youtube-media-links

  What shipped:
  • song.mediaLinks[] — new array field on song objects: [{ id, url, ts, label }]
    - url: YouTube URL (youtu.be/, watch?v=, /embed/ formats, including unlisted)
    - ts: optional timestamp string "MM:SS" or "H:MM:SS"
    - label: short description of what the clip demonstrates
  • "Reference Clips (YouTube)" section in Add and Edit song forms,
    below the arrangement roles grid
    - URL + MM:SS + label inputs → "+ Add" validates YouTube ID before saving
    - Listed clips show label, timestamp, and remove button
  • Advance View: "Clips" row appears below Arrangement for songs with media links
    - Each clip is a <details> accordion: click ▶ to expand 16:9 inline iframe player
    - Player starts at specified timestamp via ?start=N embed param
    - Hidden in Stage Mode (no distractions on stage)
  • Helper functions (global scope, ~line 751):
    - getYTVideoId(url) — extracts 11-char ID from known URL patterns
    - tsToSeconds(ts) — MM:SS or H:MM:SS → integer seconds
    - getYTEmbedUrl(url, ts) — builds embed URL with optional ?start=N
  • SongLibrary state additions: newClip, editClip ({ url, ts, label })
  • form and editForm now include mediaLinks: []
  • CSS: .media-clips-section, .media-clips-label, .media-clip-row,
    .media-clip-row-label, .media-clip-row-ts, .media-clip-add,
    details.media-clip-player, .media-clip-iframe-wrap

── PR #86 (pdf-stage-ready-redesign) ───────────────────
  Merged: 2026-05-30
  Branch: claude/pdf-stage-ready-redesign

  What shipped:
  • exportPDF() redesigned for stage readability and clean print layout
  • Song rows now show: rounded number badge | TITLE (caps) + artist italic
    sub-line | KEY | BPM | STYLE — no inline arrangement text on song rows
  • Arrangement notes collected during render into a footnotes[] array,
    printed on the summary/diagnostic page under "ARRANGEMENT NOTES" section
    - Each footnote numbered to match the song badge
    - Only emitted for songs with hasArrangementData() = true
  • Column widths: NUM_W=38 | KEY_W=10% | BPM_W=10% | STY_W=22% | TTL_W=remainder
  • Summary page unchanged (total time, songs per set, diagnostic) + footnotes appended
  • Result: cleaner on-stage document — arrangement detail on back page only
  • CSS/PDF: no changes to DOM; all formatting in jsPDF drawing code (~line 7100)

── PR #90 (stage-mode-tap-highlight) ───────────────────
  Merged: 2026-05-30
  Branch: claude/stage-mode-tap-highlight

  What shipped:
  • Tap-to-highlight in StageModeOverlay — tap a song row to mark it active
    - Active row: accent-orange background (rgba(255,107,53,.10)), left border, ▶ NOW badge
    - All other rows: dimmed to 28% opacity (.stage-dimmed)
    - Tap the active row again to clear the highlight
  • ArrowDown / ArrowUp keyboard navigation — moves highlight through songs
    in order, auto-scrolls active row into view (scrollIntoView smooth/center)
  • Highlight state stored in currentKey ("${si}-${songIdx}") — keyed per set + position
  • ESC still exits Stage Mode (unchanged)
  • Highlight resets to null whenever the overlay opens (useEffect on open prop)
  • flatKeys memo — ordered array of all song keys for keyboard navigation
  • currentRef — React.useRef attached to the active row for auto-scroll
  • New CSS: .stage-overlay-song gains cursor:pointer + border-radius + transition;
    .stage-overlay-song.stage-current, .stage-overlay-song.stage-dimmed,
    .stage-current-badge added; .stage-overlay-song:hover rule added

── branch claude/agent-roadmap-venue-csv-VXJra (PR #95) ──
  In progress: 2026-05-31

  Data:
  • las-vegas-venues-expansion.csv — 30 net-new live-music bars & clubs across
    the Vegas metro (locals-casino lounges, Fremont East/Arts District, jazz &
    supper clubs, dives, country/honky-tonks, Summerlin). Same 10-col schema as
    las-vegas-henderson-venues.csv; deduped against the existing 57; all prospect.

  BandHelper setlist import (PDF → saved gig):
  • pdfExtractRows() — PDF.js text extraction preserving per-item X positions
  • pdfParseBandHelperSets() — partitions rows under "Set N (...)" headers into
    sets; maps cells to columns by X-position (survives blank Style cells and a
    merged "Tempo Style" header that break tab-index parsing); cleans key /
    duration (M:SS→decimal) / vocalist (ALL!→ALL). Helpers: bhDetectColumns,
    bhAssignRow, bhClean{Duration,Key,Vocalist}, BH_SET_HEADER_RE.
  • importBandHelperSetlist(file, addToLibrary) in App — builds setlist objects
    (style inferred when blank), creates a STANDALONE saved gig named from the
    file (stored in Gig Profiles / bandGigs), optionally adds new songs to the
    library (deduped). Reuses existing gig storage — keeps song pool clean.
  • GigProfileModal: "⬆ Import Setlist from PDF" button + "also add songs to my
    library" checkbox (default off). onImportBandHelper prop App → GigProfileModal.
  • Design choice: imported setlists are one-and-done storage in Gig Profiles,
    loadable/annotatable/exportable; library untouched unless checkbox ticked.

  Features (the 3 roadmap items below, now shipped):
  • Venue CSV status normalisation — handleVenueCSV() now normalises the Status
    column against VENUE_STATUSES keys, display labels, and a synonym table
    (STATUS_SYNONYMS). Unrecognised values default to prospect with a toast count.
  • Repeat-venue guard — renderBookingsTab() computes venueHistory when a venue is
    selected in the booking form: lists prior bookings (date/status/setlist) and the
    most recent linked setlist's song titles. CSS: .repeat-venue-guard*.
  • Booking analytics dashboard — new renderAnalyticsTab() (📊 Analytics tab, 4th in
    VenueModal). Stat cards + most-played-venues bar chart. parseFee() reads numbers
    from free-text fee strings; cancelled bookings excluded from value totals.
    CSS: .analytics-*.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY FUNCTIONS & LINE NUMBERS (approximate — verify on read)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

getYTVideoId()                ~751   — extracts 11-char YouTube ID from youtu.be/watch?v=/embed/ URLs
tsToSeconds()                 ~751   — MM:SS or H:MM:SS timestamp string → integer seconds
getYTEmbedUrl()               ~751   — builds YouTube embed URL with optional ?start=N param
parseArrangement()            ~695   — str → { global, drums, keys, bass, guitar2, endingCue }
serializeArrangement()        ~705   — obj → JSON string (plain string if only global)
getArrangementCue()           ~718   — 40-char Stage View cue from arrangement
hasArrangementData()          ~726   — bool: any role field populated
ARR_ROLE_IMPORT_HEADERS       ~690   — synonym map for per-role CSV column detection
generateSetlistsCore()        ~3050  — main setlist algorithm
generateSetlistsCore_WithTonalGravity()  ~2550
generate()                    ~6490  — App-level trigger, calls core + injects arrangement notes
exportSongs()                 ~6559  — CSV export (6 per-role arrangement columns)
importCSVRobust()             ~6770  — Quick Import (CSV/PDF, fuzzy dedup)
importCanonicalRows()         ~6938  — Import+Normalize modal finalizer
importToCanonicalCSV()        ~1930  — generates canonical CSV with 6 per-role columns
exportPDF()                   ~7100  — jsPDF export (view-mode aware)
copyToClipboard()             ~7030  — Plain text copy (view-mode aware)
openEmailShare()              ~7040  — Formats email-ready text, opens EmailShareModal
downloadSampleCSV()           ~6838  — Downloads sample CSV with 6 per-role arr columns
StageModeOverlay()            ~5934  — full-screen dark overlay; tap-to-highlight, arrow nav
VenueModal()                  ~5982  — Venue CRM + Booking Calendar + EPK templates
downloadGigSheet()            ~5926  — generates + downloads jsPDF gig sheet for a booking;
                                       sections: header, venue, show details, setlist (if linked)
fillAndSend()                 ~5901  — builds + opens mailto: from template + placeholders;
                                       also auto-advances venue status on send
renderBookingsTab()           ~6072  — booking calendar + CRUD form (inside VenueModal)
bulkAddVenues()               ~6526  — deduplicates + batch-adds venues from CSV import
addVenue/updateVenue/...      ~6520  — CRUD for venues, bookings, EPK settings in App
ARRANGEMENT_MACROS            ~665   — 22 quick-tag constants { cat, label, role, text }
advanceRoleFilter             App state (Set<role>) — controls which roles appear in exports
stageMode                     App state (bool) — controls StageModeOverlay visibility
poolRequired / poolOk         SetConfiguration derived values — pool meter calculation
BLANK_BOOKING                 ~815   — { venueId, venueName, date, startTime, endTime,
                                         fee, status, setlistId, notes }

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
SUGGESTED NEXT STEPS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ DONE (PR #95) — Gig history / repeat-venue guard
✅ DONE (PR #95) — Venue CSV import status normalisation
✅ DONE (PR #95) — Booking analytics / dashboard

✅ DONE (PR #95) — BandHelper setlist import (PDF → saved gig)
   NOTE: parser unit-tested against the DSJ "Roadkill Grill" sheet structure,
   but real BandHelper PDF extraction (X-position column detection, the merged
   "Tempo Style" header) still needs validation against an actual exported PDF.
   If columns misalign, tune bhDetectColumns / bhAssignRow against real output.

✅ DONE — Rename-on-import: BandHelper PDF import now has a "Name this setlist"
   step (pre-filled from filename) before creating the gig.
✅ DONE — Mobile touch drag-and-drop: ⠿ handle shown in Reorder mode on touch
   devices drives a real touch drag (touch-action:none on handle, elementFromPoint
   hit-testing, reuses desktop dragState + reorder/move helpers). Locks + Swap/
   Balance + up/down arrows unchanged. TODO: edge auto-scroll for very long sets.

✅ DONE — EPK generator: PDF (jsPDF) + designed Web EPK (HTML, dark/red/gold,
   2-page buyer-facing layout) with logo, hero photo, self-contained QR, and a
   .html download to host as {{epk_link}}. Editor in Venue modal → EPK & Templates.
✅ DONE — Outreach wiring: 'Venue-Tailored Pitch' template + suggestForVenue()
   (VENUE_TUNING maps venue type → vibe + genre keywords, scores the library by
   keyword/energy fit). fillAndSend resolves {{tailored_pitch}}, {{suggested_songs}},
   {{venue_type}}, {{epk_link}}, {{demo_link}}, {{linktree}}, {{genres}}, {{best_for}}.

✅ DONE — Vegas sub/dep roster (🎸 Roster, RosterModal): per-band roster with
   instruments, availability, rate, vocals, known songs; coverage matching shows
   'covers X/N' of the current setlists per sub. LS key bandRoster.

1. Per-role CSV columns — Import+Normalize column mapping UI
   Expose the 6 per-role arr columns in the manual column-mapping dropdowns of
   the Import+Normalize modal so users can hand-assign them when header names
   don't match the synonym table.

3. Song media/audio linking — extend mediaLinks to support direct audio uploads
   (MP3/WAV stored as base64 or object URL) in addition to YouTube links;
   playlist-level reference view.
