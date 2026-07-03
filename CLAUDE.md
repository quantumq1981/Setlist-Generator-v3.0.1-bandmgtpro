# CLAUDE.md — Setlist Generator Pro

Authoritative engineering guide for this repository. Supersedes `Agent.MD` (kept
for historical handoff notes). Read this first.

Last updated: 2026-07-03.

---

## 1. What this is

A **single-file React app**. Everything ships in `index.html` (~10.5k lines) plus
three small companion files loaded as `text/babel`: `featureHelp.js`,
`InfoModal.jsx`, `InfoTrigger.jsx`.

- **No build step.** React 18 + Babel Standalone transpile JSX in the browser.
- **No backend.** All state lives in `localStorage`.
- The app helps working bands manage a song library and **generate ordered
  setlists** using an energy/tonal/diversity optimization algorithm, then export
  them to PDF/CSV and share them.

### CDN dependencies (pinned)
React 18, ReactDOM 18, `@babel/standalone` 7.29.7, jsPDF 2.5.1, PapaParse 5.4.1,
PDF.js 3.11.174, mobile-drag-drop 3.0.0-rc.0.

---

## 2. Working in this repo

### Editing
`index.html` is one enormous file. Use `Grep`/`Read` to locate a region before
editing. The main app logic lives in the final `<script type="text/babel">` block
(roughly lines 800–10500). Top-of-script module scope holds the pure algorithm and
data (genre DB, energy/tonal functions, generator); React components are defined
below them in the same scope.

### Verification workflow (important — the sandbox has no CDN access)

Outbound access to `unpkg`/`cdnjs`/`jsdelivr` is **blocked** by the agent proxy, so
the app's own `<script src=…>` CDN tags will not load in a headless browser as-is.
Two-step recipe that works and should be reused:

1. **Compile-check the JSX** (catches syntax errors → a blank page):
   ```js
   // extract the big text/babel script and run it through Babel
   require('@babel/standalone').transform(code, { presets: ['react'] });
   ```
2. **Headless render** by vendoring the libs from **npm** (npm registry *is*
   reachable; CDNs are not). `npm i react@18 react-dom@18 jspdf@2.5.1
   papaparse@5.4.1 pdfjs-dist@3.11.174 mobile-drag-drop@3.0.0-rc.0
   @babel/standalone@7.29.7`, rewrite the CDN `src`/`href` URLs to the local
   `node_modules/**/umd/*.js` copies, serve the folder over `http`, and drive it
   with the preinstalled Chromium at `/opt/pw-browsers/chromium` via Playwright.
   Assert `pageerror` count is 0 and the expected DOM is present.

The pure algorithm functions can also be unit-tested directly: `grep` the function
source out of `index.html`, `eval` it in Node with its small dependencies, and
assert on outputs (see how the energy-arc and template tests were written).

### Git / PRs
Feature branch: `claude/set-list-import-format-snxsm5`. Open PRs against `main`.
When a PR merges, restart the branch from `origin/main` for the next change.

---

## 3. Song object schema

```
{
  id, status: 'active'|'cold',
  title, artist,
  duration,   // decimal minutes, e.g. 4.5
  style,      // lowercase style key — see §4
  key,        // musical key, e.g. 'Am', 'F#'
  bpm,        // tempo as string
  energy,     // OPTIONAL manual energy 1–10 — overrides computed energy (see §6)
  vocalist,
  arrangement,// JSON { global, drums, keys, bass, guitar2, endingCue } or legacy text
  styleInferred?, mediaLinks?
}
```

`style` is stored **lowercase**, matching the keys of `GENRE_PARAMS` / `ENERGY_MAP`
and the `<option value>`s in the editor. Always keep those three in sync.

---

## 4. Genre / style system

Three layers, all near the top of the script:

1. **`GENRE_DATABASE`** (~line 1190): the canonical styles. Each entry has
   `{ style, baseEnergy (1–10), gravityGroup (1–4), harmonicFriction
   (Low/Mid/High/Fluid), gravityBias (Static/Clockwise/Counterclockwise/Fluid),
   description }`. This is the single source of truth for a style's musical
   behavior. `GENRE_PARAMS[style.toLowerCase()]` is the O(1) lookup;
   `ENERGY_MAP` is derived from it (plus legacy short keys).

2. **Legacy short tags** (`_LEGACY`, `ENERGY_MAP` literals): older libraries saved
   styles like `rock`, `blues`, `funk`, `slow blues`. These are mapped to canonical
   params so they still resolve energy/tonal data.

3. **Editor dropdown** (`STYLE_GROUPS` + `<StyleOptions>` component, ~line 1300):
   the sub-categorized Style picker used in the add/edit-song forms. Values are
   lowercase; labels are display-case. Both the add form and the inline-edit form
   render `<StyleOptions />` — **do not** re-hardcode option lists.

**Import aliasing:** `STYLE_ALIASES` (~line 2120) normalizes variant style spellings
on CSV/PDF import. Keep it from collapsing distinct first-class styles (e.g. do
*not* map `slow blues`→`blues`). `PDF_KNOWN_STYLES` is derived from `ENERGY_MAP`.

### Adding a new style — checklist
1. Add an entry to `GENRE_DATABASE` with sensible `baseEnergy` / `gravityGroup` /
   `harmonicFriction` / `gravityBias` / `description`.
2. Add a CSS color var (`--style-slug`) and a `.style-slug` badge class (badge slug
   = `style.replace(/\s+/g,'-')`).
3. Add it to the right `STYLE_GROUPS` sub-category so it's selectable.
4. Add it to the appropriate `SET_STRUCTURE_TEMPLATES` zones' `preferStyles` so the
   arc templates place it well (or rely on the energy/gravity fallback in
   `templateStylePenalty`).
5. Add import aliases in `STYLE_ALIASES` for common spellings.

Styles currently include the five sub-styles added 2026-07: **Minor Blues,
Up-Tempo Boogie, Funk Shuffle, Gospel, Gospel Jazz** (Smooth Jazz already existed).

---

## 5. The setlist algorithm

Two entry points, selected by `settings.useTonalGravity`:
`generateSetlistsCore(songs, opts)` (energy/diversity/template only) and
`generateSetlistsCore_WithTonalGravity(...)` (wraps the core, then refines).

Pipeline:

1. **`generateSetlistsCore`** — greedy construction. For each slot it scores the
   candidate pool and picks by weighted penalty, with `randomness` injecting
   controlled jitter. Penalty terms:
   - **timePenalty** — fit remaining set duration.
   - **diversityPenalty** — same style/artist back-to-back, plus a run penalty for
     3+ consecutive songs of the same `gravityGroup`. Scaled by `diversityWeight`.
   - **energyPenalty** — `|getCompositeEnergy(song) − targetEnergyCurve(pos)|`
     × `energyWeight`, plus a jump-smoothness term. Only when `useEnergyCurve`.
   - **tonalPenalty** — `−tonalScore × tonalWeight` when `useTonalGravity`.
   - **templatePenalty** — `templateStylePenalty(style, pos, setTemplate)`.
   - **affinity/anti-affinity** — user "keep together / keep apart" song pairs.
   Also honors forced openers/closers, locks/pins, and set-count/duration targets.

2. **Tonal-gravity refinement** (`_WithTonalGravity`) — bidirectional adjacent-swap
   sweeps + distance-2/3 swaps that improve `calculateTonalTransitionScore_TG`
   while respecting locks and (optionally) energy-curve adherence.

3. **Simulated annealing** (`simulatedAnnealingOptimize`) — runs only when
   `optimizationLevel === 'deep'`. Minimizes a global `cost()` combining energy
   adherence, energy jumps, tonal transitions, style/artist diversity,
   `gravityGroup` runs, and affinities. Locked indices never move.

4. **Diagnostics + quality score** — `calculateSetlistQualityScore` returns
   `{ overall, energy, tonal, diversity, duration }` (0–100), shown in the UI/PDF.

### The four documented configuration features

| Website feature | Setting | Code |
|---|---|---|
| **Energy Curve Optimization** | `useEnergyCurve`, `energyWeight` | `getCompositeEnergy`, `targetEnergyCurve`, energyPenalty/cost |
| **Curve Presets** (arc shapes) | `setTemplate` | `ENERGY_ARC_SHAPES`, `SET_STRUCTURE_TEMPLATES`, `templateStylePenalty` |
| **Tonal Gravity** | `useTonalGravity`, `tonalSmoothness`, `anchorKey` | `normalizeKey_TG`, `circleDistance_TG`, `calculateTonalTransitionScore_TG` |
| **Optimization Modes** | `optimizationLevel` `'standard'`\|`'deep'` | greedy core vs `simulatedAnnealingOptimize` |

There is also a **venue "Curve Preset"** control (`energyCurveType`:
standard/party/jazz/festival/wedding/acoustic) that sets the *baseline and
amplitude* of the energy target. It is distinct from the arc **shape** (below).

---

## 6. Energy model (`getCompositeEnergy`)

Precedence:
1. **Explicit per-song `song.energy`** (1–10) wins outright — the truest
   "song as a whole" signal. Settable in the add/edit-song forms (Energy field).
2. Otherwise blend style energy (`ENERGY_MAP[style]`, 60%) with BPM-derived energy
   (40%); fall back to whichever exists; neutral `4` if no data.

This is the single energy entry point used everywhere (greedy, SA, refinement,
quality score, exports), so tuning it propagates consistently.

> **Known follow-up:** the CSV/PDF **import** pipeline canonicalizes through a
> fixed-schema CSV and does *not* yet carry the `Energy` column into the stored
> song. Manual entry via the editor works today; wiring import → `song.energy`
> end-to-end (synonyms, `importNormalizeRow` out, `importToCanonicalCSV`
> header/rows, and the re-parse) is a clean next task.

---

## 7. Energy-arc shapes (Curve Presets)

`targetEnergyCurve(position, curveType, template)` computes the target energy at a
normalized set position (0→1). When `template` names an arc with a defined shape it
uses `ENERGY_ARC_SHAPES[template]` for the **contour** and the venue preset for
baseline/amplitude; otherwise (`freeform`/unset) it falls back to the original
venue sine (so default behavior is unchanged).

Verified contours (`ENERGY_ARC_SHAPES`):
- **classic** — single deliberate summit near mid-set, controlled landing.
- **doublePeak** — two surges (~25% and ~74%) with a real valley (~50%).
- **slowBurn** — patient, monotonically rising build to a late peak.
- **highEnergy** ("Freeform High") — sustained high plateau with one mid-set dip.

Because the shape now drives the *energy target the optimizer aims at* (greedy,
SA, refinement, and quality score all pass `opts.setTemplate`), the Set Template
and Energy Curve Optimization are coherent: picking "Slow Burn" actually targets a
late-building energy contour, not just style placement.

`SET_STRUCTURE_TEMPLATES` additionally biases *style* placement per zone via
`preferStyles` (explicit −0.8 bonus) with an energy/gravity **fallback** so any
canonical style — including newly added sub-styles — is placed by feel even if not
named in a zone.

---

## 8. Tonal Gravity (Circle of Fifths)

`normalizeKey_TG` parses a key string into `{ tonic, mode, displayTonic }`.
`circleDistance_TG` is the min steps around the 12-tone circle.
`calculateTonalTransitionScore_TG(prev, next, pos, len, smoothness, opts)` scores a
transition from base distance + relative/parallel mode bonuses − repetition, plus:
- **directionBonus** — clockwise lifts early, counterclockwise releases late.
- **anchorBonus** — proximity to the set's anchor key at boundaries.
- **frictionBonus** — from the outgoing style's `harmonicFriction`.
- **biasBonus** — rewards movement that flows with each style's `gravityBias`
  (and penalizes large leaps out of `Static` genres).

`tonalSmoothness` (0–100) trades cohesion vs. intentional contrast slots. Genre
params flow in automatically for any style in `GENRE_DATABASE`, so new styles
participate in tonal scoring with no extra wiring.

---

## 9. Change log — 2026-07 algorithm pass

- **Per-song energy override** in `getCompositeEnergy`; Energy field added to the
  add/edit-song forms (persisted via `addSong`/`updateSong` spread).
- **Arc-shape energy targets** (`ENERGY_ARC_SHAPES`) so Classic Arc / Double Peak /
  Slow Burn / Freeform High shape the actual energy target; all `targetEnergyCurve`
  call sites now pass `opts.setTemplate`.
- **New sub-styles integrated** into every `SET_STRUCTURE_TEMPLATES` zone's
  `preferStyles`, and `templateStylePenalty`'s fallback generalized so any style is
  placed by energy/gravity feel (fixes Gospel Jazz being penalized everywhere).

Verification for this pass: Babel compile clean; unit tests on the changed pure
functions (energy override honored/clamped, arc contours assert 2 peaks for
doublePeak, monotonic rise for slowBurn, mid dip for highEnergy, new styles present
in template zones with sensible penalties); headless render with 0 page errors and
the Energy field present.
