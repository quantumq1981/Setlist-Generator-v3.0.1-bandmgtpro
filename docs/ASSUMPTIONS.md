# StageStand — assumptions & architectural reconciliation

The `LiveMusicStandAddon.md` brief asks for a production-grade live-performance music
stand ("StageStand") and instructs the builder to document its assumptions here. This
file records how that brief was reconciled with the real target codebase, **BandLeaderHQ**
(`index.html`), and what was built vs. deferred. It is the companion to CLAUDE.md §9aa.

## The core tension

The brief specifies a **greenfield standalone product**: a pnpm monorepo (React 19 +
TypeScript + Vite + SWC), Capacitor 6 native iPad builds, OSMD/VexFlow/alphaTab/ABCJS
notation engines, Tesseract OCR, a perfect-freehand ink engine, Web Audio/AudioWorklet +
Web MIDI, **Yjs CRDT band-sync**, and a Supabase/Postgres backend.

Every one of those contradicts a load-bearing constraint of the app this feature is being
added to (CLAUDE.md §1):

- **No build step.** The app ships as one `index.html` with React 18 transpiled in the
  browser by Babel Standalone. A monorepo/Vite/TypeScript toolchain is a different product.
- **No backend, local-first.** All state is in `localStorage` + IndexedDB. Yjs CRDT
  sync and a Postgres backend have nowhere to live.
- **Single-file distribution.** Capacitor native builds and a package graph are out of scope.

The owner's instruction ("add the feature… align perfectly with the state of the app")
governs over the brief's "build a monorepo / do not ask questions." So we extract the
brief's **product intent** and realize the achievable, highest-value spine inside the app.

## Decision

Build StageStand as an **in-app feature**, reusing what already exists:

| Brief need | Reused app infrastructure |
|---|---|
| Offline chart storage (F1/F9) | `attStore` IndexedDB blob store (CLAUDE.md §9x) |
| Per-song charts (F1) | `song.attachments[]` + `SongAttachments` editor |
| Setlist / roadmap (F3) | `setlists` state; arrangement roles+sections (§11) |
| Distraction-free stage view (F10) | `StageModeOverlay` + `.stage-overlay` CSS |
| PDF rendering (F2) | **PDF.js is already loaded** (import path) — reused for *render* |

Net new dependencies: **zero**.

## What Phase 1 (PR 6) delivers

The brief's non-negotiable outcome #1 — instantly display the exact chart/page for the
selected song, page through it, offline, distraction-free:

- Full-screen chart viewer inside Stage Mode: renders a song's **PDF** (PDF.js → canvas,
  per page) or **image** attachment inline (previously charts opened in a new browser tab).
- A **cue card** (title + arrangement roadmap) for songs with no chart, so page-turns walk
  the entire set and every song shows something.
- Navigation: click zones, horizontal swipe, and keyboard — which transparently supports
  most **Bluetooth page-turn foot pedals** (they emit arrow/PageUp-Down keys). Jump to any
  song via a ☰ Setlist index.
- Stage ergonomics: fit-to-width / whole-page, dark/amber/light contrast for stage lighting,
  auto-hiding chrome. Preferences persist per device.
- Fully offline (blobs already in IndexedDB). Renderer is a **type-keyed registry** so more
  formats slot in later without touching callers.

Verification: `npm test` 167/167; Babel compile clean; a headless Playwright drive of the
real app (13/13, 0 page errors) covering the PDF/image/cue-card render paths, page turning,
contrast, persistence, and exit.

## Deferred (mapped to the brief's feature modules)

These are intentionally out of Phase 1 to bound regression risk; each is a natural later
phase on the same foundation.

- **F2 — Notation renderers** — **delivered in PR 8**: ChordPro (custom, transposable),
  ABC (ABCJS), MusicXML (OpenSheetMusicDisplay), Guitar Pro (alphaTab), each lazy-loaded on
  first use via the `resolveChartFormat` registry seam; import widened to accept them.
  **PowerTab (.ptb)** has no in-browser renderer (the spec routes it through offline
  conversion) so it shows a convert-to-GP/MusicXML guidance card. See CLAUDE.md §9ac.
- **F2 — Page-pinned arrangement sections → PDF pages** (`PageMap`): **delivered in PR 7** —
  a PDF chart carries `marks: [{id,label,page}]`, edited per-attachment in the song form, and
  Stage Mode shows a jump-chip strip (`[` / `]` to step markers). See CLAUDE.md §9ab.
- **F4 — Apple Pencil ink annotation** — **delivered in PR 10** (personal, per-device):
  pen/highlighter/eraser ink on PDF/image charts, pressure→width, undo/redo/clear, stored
  offline in IndexedDB per (chart,page) in normalised coords, on the backup path. The
  **band-sync half is F8 (needs a backend) and stays out**. See CLAUDE.md §9ae.
- **F5 — Live transposition** of chord/lyric charts — **delivered in PR 8** for ChordPro
  (semitone up/down in Stage Mode) and **extended to MusicXML in PR 11** (OSMD
  `TransposeCalculator`, same ♭/n/♯ + −/=/0 stage control). Guitar Pro/ABC transposition
  (their libraries don't expose a clean live-transpose seam) remains future.
- **F6 — Audio backing tracks / click** — **delivered in PR 9** (pragmatic subset): per-song
  backing track stored offline in IndexedDB + a BPM-derived Web Audio metronome, play/stop/loop
  in Stage Mode. **Multichannel output routing is not achievable client-side** and remains out.
- **F7 — MIDI** — **delivered in PR 9** (pragmatic subset): per-song Program Change sent on song
  select via the Web MIDI API. MIDI clock/SysEx and a dedicated foot-pedal mapping UI remain out
  (clock/SysEx aren't reliably achievable client-side). See CLAUDE.md §9ad.
- **F8 — Band-wide CRDT sync** (Yjs). Impossible without a backend; the existing full-backup
  export/restore is the current interchange between devices.
- **F1 — OCR / fuzzy auto-match / bulk chart auto-organize** — **delivered in PR 11**: a
  "Match Charts to Songs" modal bulk-drops chart files, fuzzy-matches each to a library song
  by filename (pure `fuzzyMatchSong`, token-Jaccard + substring), lets the user confirm/override
  the target, and attaches every file to its song in one pass (into the existing `attStore`).
  For a scan with a useless filename, a per-row **Read title** button lazily loads Tesseract.js
  (OCR of page 1 via the already-loaded PDF.js → pure `ocrTitleGuess` → re-match), degrading
  gracefully when the engine can't load. See CLAUDE.md §9af.
- Native iPad (Capacitor), external-display presenter view, OSC.

## Assumptions

- Charts are predominantly **PDFs and scanned images** (what the app stores today); notation
  files are a later import path.
- "Foot pedal support" in Phase 1 means honoring the arrow/PageUp-Down/Space keycodes common
  BT pedals emit — not a bespoke MIDI/HID pedal driver.
- Stage preferences are **per device** (a new `setlist_stage_prefs_v3` localStorage key), not
  per band — they describe the reader's screen, not the band's data.
