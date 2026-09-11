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

- **F2 — Notation renderers** (OSMD/VexFlow/alphaTab/ABCJS/ChordPro) and importing those
  formats. Each is a heavy new CDN dependency; ship when there are real notation files to
  render. `resolveChartKind` is the seam.
- **F2 — Page-pinned arrangement sections → PDF pages** (`PageMap`): jump a roadmap section
  to its exact page. Builds on the arrangement roadmap already present.
- **F4 — Apple Pencil ink annotation engine** (pressure/tilt layers, undo/redo). Sizable;
  personal-only (no CRDT band-sync without a backend).
- **F5 — Live transposition** of chord/lyric charts (needs ChordPro/MusicXML data).
- **F6 — Audio backing tracks / click routing** (Web Audio/AudioWorklet, multichannel).
- **F7 — MIDI** program-change/CC triggers + a dedicated foot-pedal mapping UI (Web MIDI).
- **F8 — Band-wide CRDT sync** (Yjs). Impossible without a backend; the existing full-backup
  export/restore is the current interchange between devices.
- **F1 — OCR / Fuse.js fuzzy auto-match / bulk 100-PDF auto-organize.**
- Native iPad (Capacitor), external-display presenter view, OSC.

## Assumptions

- Charts are predominantly **PDFs and scanned images** (what the app stores today); notation
  files are a later import path.
- "Foot pedal support" in Phase 1 means honoring the arrow/PageUp-Down/Space keycodes common
  BT pedals emit — not a bespoke MIDI/HID pedal driver.
- Stage preferences are **per device** (a new `setlist_stage_prefs_v3` localStorage key), not
  per band — they describe the reader's screen, not the band's data.
