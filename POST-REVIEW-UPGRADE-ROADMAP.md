# Setlist Generator – Non-Disruptive Upgrade Roadmap (GitHub Pages Safe)

This roadmap translates the findings from **Setlist-Generator-Expert-Review 2.docx** into a staged plan that keeps the current GitHub Pages app online and stable while introducing upgrades incrementally.

## Guardrails (do-not-break production mode)

1. Keep `index.html` as the production entry point until parity is proven.
2. Introduce all new logic behind feature flags (off by default).
3. Ship each phase independently with rollback notes.
4. Preserve CSV/PDF import/export behavior and schema compatibility.

---

## Phase 1 — Reliability + Data Safety (highest impact, lowest risk)

### 1) Storage quota monitor + backup prompts
- Add a `storageHealth` utility that estimates current localStorage bytes and warns at 70% and 85% usage.
- Add a non-blocking banner + toast when threshold is exceeded.
- Prompt user to export CSV backup before risky actions (bulk import, large paste, clear-all).
- Value: avoids silent save failures while keeping current localStorage model intact.

### 2) Autosave snapshots for recovery
- Save rolling snapshots (`snapshot_1..snapshot_3`) with timestamp.
- Provide “Recover previous snapshot” option in Settings.
- Value: practical crash recovery without infra changes.

### 3) Consistent CSV formula-injection hardening
- Enforce one path for all CSV exports: `csvEscapeCell(guardCSVCell(value))`.
- Add a validator that checks outgoing rows before download.
- Value: closes inconsistent edge-cases across export surfaces.

### 4) Generation abort consistency
- Hard-stop generation globally when no valid deduped candidates exist in no-reuse mode.
- Ensure force-closer replacement fully updates dedupe bookkeeping.
- Value: removes intermittent duplicate behavior under high constraints.

---

## Phase 2 — Mobile Compatibility (critical UX fix)

### 5) Touch-safe drag and drop fallback
- Keep current desktop HTML5 DnD.
- Add touch fallback mode for iOS Safari using pointer/touch handlers (or `@dnd-kit` in migration branch).
- Auto-detect unsupported HTML5 touch drag and switch mode.
- Value: unblocks iPad/iPhone workflow without changing desktop behavior.

### 6) Mobile interaction safety
- Replace native `window.confirm()` with in-app confirmation modal for delete/clear actions.
- Increase target sizes for move/lock/remove controls on narrow screens.
- Value: fewer accidental destructive actions, better tablet ergonomics.

---

## Phase 3 — Performance Improvements (still single-file compatible)

### 7) Memoized duration and derived song metrics
- Precompute `parsedDuration`, normalized key, and energy score on import/update.
- Stop recomputing inside render loops.
- Value: smoother re-renders with larger libraries.

### 8) Chunked generator execution
- Split long generation/optimization passes into chunks using `requestIdleCallback`/`setTimeout(0)` fallback.
- Show progress indicator (`Generating… 45%`).
- Value: prevents UI freeze on large libraries while preserving algorithm logic.

### 9) Lightweight list virtualization for Song Library
- Render only visible rows (+ buffer) for large song libraries.
- Value: major layout/render savings when lists exceed ~200 songs.

---

## Phase 4 — Security Hardening for CDN Runtime

### 10) Subresource Integrity (SRI) for all CDN scripts
- Pin exact script URLs and integrity hashes for React, ReactDOM, Babel, PapaParse, jsPDF, PDF.js.
- Value: reduces supply-chain risk while staying static-host friendly.

### 11) Input sanitization modernization
- Replace ad-hoc regex sanitizer with proven sanitizer (DOMPurify or strict text-only render model).
- Value: lowers XSS risk if rendering paths expand in future features.

### 12) Privacy-safe logging
- Remove user-content details from console warnings/errors.
- Log opaque IDs + error classes only.
- Value: reduces sensitive data leakage on shared machines.

---

## Phase 5 — Structural Modernization (parallel branch, no immediate cutover)

### 13) Introduce build branch (Vite) while production remains unchanged
- Create `next/` branch with Vite + module split (`components`, `utils`, `hooks`, `constants`).
- Keep production GitHub Pages tied to current entry until parity checklist passes.
- Value: modern pipeline without immediate deployment risk.

### 14) Storage adapter abstraction
- Wrap persistence in a `StorageAdapter` (`localStorageAdapter`, `indexedDbAdapter`).
- Keep default adapter localStorage initially.
- Value: enables future IndexedDB migration with minimal UI changes.

### 15) Test harness before switchover
- Add import/export round-trip tests for CSV and setlist integrity.
- Add deterministic generation tests (dedupe, duration bounds, opener/closer constraints).
- Value: safe modernization with measurable parity.

---

## Suggested feature upgrades (band workflow value)

1. **Remaining songs capacity meter** before generation (warn if request likely impossible).
2. **Pre-flight validator**: “You requested 3 sets × 45 min; library supports approx 2.4 sets without reuse.”
3. **Repertoire freshness controls** (avoid songs used in previous gigs by date).
4. **Smart import mapping** (column auto-detect + preview corrections).
5. **CSV compliance profiles** (Excel-safe, Google Sheets-safe, generic RFC4180).
6. **Set balancing presets** (Conservative, Dynamic, Dancefloor, Ballad-heavy).
7. **Undo/redo timeline** for manual edit mode.
8. **Band profile templates** (wedding/corporate/bar/festival default curves).

---

## Release strategy (no disruption)

- **Week 1:** Phase 1 (reliability) + tests.
- **Week 2:** Phase 2 (mobile DnD fallback) behind flag, then enable by default.
- **Week 3:** Phase 3 (performance) incremental.
- **Week 4:** Phase 4 (security hardening).
- **Parallel:** Phase 5 in migration branch with parity gates.

Rollback rule: every phase must be removable with a single revert commit and no data migrations that break existing localStorage state.
