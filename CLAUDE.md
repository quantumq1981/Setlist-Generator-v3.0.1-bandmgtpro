# CLAUDE.md — Setlist Generator Pro

Authoritative engineering guide for this repository. Supersedes `Agent.MD` (kept
for historical handoff notes). Read this first.

Last updated: 2026-10-18 (club + speculative-room research pass, §9aw).

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

**Lazy-loaded notation renderers** (§9ac): abcjs 6.7.0, OpenSheetMusicDisplay 2.1.2,
`@coderline/alphatab` 1.8.4 — jsDelivr `npm` URLs in `NOTATION_LIBS`, injected on first
use of that format only (never on initial app load). Not in the `<head>`.

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

### Automated test suite (`npm test`)

A committed suite exercises the pure setlist-algorithm functions with **zero
dependencies** (Node's built-in `node:test` + `node:assert`), so it runs anywhere
`node` is available and needs no `npm install`:

```
npm test        # runs node --test test/*.test.js
```

`test/extract-algorithm.js` is the bridge: it lifts the **exact source** of a
whitelisted set of top-level declarations out of `index.html` (a
comment/string/template/regex-aware brace/semicolon scanner) and evaluates them in
a Node sandbox, then hands the live functions to the tests. There is nothing to keep
in sync — change a function in `index.html` and the tests exercise the new source on
the next run. If you add an algorithm function that depends on a new module-scope
symbol, add that symbol's name to the whitelist arrays in `extract-algorithm.js`.

Coverage: openers/closers (no cross-set duplication, pool distribution, reservation),
per-set opener/closer assignment + precedence, pairing (ordered adjacency, chains,
co-location, keep-apart non-adjacency) across the greedy, tonal-refinement, and deep
SA paths, constraint validation, and the energy/tonal pure functions (arc contours,
composite-energy precedence, `targetEnergyCurve` bounds, circle-of-fifths distance,
key parsing, quality score). Run it before and after any algorithm change.

For a one-off probe you can still lift a single function ad hoc, but prefer adding a
case to the suite so the check is permanent.

### Git / PRs
Feature branch: `claude/skill-point-usability-qqdkbn`. Open PRs against `main`.
When a PR merges, restart the branch from `origin/main` for the next change.

**The app is being rebranded to "BandLeaderHQ" and taken public (GitHub Pages +
custom domain).** This is a phased effort — see §9t for PR 1 (rebrand + public
shell + hosting) and the remaining phases (design system, IA/usability,
genericizing the Zemba seed data for a public product). `DEPLOY.md` is the hosting
runbook. Project design/engineering conventions now also live in
`.claude/skills/design-conventions/SKILL.md`.

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
  arrangement,// JSON { global, drums, keys, bass, guitar2, endingCue,      <- roles
              //        intro_cue, form_harmony, transition_outro, general_notes }  <- sections
              // or legacy free text. See §11.
  styleInferred?, mediaLinks?,
  attachments?  // [{id,name,mime,size,kind}] — metadata only; bytes live in IndexedDB (§9x) as
                // {__att:1,type,bytes:ArrayBuffer} records (legacy Blob values still read — §9aq)
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
   **Set-length mode** (`settings.setLengthMode`, §9as): `'time'` (default — fill each
   set to `setDurations`/`setDuration`) or `'library'` (split the whole active library
   evenly across `numSets`; every song placed exactly once). Per-set targets for either
   mode come from `resolveSetDurations(settings, songs)` — use it, not raw `setDurations`.

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

**Import carries energy.** CSV import reads an `Energy` column (synonyms
`energy`/`intensity`/`vibe`) through every song-creating path — the validated
`importNormalizeRow` → `importCanonicalRows`, the robust multi-file importer, and
the gig-setlist CSV importer (`row['Energy']`). Values are parsed, clamped to 1–10,
and stored as `song.energy`; a blank cell stays blank so the song falls back to
style+BPM. A non-numeric value raises the `energy_invalid` import warning. PDF
imports have no energy source, so those songs stay on auto. Because CSV **export**
writes the effective (computed-or-manual) energy, a round-trip pins each song's
energy to its exported value — clear the editor's Energy field to return a song to
auto.

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
- **Energy carried through CSV import** end-to-end (column synonyms,
  `importNormalizeRow` out, `importCanonicalRows` new+dedup-merge, the robust
  multi-file importer, gig-setlist import, and the canonical-CSV header/row), so a
  library's per-song `Energy` survives import and feeds `getCompositeEnergy`.
- **Song-meta UI surfaced** via shared `StyleBadge` + `EnergyMeta` components (used
  in the library, setlist, and unused-songs rows). The style badge carries a
  genre-aware tooltip (`styleBadgeTitle`: canonical name + description + energy/
  friction/bias) and every row shows an effective-energy dot (`energyColor`) that
  distinguishes a manual override from an auto style+BPM value.
- **Energy-curve preview** (`EnergyCurvePreview`) at the top of each generated set:
  an inline SVG plotting the target intensity arc (dashed, from
  `targetEnergyCurve` given the active preset + template) against the set's actual
  per-song energy (accent line, dots tinted by `energyColor`, per-point hover
  titles). Self-gates on `useEnergyCurve` + ≥2 songs; `SetlistView` now takes a
  `settings` prop.

Verification for this pass: Babel compile clean; unit tests on the changed pure
functions (energy override honored/clamped, arc contours assert 2 peaks for
doublePeak, monotonic rise for slowBurn, mid dip for highEnergy, new styles present
in template zones with sensible penalties); headless render with 0 page errors and
the Energy field present.

## 9b. Change log — 2026-07 opener/closer + pairing correctness pass

Fixes reported bugs where Force Opener / Force Closer duplicated songs across sets
and "pair together / keep apart" were unreliable. All in `generateSetlistsCore`
(greedy) with matching guards in `_WithTonalGravity` refinement and the SA cost.

- **No cross-set duplication of designated openers/closers.** The old code let a
  locked opener/closer bypass the dedup guard (`|| lockedOpeners.includes(id)`, and
  the closer candidate list never checked availability), so a single designated
  opener/closer was re-emitted in *every* set. Both now honor `isAvailable()` unless
  `allowSongReuse` — with N designations they distribute across up to N sets with no
  overlap; extra sets fall back to a style opener/closer.
- **Designated openers/closers are reserved** (`reservedRoleIds`) — held out of
  ordinary filler selection (primary + fallback candidate filters and both style
  fallbacks) so they remain available to fill their intended slot in a later set
  instead of being consumed as mid-set filler in set 1.
- **"Pair together" is now ordered + glued.** Affinities are read as directional
  `[a,b]` (a → b): `affinityNextMap`/`affinitySecondOf` drive (1) an order-bias that
  holds `b` back while `a` is still placeable and (2) a forced-adjacency pass that,
  right after `a` is placed, inserts `b` (and follows A→B→C chains via a cycle
  guard). Guarantees co-location, adjacency, and order rather than a soft bonus a
  timing/energy penalty could swamp.
- **"Keep apart" is now a hard non-adjacency guarantee.** At pick time the candidate
  pool is filtered to drop any song that is an anti-partner of the immediately
  preceding song, unless *no* alternative exists (deadlock-safe); the decayed
  gap-2/3 soft penalty is retained for extra spacing.
- **Refinement/SA respect pairings.** `_WithTonalGravity` swap sweeps (adjacent and
  distance-2/3) add a dominant `adjPairScore` so tonal gains never separate a pair
  or join an anti-pair; the deep-mode SA cost's affinity/anti adjacency weights were
  raised (−50 / +50) to the same effect.

Verification: Babel compile clean; pure-function unit tests (18 greedy + 7 tonal/SA)
asserting single/multi locked openers & closers appear exactly once and per-set with
no cross-set dup, affinity pairs stay adjacent & ordered & co-located, anti pairs
never adjacent — across greedy, always-on tonal refinement (under adversarial random
tonal scores), and deep SA; headless render boots with the app mounted and no JS
page errors.

## 9c. Change log — 2026-07 per-set opener/closer + constraint validation

Builds on 9b. Adds explicit per-set control and pre-generation conflict surfacing.

- **Per-set opener/closer assignment.** New settings maps `openerBySet` /
  `closerBySet` (`{ setIndex: songId }`). In `generateSetlistsCore`, an explicit
  assignment for a set takes precedence over the locked pool (`lockedOpeners` /
  `lockedClosers`) and the style fallback for that set; sets left on "auto" still use
  the pool → style path. Assigned songs join `reservedRoleIds` (held out of filler)
  and the `_WithTonalGravity` / SA locked-ID sets (never repositioned). Persisted per
  band with backward-compat defaults (`{}`).
- **UI**: a "Per-Set Opener / Closer" block in `SetConfiguration` renders one row per
  set (opener and/or closer dropdown, gated by the Force toggles). The old pool
  selectors remain as the "any of these" fallback.
- **Constraint validation.** New pure `validateGenerationConstraints(settings,
  activeSongs)` returns `[{severity:'error'|'warning'|'info', message}]` for: a song
  set as both opener & closer of one set; a song forced into multiple sets without
  reuse; pool openers/closers exceeding set count; a pair marked both "together" and
  "apart"; paired songs pinned/assigned to different sets; per-set picks with the
  Force toggle off; stale assigned IDs; and library-too-small-for-requested-minutes.
  Surfaced live as a "Constraint check" panel above Generate, and as a warning toast
  on generate when unresolved errors exist. Nothing blocks generation — it explains.

Verification: Babel compile clean; +14 pure-function unit tests (per-set openers &
closers land in their exact set with no cross-set dup, explicit picks override the
pool, and each validator rule fires on a crafted conflict and stays silent on a clean
config); prior 25 assertions still green; headless render boots with the per-set UI
present and 0 JS page errors.

## 9d. Change log — 2026-07 committed test harness + order-guarantee hardening

- **Committed, dependency-free test suite** (`npm test`, `test/`): 35 assertions over
  the real lifted algorithm source via `test/extract-algorithm.js` (see §2). Locks in
  the opener/closer, per-set, pairing, validation, and energy/tonal behavior so future
  algorithm changes have a regression net. Node's built-in runner; no `npm install`.
- **Hard pairing ORDER guarantee** (`generateSetlistsCore`). The "pair together" order
  was previously only a soft bias, so under randomness the second member of a pair
  could occasionally be picked before its leader — breaking A→B ordering and, more
  often, A→B→C chains. Selection now hard-excludes the second member of a pair while
  its leader is still placeable (deadlock-safe: skipped if every candidate is a
  held-back follower), making the forced-adjacency pass deterministic. Surfaced by the
  new chain test; the soft order-bias is retained as the ranking signal.
- **Infra**: added `.gitignore` (`node_modules/` is only ever transient for headless
  render) and a minimal `package.json` whose sole purpose is the `test` script.

Verification: `npm test` → 35/35, stable across repeated runs; Babel compile clean.

## 9e. Change log — 2026-07 venue outreach (mass messaging) + EPK usability pass

All inside `VenueModal` (plus CSS + one constant). Replaces the old per-venue row of
five blind `mailto:` template buttons with a preview-first, bulk-capable outreach flow.

- **Compose overlay** (`fillTemplate` → `openCompose`/`composeSend`): every email is
  now previewed in an editable To / Subject / Message panel before anything opens.
  Template chips switch + re-fill the draft in place; a warning flags unfilled
  `[EPK Link]` / `[Demo Link]` placeholders. Send options: default email app
  (`mailto:`), Gmail web compose, clipboard copy, or "Mark sent" (log-only, for
  copy-paste workflows). Sending stamps `lastContactDate`, bumps `prospect` →
  `contacted`, appends to a per-venue `contactLog` (new, backward-compatible field),
  and saves an email typed into To back onto the venue.
- **Mass messaging**: per-row checkboxes + "select all shown" + a sticky bulk bar
  ("N selected · Compose to selected →"). Bulk compose steps through the selected
  venues in pipeline order, personalizing each draft, with a progress bar,
  sent/skipped tallies, Skip, and a wrap-up summary toast. Venues without an email
  are flagged up front and can be filled in as you go.
- **Pipeline navigation**: live search (name/city/state/contact/email/type) and
  status filter chips with counts, plus a **⏰ Follow-up due** chip/badge for venues
  sitting in Contacted for ≥ `FOLLOWUP_DUE_DAYS` (7) days. Rows show touch count +
  last template used.
- **Smart template default** (`defaultTemplateFor`): prospect → Initial Outreach,
  contacted → Follow-Up, responded/call_scheduled → Let's Connect, booked → Booking
  Confirmed. The bookings-tab ✉ button now opens the same compose overlay with the
  booking's context (and no longer requires a saved email).
- **EPK completeness meter** in the EPK & Templates tab: 10-field checklist
  (tagline, pitch, bio, photo, video, genres, testimonials, email, phone, EPK/hub
  link) rendered as a progress bar with the missing fields named.
- Unfilled subject placeholders no longer leave dangling punctuation (trailing
  comma tidy in `fillTemplate`).

Verification: Babel compile clean (index.html + the three companion files);
`npm test` → 35/35; headless Playwright drive (vendored npm libs, seeded venues in
every pipeline state): 32/32 interaction checks — search/chip filtering, smart
default template, placeholder fill, template re-fill, single + bulk queue advance
with tallies, email save-back, prospect→contacted bump, touch log, EPK meter,
0 page errors.

## 9f. Change log — 2026-07 built-in Las Vegas venue directory

- **`VENUE_DIRECTORY`** (module scope, next to `BLANK_VENUE`): 49 curated live-music
  bars/restaurants/lounges/casino rooms across Las Vegas, Henderson, Boulder City,
  North Las Vegas, Goodsprings and Pahrump, grouped by `region`. Each entry carries
  booking `contactName`, direct `email`/`phone` where known, `website`, `addr`,
  the `styles`/formats the room actually books, and how it publishes schedules
  (`extra`). Entries sourced from user-supplied research are `verified: true`;
  supplemental entries are `verified: false` and get a "⚠ verify before outreach"
  prefix. `directoryEntryToVenue` maps an entry onto the venue schema (address +
  styles + booking route land in `notes`).
- **Directory browser** in the Venues tab ("📂 Vegas Directory" toolbar button): a
  region-grouped overlay with per-venue checkboxes (all-new preselected), contact
  preview, an `unverified` badge, "✓ in your list" markers for venues already in
  the pipeline (checkbox disabled), select-all-new/clear, and an "+ Add N venues"
  action that routes through `onBulkAddVenues` (which dedups by name, so re-adding
  is always safe).
- Added venues arrive as prospects with full contact info attached, so they flow
  straight into the compose/mass-messaging pipeline from §9e.

Verification: Babel compile clean; `npm test` → 35/35; headless drive extended to
44/44 checks — directory opens with 49 rows in 6+ regions, unverified flags render,
bulk add lands all entries in the pipeline with contacts intact, re-open shows
everything as added with the add button disabled, and a directory venue composes
with its booking email prefilled; 0 page errors.

## 9g. Change log — 2026-07 Gig Prospector (OpenStreetMap venue discovery)

- **Prospecting engine** (module scope, next to `VENUE_DIRECTORY`): queries the free
  Overpass API (no key, CORS-open; primary + kumi.systems mirror fallback) for every
  *named* bar/pub/restaurant/nightclub/cafe/casino around a point. `PROSPECT_AREAS`
  covers 8 Vegas-area centers (Central/Strip, Downtown, West/Summerlin, East, North LV,
  Henderson, Boulder City, Pahrump); radius 3/5/10 mi; `PROSPECT_KINDS` toggles the
  amenity classes. `buildOverpassQuery` / `overpassToProspects` / `prospectToVenue`
  are pure.
- **Solo/duo fit scoring** (`scoreProspect`, 0–10 with named signal chips): base by
  amenity, +4 `live_music=yes`, +2 `outdoor_seating` (patio/acoustic), +2 bar-room
  style name (saloon/tavern/lounge/taproom/winery/…), +1 dinner-crowd cuisine,
  +1 contactable (phone/website/email); anything with a `brand` tag (chains) is
  zeroed and flagged. Surfaces rooms that never advertise entertainment.
- **UI**: "🔎 Prospector" toolbar button in the Venues tab opens an overlay with
  area/radius/kind controls, a score-sorted result list (signal chips, address,
  phone/website, "✓ in your list" dedup markers, "Select top 25"), and an
  "+ Add N prospects" action through `onBulkAddVenues`. Adds land as prospects with
  find signals in `notes`, ready for the §9e compose/mass-messaging flow.
- Venue rows now display the phone number in the contact line (prospects are often
  phone-only).

Verification: Babel compile clean; `npm test` → 35/35; headless drive extended to
53/53 checks (Overpass mocked via route interception): search returns scored rows,
live-music venue ranks first, chains score 0 and are flagged, in-pipeline names are
disabled, selected prospects land with phone intact; 0 page errors. Live Overpass
calls can't run from the sandbox (proxy 403) but the endpoints are CORS-open in a
real browser.

## 9h. Change log — 2026-07 preloaded Zemba Music EPK profile

- **`EPK_SETTINGS_DEFAULT` now ships pitch-ready** with the Zemba Music brand
  profile: tagline, act type (Zemba Music umbrella — Solo / Duo / The Chris Zemba
  Band / Chris Zemba & The Late Shift Band), elevator pitch, ~200-word bio, location,
  target buyers, 2026–27 booking milestone, buyer-confidence bullets, members,
  genres, formats, show feel, stats grid, audience demographics, and tech-advance
  bullets. Media links, gallery, testimonials, rider links, booking email/phone,
  website/hub, and socials stay blank (the EPK completeness meter names them).
- **Loader backfill** (App mount): stored EPK settings are merged so that *empty*
  string fields pick up new/preloaded defaults while anything the user actually
  typed always wins; `templates` keep their own merge. Existing installs see the
  preload without losing edits.

Verification: Babel compile clean; `npm test` → 35/35; headless drive extended to
56/56 checks — a stored profile with an empty tagline + custom bio loads with the
tagline backfilled from defaults, the custom bio preserved, genres preloaded, and
the completeness meter at 40%; 0 page errors.

## 9i. Change log — 2026-07 data safety + outreach feedback loop + rebooking pass

- **Full-app backup/restore** (band bar): 💾 Backup downloads every `setlist_*`
  localStorage store as one JSON (`kind:'full-backup'`); ↩ Restore validates,
  confirms, replaces all stores, reloads. A toast nudges after 14 days without a
  backup (`setlist_last_backup_at`).
- **Outcome tracking**: `updateVenue` (App) logs every status transition into
  `contactLog` as `{kind:'status', status}`; compose sends log `{kind:'sent',
  template}`. Legacy entries without `kind` count as sent.
- **Outreach Performance dashboard** (Analytics tab): venues contacted, reply
  rate, avg touches-to-reply, and per-template reply-rate bars. A "reply" is a
  status move to responded/call_scheduled/booked, attributed to the last send on
  or before that date. Renders even with zero bookings.
- **Rebooking motion**: `isRebookDue` (completed booking + nothing upcoming) drives
  a green 🔁 Rebook filter chip + row badge, and `defaultTemplateFor` now returns
  the new `postGig` template (thanks + rebook + testimonial ask) for those venues.
- **Small fixes**: templates no longer claim an "attached" EPK (mailto can't
  attach); compose warns when a draft exceeds ~1800 encoded chars (mailto
  truncation risk — use Gmail/Copy); Prospector dedupes by phone digits as well as
  name; booking form warns on date clashes with other live bookings; the venue
  touch-log line expands into a full dated timeline (sends + status moves).

Verification: Babel compile clean; `npm test` → 35/35; headless drive → 65/65
(backup download event, rebook chip/badge + postGig default, timeline expand,
dashboard reply attribution "100% of 1" for the seeded reply, double-booking
warning); 0 page errors.

## 9j. Change log — 2026-07 Gmail API integration (sends + reply detection)

Implements §10 (connect → send → detect). Closes the outreach loop: real sends
through the user's own Gmail and automatic reply detection, so the pipeline
advances itself (contacted → responded) and the §9i dashboard measures ground
truth instead of honor-system status bumps.

- **Gmail module** (module scope, after `LS_KEYS`): GIS token client with the
  script injected **lazily** on first use (app untouched when unconnected —
  verified: no `gsi/client` tag and zero Gmail traffic while disconnected);
  scopes `gmail.send` + `gmail.readonly`; `{ clientId, connectedEmail }` in LS
  key `setlist_gmail_v3`; access token **memory-only** with silent refresh
  (`prompt: ''`). Pure, unit-tested helpers: `gmailB64Utf8` / `gmailBase64Url` /
  `gmailEncodeHeader` (RFC 2047) / `gmailBuildRfc2822` (text/plain, base64 body,
  76-char wrap) / `gmailThreadHasReply` / `gmailReplyCheckCandidates`. `GmailAPI`
  singleton: `connect` (consent + `/profile` → address), `send`
  (`POST /messages/send` `{ raw }`), `threadHasReply` (metadata-only thread GET),
  `disconnect` (revoke + clear). Plain `fetch` — no `gapi`.
- **Compose**: when connected, "✉ Send via Gmail" becomes the primary action
  (Email App demoted to fallback; mailto/Gmail-web/Copy/Mark-sent all retained
  verbatim). Success routes through `recordOutreach` with `{ via: 'gmail',
  threadId, messageId }` appended to the sent log entry (additive schema); the
  touch timeline marks these "via Gmail ✓". Failures toast and keep the draft.
- **Reply detection**: on venue-modal open, venues still `contacted` whose log
  has a sent `threadId` (and not checked within a 3 h cooldown —
  `lastReplyCheckAt`) are checked sequentially, ≤50 threads, via
  `threads/{id}?format=metadata&metadataHeaders=From`; a foreign `From` flips the
  venue to `responded` through `onUpdateVenue`, which auto-logs the `kind:'status'`
  event that feeds Outreach Performance. Silent token only — never pops consent.
- **Settings**: "📧 Gmail" block in EPK & Templates — Client ID input, Connect /
  Disconnect, and a 6-step bring-your-own-Client-ID walkthrough (Cloud project →
  enable Gmail API → consent screen + test user → Web client → JS origin —
  http(s) only, not file:// → paste ID).

Verification: Babel compile clean; `npm test` → 43/43 (8 new: base64url
round-trip/url-safety, RFC 2047, RFC 2822 shape + 76-char body wrap + emoji
round-trip, reply detection incl. display-name/case/malformed inputs, candidate
filter incl. cooldown); headless drive → 32/32 with `**/gmail/v1/**` fixtures
(GIS stubbed): send POST carries unpadded base64url `raw` decoding to a
well-formed message, threadId/messageId logged, prospect→contacted; fixture
thread with foreign From flips to Responded and lands in the dashboard ("1 venue
responded"); own-messages-only thread stays Contacted; cooldown suppresses
re-checks while a newly-sent thread is picked up; disconnected state leaves every
legacy compose path untouched; 0 page errors.

## 9k. Change log — 2026-07 contact enrichment + phone-first outreach

Closes the discovery→outreach gap: Prospector/OSM venues usually arrive
phone-only while the outreach engine is email-centric. Adds a "needs email" work
queue with assisted lookup, and a call path with logged outcomes so phone-only
rooms are first-class pipeline citizens.

- **Pure helpers** (module scope, after `BLANK_VENUE`; extracted + unit-tested):
  `venueNeedsEmail`, `googleEmailSearchUrl` (quoted-name + city/state + booking
  terms deep-link), `CALL_OUTCOMES` (interested/callback/voicemail/no_answer/pass,
  each with an implied pipeline `status` and a `touch` flag — a ring-out is not a
  touch), `applyCallOutcome` (logs `{kind:'call', outcome}`, stamps
  `lastContactDate` on touches, advances but **never regresses** status; booked
  rooms are immune to `pass`), `buildCallScript` (personalized from EPK + venue +
  the venue-tailored pitch; includes an email-capture branch and a 15-second
  voicemail version; safe fallbacks on empty input).
- **"📇 No email" work-queue chip** in the venue toolbar (live count, filters the
  list) + a per-row **"🔎 Find email"** button that expands an inline enrich panel:
  Website ↗ (https-normalized), "Google it ↗" (booking-email search), and a
  paste-and-save input (validated; saves via `onUpdateVenue`, Enter submits).
- **"📞 Call" row button** (any venue with a phone) opens a call overlay:
  tap-to-dial `tel:` link, copyable personalized script, mid-call email capture
  (same save-back), and one-tap outcome buttons driving `applyCallOutcome`
  through `onUpdateVenue` (so status transitions auto-log for the dashboard).
- **Touch timeline** renders `kind:'call'` entries ("📞 call — 📼 Left
  voicemail"); the row touch counter counts sends + call touches (not ring-outs).

Verification: Babel compile clean; `npm test` → 53/53 (10 new); headless drive →
18/18 (chip count/filtering, https-normalized website link, Google deep-link
content, junk-email rejection + save-back + live queue-count drop, phone-less
rows get no Call button, personalized script + tel: digits, voicemail →
contacted + touch + auto status event, interested → responded, no_answer
log-only, timeline entries, touch-count semantics); Gmail drive re-run → 32/32
(no regression); 0 page errors.

## 9l. Change log — 2026-07 outreach sequences ("Today's Outreach")

Turns the pipeline into a daily operating system. The passive follow-up chip
relied on the user noticing it; now every venue resolves to *today's next
action* and the whole day runs in one pass.

- **Sequence brain** (module scope, after `buildCallScript`; pure, extracted,
  unit-tested): `nextActionFor(venue, {today, rebookDue})` →
  `{action, template}` or null. Routing: prospect → first outreach (email) /
  call (phone-only) / find_email (neither); contacted → follow-up when
  `SEQUENCE_STEP_DAYS` (=`FOLLOWUP_DUE_DAYS`) have passed, `exhausted` after
  `MAX_SEQUENCE_SENDS` (4) sends with no reply, falling back to call/find_email
  if the address is missing; rebook-due rooms outrank everything but only
  re-queue once per step interval. **Halts on reply**: responded /
  call_scheduled / booked / pass all return null — so §9j's automatic reply
  detection silences a sequence the moment the buyer answers. `snoozedUntil`
  (stamped via `addDaysISO`) hides a venue until the date passes.
  `sendsToday` counts today's sends across the pipeline (calls excluded) for
  the `DAILY_OUTREACH_CAP` (25/day — Gmail deliverability + focus).
- **"📆 Today" toolbar button** (live due-count badge) opens the queue overlay:
  cap meter (sent today / 25), groups for ✉ Ready to send (warmest-first:
  rebook → follow-ups → fresh, each row naming its auto template), 📞 Calls to
  make (opens the §9k call overlay), 🔎 Needs a contact (jumps to the §9k
  enrich panel), and ⛔ Sequence complete (suggests the call path). Every row
  snoozes 7 days with one tap.
- **"▶ Start send run (N)"** — capped to the day's remaining sends — feeds the
  existing bulk-compose queue in **auto-template mode** (new: `openCompose`
  with no explicit template marks the run `auto`, and `composeAdvance`
  re-resolves `defaultTemplateFor` per venue), so one pass sends a rebook ask,
  follow-ups, and first outreaches each with the right template.

Verification: Babel compile clean; `npm test` → 62/62 (9 new sequence tests:
prospect routing, step-interval due dates, exhaustion, halt-on-reply, snooze
expiry, rebook precedence + once-per-interval, sendsToday semantics, calendar
math); headless drive → 17/17 (badge count, group composition + warmest-first
ordering + per-row template labels, waiting/snoozed/responded exclusion, live
snooze drop + persisted `snoozedUntil`, a 3-venue send run stepping Post-Gig →
Follow-Up → Initial Outreach automatically, wrap-up tally, cap meter 3/25,
queue re-resolution); Gmail 32/32 + enrichment 18/18 re-runs green; 0 page
errors.

## 9m. Change log — 2026-07 EPK publish flow + per-venue tagged links

The templates referenced `[EPK Link]` but the app never helped the user get one,
and a bare link says nothing about who clicked. Closes both gaps without a
backend.

- **Per-venue link tagging** (module scope, before the sequence engine; pure,
  extracted, unit-tested): `epkVenueSlug` (url-safe, capped, `'venue'`
  fallback) + `epkLinkForVenue(epkUrl, venue)` appends `?ref=<slug>` (`&ref=`
  when a query exists; empty url → ''). `fillTemplate`'s `{{epk_link}}` now
  resolves through it, so **every outgoing pitch carries a venue-tagged EPK
  link** — any host with analytics (Netlify, GitHub Pages + counter) shows
  *which buyer clicked*: the first engagement signal, no backend required.
- **Publish block** in EPK & Templates (under the export buttons,
  `data-testid="epk-publish"`): unhosted → a 3-step walkthrough (⬇ .html →
  rename `index.html` → drag onto app.netlify.com/drop or GitHub Pages → paste
  the URL into EPK URL (hosted)); hosted → "EPK is live" with the URL, 📋 Copy,
  Open ↗, and a note that emails are ref-tagged per venue.

Verification: Babel compile clean; `npm test` → 65/65 (3 new: slug
sanitization/cap/fallback, `?ref`/`&ref` composition, empty-url + no-venue
edges); headless drive → 9/9 (hosted: link tools + tagging note render, compose
body carries `…/epk?ref=test-tavern`, no placeholder warning; unhosted: 3-step
walkthrough renders, body keeps `[EPK Link]`, composer warns); full regression
re-run → sequences 17/17, Gmail 32/32, enrichment 18/18; 0 page errors.

## 9n. Change log — 2026-07 feedback-driven scoring (the learning loop)

Completes the 2026-07 outreach roadmap (§9j → §9m). The Prospector's fit
heuristics were static guesses; the contact log is ground truth. Every send,
call, and detected reply now recalibrates targeting.

- **Outcome engine** (module scope, before the EPK helpers; pure, extracted,
  unit-tested): `venueOutcome` distills one venue's log into
  attempted/replied/type/template-attribution (replied = a logged status move
  into responded/call_scheduled/booked — or currently sitting there, for
  legacy manual bumps; the reply is attributed to the last send on/before the
  move, §9i's rule; a `no_answer` ring-out is not an attempt).
  `collectOutreachStats` aggregates by room `type` and by template.
  `smoothedRate` (Laplace) + `MIN_LEARN_SAMPLE` (3) + a 0.6–1.4 clamp in
  `typeScoreMultiplier` keep small samples honest — everything stays neutral
  (×1) until a category has real data. `bestStatInsight` picks the top
  performer in any stats map, min-sample gated.
- **Prospector re-ranking**: search results multiply their heuristic score by
  the learned type multiplier (chains stay zeroed; 0–10 preserved, one
  decimal), re-sort, and carry a `📈/📉 <type>s reply above/below your average
  (×N)` signal chip. A header note (`data-testid="learned-note"`) lists the
  active multipliers. Under-sampled pipelines see identical-to-before
  behavior.
- **"🎯 What's working" panel** (Analytics, `data-testid="whats-working"`):
  best room type and best template by smoothed reply rate with sample counts,
  plus a pointer that the Prospector now weights discoveries by these rates.
  Renders as soon as either insight clears the sample gate — with or without
  bookings.

Verification: Babel compile clean; `npm test` → 72/72 (7 new: outcome
extraction incl. ring-out/legacy-status/attribution-order, aggregation,
smoothing, multiplier gate + clamps + unseen-type neutrality, insight picker
incl. under-sample null); headless drive → 11/11 (Overpass intercepted: hot
bars + cold restaurants → What's-working shows Bar 80% + Tailored Pitch 100%,
Prospector note lists ×1.4/×0.6, a lower-heuristic bar outranks a
higher-heuristic restaurant at 4.2 vs 2.4 with 📈/📉 chips; under-sampled
pipeline → no panel, no note, heuristic order preserved); full regression →
Gmail 32/32, enrichment 18/18, sequences 17/17, EPK 9/9; 0 page errors.

## 9o. Change log — 2026-07 EPK tracking links: per-venue act + token

The EPK (`quantumq1981/chriszemba-EPK`) is now genuinely live at GitHub Pages, and
`?ref=<slug>` only identified *who* clicked — not which act was pitched or which
outreach run sent it. This pass makes the live URL the default target and layers a
richer, per-venue tag on top.

- **`EPK_LIVE_URL`** (module scope, before `EPK_SETTINGS_DEFAULT`/`BLANK_VENUE`,
  which both consume it) = `https://quantumq1981.github.io/chriszemba-EPK/`. It is
  now `EPK_SETTINGS_DEFAULT.epkUrl`'s default, so the existing empty-field backfill
  (§9h) fills it in for both fresh installs and existing ones that never set a
  custom EPK URL — the "EPK is live" state (§9m) now shows out of the box.
- **Venue schema**: `BLANK_VENUE` gains `preferredFormat` (`'solo'|'duo'|'trio'|
  'band'|'late_shift'`, `VENUE_FORMATS`/`VENUE_FORMAT_LABELS`) and `trackingToken`
  (short base36 string from `genTrackingToken()`). Every venue-creating path stamps
  a token exactly once: `addVenue`, `bulkAddVenues` (covers CSV import, the Vegas
  Directory, and the Gig Prospector, which all funnel through it), and a one-time
  load-time backfill for venues that predate this field. Tokens are never
  regenerated afterward, so a venue's link stays stable across every touch.
  "Preferred Act / Format" is a new dropdown in the Add/Edit Venue form.
- **`epkLinkForVenue` extended** (not replaced): a venue with a `trackingToken` now
  gets `?act=<format>&track=<token>` (format falls back to `band` if unset/invalid);
  a venue with no token (pre-PR-128 data, absent from a hand-built test fixture)
  keeps the original `?ref=<slug>`. Since `fillTemplate`'s `{{epk_link}}` already
  calls `epkLinkForVenue`, every template — outreach, follow-up, tailored pitch,
  post-gig, Gmail sends — picks up the new tag with no call-site changes.
- **"🔗 Preview link" toggle** on each venue row (`VenueModal`, next to Compose/
  Call/Find email): expands an inline panel showing the format label, the raw
  token, the full tagged URL, and a Copy button — so the exact link a venue's
  emails will carry is visible before hitting send. The EPK & Templates publish
  block's copy was updated to describe the new tag shape.

Verification: Babel compile clean; `npm test` → 77/77 (5 new: token shape/
variance, `?act=&track=` composition incl. existing-query `&`, default-to-band
on blank/invalid format, legacy `?ref=` fallback with no token, URL-encoding);
headless drive (vendored libs): added a venue with format "Late Shift Band",
🔗 Preview link showed `…chriszemba-EPK/?act=late_shift&track=<token>`; a second
drive confirmed the Compose Email draft for a "Trio" venue ends with
`…chriszemba-EPK/?act=trio&track=<token>`; EPK & Templates tab shows "EPK is
live" against the real URL with no user action; 0 page errors.

## 9p. Change log — 2026-08 audit remediation (v3.8.0 audit spec)

Applied the four direct-edit fixes from the v3.8.0 code audit. Structural
tasks (TASK-2/6/7) are **deferred** with rationale below. One commit per task,
each referencing its task ID.

**Completed (direct edits):**

- **TASK-1 🔴 Band-switch persistence race.** The four per-band SAVE effects
  (songs/settings/venues/bookings) depended on `[dataSlice, activeBandId]`. On a
  band switch the transition render still held the outgoing band's data while
  `activeBandId` already pointed at the incoming band, so the effect wrote
  `LS.set(bandSongs(B), A_songs)` — self-healing in the common single-switch case
  but corrupting under rapid/interrupted switches or a mid-write quota throw. Fix:
  depend on the **data slice only** (`[songs]`, `[settings]`, `[venues]`,
  `[bookings]`); the transition render doesn't change the slice so the stale write
  never fires, and the LOAD effect assigns fresh arrays so the reconciling render
  re-runs each effect with the correct band. `activeBandId` read from the
  reconciled closure keeps the key correct. Grep confirmed no other
  `LS.set(LS_KEYS.band*(activeBandId))` effects need the treatment — the debounced
  snapshot autosave (`[songs,setlists,settings,locked,activeBandId]`) legitimately
  depends on the data slices and is cleanup-protected, and the direct-`LS.set`
  handlers (imports/gigs/roster/watermark) are out of scope per the spec.
- **TASK-4 🟡 Non-functional setState.** Converted addSong/updateSong/deleteSong/
  shelfSong/restoreSong and both band-creation sites (createBand, duplicateBand) to
  functional updaters so React 18 batching can't drop a coalesced write. All 7 sites.
- **TASK-5 🟡 EPK metaLine escaping.** `buildEPKHtml`'s `metaLine` now `.map(esc)`
  before joining location/actType/targetAudience, closing the one unescaped
  user-field path into the EPK header.
- **TASK-3 🟠 Reliability & mobile phases.** Flipped
  `FEATURE_FLAGS.phase1ReliabilityDataSafety` and `phase2MobileCompatibility` to
  `true` (after TASK-1 landed as the recovery net). Activates snapshot autosave,
  storage-health monitoring, backup-before-risky-action, and the app's own
  touch-drag fallback on the iPad target.

**Deferred (structural — recorded per audit guidance, code left unchanged):**

- **TASK-2 🔴 Babel Standalone at runtime.** Requires a build step and would change
  the project's core single-file / no-build distribution model (CLAUDE.md §1),
  which the audit forbids doing silently. Not undertaken this pass. Recommendation
  stands: pre-compile the inline `text/babel` block + the three companion files to
  one ES2018 bundle (esbuild), then inline the compiled output to preserve the
  single-file distribution, dropping the `@babel/standalone` CDN tag and all
  `type="text/babel"` scripts. Should be scoped as its own PR with a
  time-to-interactive before/after measurement.
- **TASK-6 🟡 Web Worker generation.** Large structural migration of the generator
  engine into a worker with `isGenerating`/spinner/Cancel and a fallback path;
  needs an output-parity harness (seeded randomness). Deferred to a dedicated PR.
- **TASK-7 🟢 SA delta evaluation.** The audit explicitly gates this on TASK-6 (or
  an equivalent parity harness) since SA is stochastic and easy to silently
  regress. Deferred with TASK-6.

Verification: per-task commits; Babel compile clean (index.html + 3 companion
files); `npm test` → 79/79; headless Playwright boot under an iPad user-agent
with both flags on → app mounted (`.app-container` present), 0 JS page errors
(only benign Babel size note + proxy-blocked font/manifest/worker 404s in the
sandbox). Live-iPad touch-drag and the phase1 recovery flows should still be
smoke-tested on a real device before release, per the audit's acceptance
criteria (the sandbox can't drive real touch input).

## 9q. Change log — 2026-08 arrangement-footnote PDF round-trip

Fixes the reported bug where **arrangement footnotes / rehearsal marks vanished on
PDF re-import**. The Advance export writes an "ARRANGEMENT NOTES" section, but the
BandHelper importer `break`s at "SETLIST SUMMARY", discarding the whole page — so
every re-imported song came back with `arrangement: ''`. Two failure modes are now
closed: notes are recovered on re-import, and notes containing musical symbols no
longer render as garbage in the export in the first place.

New module-scope pure helpers (after the BandHelper parser; all extracted +
unit-tested via `test/extract-algorithm.js`):
- **`pdfSafeText`** — transliterates characters jsPDF's WinAnsi fonts can't encode
  (♭→b, ♯→#, en/em dash→-, curly quotes, ellipsis, unicode spaces) and drops any
  remaining non-Latin-1. Without it, a note like "A♭7 … F♯m7" exported as
  per-character mojibake (the reported garbling). Applied to the footnote title +
  note text on export.
- **`pdfParseArrangementNotes(pages)`** (+ `pdfParseArrangementNotesVisible`,
  `matchArrRoleLabel`) — parses the visible ARRANGEMENT NOTES section straight from
  the export's own geometry (footnote number at x≈margin; TITLE + "(Set N)" on the
  baseline; each role `<LABEL>@margin+14  <note>@margin+86`; wrapped lines continue
  at margin+86). Indent, not casing, separates a role header from a continuation, so
  a note wrapping onto "Keys …" is never misread as a KEYS role.
- **Embedded lossless block** (`pdfEncodeArrangementData` / `pdfDecodeArrangementData`
  / `arrB64Decode`, markers `[[SLARR:i:n:<b64>]]`) — newer Advance exports also embed
  the exact arrangement objects as base64 (drawn tiny + white), so a round-trip is
  lossless even for characters the visible notes transliterate. `pdfParseArrangementNotes`
  prefers this block over the visible text; matched to songs by set/song index.
- **`arrNoteMatchesTitle`** / `arrTitleKey` / `arrApplyNoteToArrangement` — reattach a
  footnote to its song, tolerant of the superscript the table glues onto the title
  (after it in the column layout, before it in the stacked layout — only the
  footnote's own number is stripped, so a real leading/trailing number survives).
  Merge is per-role: imported roles win, untouched roles preserved.

Wiring:
- **`importBandHelperSetlist`** now recovers notes and re-attaches them (title match
  first, embedded index as a backstop) instead of hardcoding `arrangement: ''`; the
  toast reports "N arrangement notes restored".
- **New "📋 Import Arrangement Notes → Library"** in the Gig Profiles modal
  (`applyArrangementNotesFromPDF` → `onApplyArrangementNotes`): upload an app-generated
  Advance PDF (or its notes page) and every footnote is matched to a library song by
  title and its rehearsal marks restored — no manual re-entry after an export.
- **Export** embeds the data block after the visible notes and sanitizes note text
  through `pdfSafeText`.

Verification: Babel compile clean; `npm test` → 93/93 (14 new: sanitize map,
embedded encode/decode incl. multi-chunk + out-of-order + corrupt, visible-geometry
parse incl. 2-word ENDING CUE label + the "Keys" continuation trap, embedded-over-
visible precedence, superscript-tolerant title matching both ends, per-role merge).
Real jsPDF→pdf.js round-trip (rendered, not synthetic): embedded path lossless with
♭/♯ intact and index-matched; visible fallback parses the geometry and reads back the
sanitized ASCII. Parsed the user's two actual exports → 9 and 13 notes recovered with
correct titles/sets/roles. Headless Playwright drive (vendored npm libs): app mounts,
0 page errors; the notes PDF applied to a seeded library updated 4 songs (merge
preserved a pre-existing bass note, non-matching song untouched, correct toast); the
full setlist PDF re-imported as a gig with 7 arrangement notes restored (the 2 misses
are songs the pre-existing stacked table parser drops, not a footnote regression).

---

## 9r. Change log — 2026-09 PDF export decoupling

- **Two documents, two pipelines.** The 350-line `exportPDF` closure was replaced by a
  thin dispatcher over module-scope `buildStageSetlistModel` / `generateStageSetlistPDF`
  and `buildArrangementGuideModel` / `generateArrangementGuidePDF`. The stage sheet lost
  the ARRANGEMENT NOTES section and the footnote superscripts (now a `*` marker); its
  summary page keeps the quality scores and points at the guide.
- **`sanitizeNotation`** — repairs the byte-pair and per-glyph mojibake in the reference
  PDFs and normalises real Unicode notation; applied to every string in both documents.
- **Sectioned schema** — `intro_cue` / `form_harmony` / `transition_outro` /
  `general_notes` added alongside the roles, with a classifier that back-fills them for
  every existing library and a shared editor component in both song forms.
- **`arrRowText`** — geometry-aware row joining, so re-importing an old damaged export
  recovers words rather than letter-spaced characters.
- **UI** — three export buttons in the Setlist view, a document radio group + Venue/Event
  field in the PDF settings modal.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 132/132
(32 new); real jsPDF → pdf.js round-trip driven by the verbatim corrupted notes from both
reference PDFs → 41/41 (mojibake gone, `I-IV-V` / `#V9` / `(I -VI7- II7-V7)` restored,
stage sheet provably free of prose, guide re-parses via both the embedded block and the
visible grid); both reference PDFs re-parsed → 13/13 notes each, all rendering clean;
headless Playwright drive → 19/19 (structured fields present, three export buttons, each
producing the right file, package producing both, settings modal honouring the choice),
0 page errors.

## 9s. Change log — 2026-09 import dedup carries arrangement notes onto the existing song

A duplicate song name has always been flagged and not re-added, but its rehearsal notes
were lost with the row. Both import doors now fold a duplicate's arrangement notes onto
the copy already in the library, **filling only empty fields** so a hand-curated note is
never overwritten (the conflict policy the user chose).

- **`mergeArrangementFillEmpty(existing, incoming)`** (new pure helper next to
  `arrApplyNoteToArrangement`): per-field union over `ARR_FIELDS` (the six roles + the
  four sections); keeps the existing field when it already has content, else takes the
  incoming one. Returns `{ arrangement, filled }`; `filled` counts populated fields and
  is 0-safe (the original string is returned byte-identical, so legacy libraries never
  churn). Storage stays raw — sanitize/repair still happens at render via
  `deriveArrangementSections`, so a mojibake note imported onto a duplicate reads back
  clean in the guide.
- **`importCanonicalRows` (Import + Normalize, CSV **and** PDF)**: the arrangement merge
  went from "only if the existing song had no notes, wholesale replace" to the per-field
  fill-empty union. Fixed a batch bug in the same pass — merges were applied with
  `setSongs([...songs])` per row from a stale closure, so with two duplicates in one
  import only the last survived; all merges now accumulate in a `Map` keyed by song id
  and commit in one functional `setSongs`. The toast flags "N notes merged into existing
  songs".
- **`importCSVRobust` (Quick Import, multi-file CSV/PDF)**: previously dropped a duplicate
  row outright. Now fill-empty-merges its notes onto the batch entry it duplicates (an
  earlier file in the same drop) or the library song, via the same helper and a functional
  commit; same toast flag.

Verification: `npm test` → 138/138 (6 new: fill-empty, conflict-keeps-existing, all
sections+roles eligible, raw-storage-renders-clean, no-op byte-identity, idempotent
re-import); Babel compile clean; headless Playwright drive of the real Quick Import door
→ 7/7 (seed a curated song, upload a CSV duplicating it with extra + conflicting notes
plus a new song: duplicate not re-added, new song added, curated drums note preserved,
empty harmony/keys fields filled, the conflicting import note never lands), 0 page errors.

---

## 9t. Change log — 2026-09 rebrand to BandLeaderHQ + public shell (PR 1 of a phased effort)

First phase of renaming the app from "Setlist Generator Pro" to **BandLeaderHQ** and
making it a legitimate public web page. Display-only rename + hosting shell; no logic
or algorithm change. The visual design system, IA/navigation refresh, and genericizing
the Zemba-specific seed data are deliberately later phases (see the plan / §2 note).

- **Rename — display strings only.** `<title>` (now a public brand title, not a
  changelog string), the on-screen `<h1>` ("BandLeaderHQ") + subtitle tagline, the
  backup-validation toast, the backup payload's informational `app` field,
  `manifest.webmanifest` `name`/`short_name`, `sw.js` `CACHE_NAME`, and `package.json`
  `name`/`version` (→ **4.0.0**)/description. **`localStorage` key strings were left
  untouched** — they are the on-disk contract with existing users' data; the backup
  `kind` stays `'full-backup'` so old backups still restore. (See the localStorage-key
  rule in `.claude/skills/design-conventions/SKILL.md`.)
- **Killed the 17 MB background.** `.ide-background` no longer loads
  `assets/zemba-logo-bg.png` (17.4 MB, and Zemba-branded); it is now a zero-byte CSS
  gradient (warm orange + cool blue glows on near-black — a first hint of the new
  palette). The PNG/WebP were deleted (~18 MB out of the repo).
- **Real icon set + brand assets.** New `assets/icon.svg` (scalable favicon),
  `assets/icon-square.svg` (full-bleed raster source), `assets/icon-512.png`
  (PWA + Apple touch icon), and `assets/og-image.png` (1200×630 social card). Manifest
  icons repointed off the giant PNG; head gained the favicon/apple-touch links.
  Rasters are rendered with headless Chromium (no ImageMagick/rsvg in the sandbox;
  SVG intrinsic sizing is unreliable below ~512px, so smaller PNGs are downscaled from
  the 512 raster — see `assets/README.md`).
- **Public `<head>`.** Added meta description, Open Graph, Twitter card, and canonical.
  `theme-color` reconciled to `#0b0b0f` across the head meta and the manifest
  (`theme_color`/`background_color`), which also gained a `description`/`categories`.
  Absolute social URLs are anchored to the interim GitHub Pages base with a comment
  marking every spot to swap once the custom domain is live.
- **Hosting shell.** Added `404.html` (branded redirect to root) and `DEPLOY.md`
  (branch-based Pages today → custom domain DNS/CNAME/HTTPS + URL-swap steps). No
  Actions workflow — the app has no build step, so Pages serves the repo as-is.
- **Not touched (verified, not blindly "fixed"):** `test/epk-links.test.js` uses a
  github.io URL only as a pure-function *input fixture*, not an app-state assertion, so
  it needs no change; §9o's EPK URL is historical changelog text and the live EPK URL
  (Zemba's domain) is genericized in a later phase, not here.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 138/138
(no logic touched); headless Playwright boot → app mounted, 0 JS page errors; icon +
OG assets visually verified.

---

## 9u. Change log — 2026-09 BandLeaderHQ visual design system (PR 2)

Reskin only — no logic, no algorithm, no schema change; behavior identical. Applies the
owner-approved "command center" direction (blue leads, orange fires) across all three
theming surfaces (CLAUDE.md §2 / the `design-conventions` skill), driven off a sign-off
mockup canvas.

- **Token flip in the app `:root`.** `--accent` changed from orange to **blue (`#3d7bff`)**
  so every structural/primary usage it already drove — primary buttons, focus rings,
  active toggles, panel titles, the header bar, venue/booking/stage-current highlights,
  drop zones, drag handles — became blue in one edit. A new **`--energy` (orange
  `#ff6b35`, the logo's accent) is reserved** for the one Generate CTA per view and the
  energy visualisation only, so orange never competes with itself. Added
  `--accent-soft`/`--accent-glow`/`--energy-glow` tints; surfaces cooled to a navy-black
  base (`--primary`/`--secondary`/body/`.ide-background`); text/border cooled.
- **The few genuinely-energy spots repointed to `--energy`:** the Generate button (new
  `.btn-cta` modifier, orange gradient over the blue `.btn-primary`), the energy-preview
  "actual" line + legend, and the "ending" macro category. Semantic oranges left as-is
  (ambient backdrop glow, pool-exhaustion warning, playlist "Hits" category). Header
  accent bar is now a blue→orange brand gradient; the on-screen wordmark uses a cool
  blue-tinted gradient.
- **EPK export CSS** (`buildEPKHtml`): two-tone `--accent`/`--gold` moved from red/gold to
  **blue/orange**, base cooled — the EPK now matches the app brand.
- **PDF `PDF_PALETTE`**: `ACCENT` moved from slate to a **print-deepened brand blue**
  `[40,78,150]`; `SECTION` blue; `ROLE` a warm energy tone `[176,82,40]`. Print discipline
  kept (no heavy fills).

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 138/138
(reskin touched no logic); headless Playwright render of the app → mounts, blue-primary
chrome with orange reserved, 0 JS page errors; screenshot compared against the approved
mockup. EPK/PDF changes are isolated color values validated by the compile + suite.

---

## 9v. Change log — 2026-09 BandLeaderHQ top-level navigation + onboarding (PR 3a)

First IA pass. The app had **no top-level navigation** — every destination was a modal off
the band bar, and Analytics, the EPK builder and Bookings were buried three layers deep
inside `VenueModal` (reachable only via band bar → Venues → an internal tab). A new user
never found them. PR 3a makes them discoverable **without** re-architecting the venue
subsystem (a hard refactor — `renderAnalyticsTab`/`renderSettingsTab` close over ~25 of
`VenueModal`'s local `useState` hooks). Mockup-gated and owner-approved before code.

- **Persistent top-level nav** (`.topnav`, inserted between the band bar and the workspace):
  **Setlists** (the Library+Config+setlist workspace = home, always the active pill) ·
  **Venues** · **Bookings** (with a live count badge) · **Analytics** · **Press Kit**, plus a
  right-hand utility cluster (Gig Profiles, Roster). The band bar was slimmed to band identity
  + Manage Bands + Backup/Restore + the band switcher; the scattered nav-ish buttons moved
  into the nav.
- **Deep-linking into the venue mega-modal.** `VenueModal` gained an `initialTab` prop; App
  holds `venueInitialTab` + an `openVenue(tab)` helper. Because the modal stays mounted and
  returns null while closed (so `vTab` persists), a `React.useEffect([open, initialTab])`
  seeds the tab on open. Venues/Bookings/Analytics/Press Kit nav items and the next-gig banner
  now land directly on their tab — one click from anywhere.
- **First-run onboarding.** When `songs.length === 0`, a welcome card (`.onboard`, the "B"
  monogram tile) renders above the workspace with three real actions: **Import a CSV**
  (`setImportModal`), **Get a sample CSV** (`downloadSampleCSV`), **Add songs by hand**
  (scrolls to the library). It disappears once a song exists. Reuses the PR-2 component
  vocabulary; no new tokens.
- **Deferred to PR 3b** (kept out to hold regression risk down): flattening `VenueModal`'s
  3-deep overlay path + folding its 7-button toolbar into a "Find rooms ▾" menu; splitting the
  `SetConfiguration` wall; and extending the `InfoTrigger`/`featureHelp` help system to the
  venue/EPK area. The "Load demo band" onboarding path waits on PR 4's demo data.

Verification: `npm test` → 138/138 (no algorithm logic touched); Babel compile clean; headless
Playwright drive → nav renders all five destinations, an empty library shows the onboarding
card, clicking **Analytics** deep-links straight to the venue modal's Analytics tab, 0 JS page
errors; screenshots compared against the approved mockup.

---

## 9w. Change log — 2026-09 Reference Clips fixed + segment support (PR 5a)

First slice of the "airtight gig prep" goal — the Advance/rehearsal view should carry the
audio a note refers to so a sub can play cold. The per-song **Reference Clips (YouTube)**
feature existed but its **"+ Add" failed silently**: `getYTVideoId` matched only `youtu.be/`,
`?v=`, `/embed/`, and the add handlers did `if (!getYTVideoId(url)) return;` — so a YouTube
**playlist** URL (the common paste), a `/clip/` URL, or a `/shorts/` link vanished with no
feedback.

- **Parser broadened** (`getYTVideoId`): now also accepts `/shorts/<id>`, `/live/<id>`, and
  `youtu.be/<id>?…`; a `watch?v=<id>&list=…` link resolves to the video (not the playlist).
- **No more silent failure** (`ytUrlIssue`, new): both add handlers replace the bare `return`
  with a plain-language inline error (`.media-clip-err`) — a playlist link says "open the
  individual video and paste its URL", a clip link says "paste the full video URL, then set a
  start/end time", etc.
- **True segment clips:** clip objects gain an **end** time (`te`, MM:SS) beside the existing
  start (`ts`); `getYTEmbedUrl(url, ts, te)` now emits `?start=X&end=Y` so a player watches
  exactly the illustrating segment. New "End MM:SS" input in both add forms; the row shows the
  `start–end` range. `tsToSeconds` hardened for bare seconds / numbers.
- **Convenience** (`ytStartFromUrl`, new): a `?t=` / `&t=1m30s` / `?start=` in the pasted URL
  auto-fills the start field.
- Clip metadata is small text stored in `song.mediaLinks` (localStorage) — no storage concern.
  Embedded **document attachments** (PDF lead sheets / drum charts) are PR 5b, using IndexedDB
  for offline blobs (owner chose embed-offline).

Verification: `npm test` → 144/144 (6 new pure-function tests: parser accepts/rejects, issue
messages, `tsToSeconds`, start-from-URL, start-only vs start→end embeds); Babel compile clean;
headless drive — a playlist URL shows the inline error and adds nothing, a valid video with a
1:30–2:00 segment adds and displays the range, error clears on the next valid add, 0 JS page
errors.

---

## 9x. Change log — 2026-09 offline document attachments (PR 5b)

Second half of "airtight gig prep": a player can now open the **charts** a note refers to
(PDF lead sheets, drum-chart images) from the Advance/rehearsal view, **offline**. Owner chose
embed-offline, so the app gains its **first IndexedDB** store — `localStorage` (~5 MB, and it
holds the whole library) is the wrong place for PDFs/scans.

- **Storage layer** (module scope, after the reference-clip helpers): IndexedDB `bandleaderhq`,
  object store `attachments` keyed by attachment id; `attStore` = `put/get/del/clear/keys/all`.
  Pure `bytesToB64`/`b64ToBytes`/`blobToB64`/`b64ToBlob`/`fmtBytes` for the backup path (the b64
  pair is unit-tested — byte-exact incl. binary + chunked large payloads).
- **Song schema** gains `attachments: [{id, name, mime, size, kind}]` — **metadata only** in the
  song (persists through the existing `addSong`/`updateSong` spread); the **bytes live in IDB**
  keyed by `id`. `form`/`editForm` init + reset carry `attachments: []`.
- **`SongAttachments`** shared editor in both song forms (file input `application/pdf,image/*`,
  per-file kind selector + size + remove, a 15 MB/file guard, a live `navigator.storage.estimate()`
  meter). **`AttachmentRow`** on the Advance view lazily pulls the blob from IDB on click and
  opens it (revokes the object URL on unmount). Both mirror the Reference-Clips row styling.
- **Backup/restore made async** (`exportBackup`/`importBackup`): export base64s every IDB blob
  into `payload.attachments = {id:{name,mime,b64}}`; import clears IDB then writes each blob back
  **before** reload. Old backups (no `attachments` key) restore exactly as before —
  `kind:'full-backup'` unchanged, fully backward-compatible. `deleteSong` frees a song's blobs.
- **Deferred:** listing attachments in the Arrangement Guide PDF (kept off the heavily-tested PDF
  pipeline this pass) and a global orphan sweep (band-delete / abandoned add-form leaks are
  space-only, not correctness).

Verification: `npm test` → 149/149 (5 new: b64<->bytes/blob round-trips incl. binary, chunked
200 KB payload, mime default, `fmtBytes`); Babel compile clean; headless Playwright drive —
attach a PDF → song saved with attachment metadata → **reload: metadata + the IDB blob both
persist** (added 1 / after-reload 1 / idb-blob 1) → Backup carries the base64; 0 JS page errors.
The restore leg reuses the unit-tested `b64ToBlob` + the same `attStore.put` proven on attach.

---

## 9y. Change log — 2026-09 venue toolbar "Find rooms ▾" consolidation (PR 3b)

The venue subsystem is the highest-regression-risk area, so PR 3b delivers only the one
contained, high-visibility IA win the approved nav mockup already promised: the overloaded
7-item `.venue-toolbar` is folded so the four *discovery/import* actions no longer crowd the
daily workflow.

- **Toolbar now four top-level controls:** Search, **🔎 Find rooms ▾**, 📆 Today, + Add Venue.
  Search and the daily action stay one click; adding a venue by hand stays primary.
- **"🔎 Find rooms ▾"** is a native `<details className="findrooms-menu">` + `<summary>` (no new
  React state or click-outside machinery — the lowest-risk implementation). Its `.findrooms-menu-list`
  holds the four moved actions as labelled rows (icon + title + one-line description): **Vegas
  Directory** (`openDirectory`), **Prospector** (`openProspector`), **Import CSV**
  (`venueCsvRef.click`), **Sample CSV** (`downloadSampleVenueCSV`). Each item runs its **existing
  handler unchanged** and closes the menu (`e.currentTarget.closest('details').open = false`).
- New CSS `.findrooms-menu` / `.findrooms-menu-list` next to `.venue-toolbar` (index.html L681),
  built entirely on the PR-2 design tokens (`--secondary` surface, `--border`, `--accent` summary,
  `--accent-soft` open state); absolutely positioned dropdown, `::-webkit-details-marker` hidden.
- **No behavior change** — the directory, prospector, and both CSV paths are byte-identical; only
  their entry point moved. `data-testid="find-rooms"` added for the drive; `today-btn` preserved.

Deferred (explicitly out of PR-3b scope, higher risk): flattening the Today→Compose overlay
stack, splitting the `SetConfiguration` wall, and extending the `InfoTrigger`/`featureHelp` help
system into the venue/EPK area.

Verification: `npm test` → 149/149 (no logic touched — pure UI markup/CSS); Babel compile clean
(index.html + 3 companion files); headless Playwright drive — the venue toolbar shows Search +
Find rooms ▾ + Today + Add Venue with **0** discovery buttons left inline, the menu is closed by
default, opens to exactly 4 items, clicking Vegas Directory opens the directory overlay and closes
the menu; 0 JS page errors.

---

## 9z. Change log — 2026-09 genericize the Zemba seed data + opt-in demo band (PR 4)

Productization pass: a stranger's fresh install is now identity-neutral, while the owner's
real Chris Zemba / Zemba Music profile is preserved verbatim as an opt-in demo. This is the
last phase of the BandLeaderHQ public roadmap. **No `localStorage` key changed** and the
owner's already-saved data is untouched (it lives in `setlist_epk_settings_v3`, not in the
defaults; genericizing the defaults only changes what a *never-saved* field falls back to).

- **Neutral defaults.** `EPK_SETTINGS_DEFAULT` is now all-blank (every branding/bio/contact
  field `''`), and `EMAIL_TEMPLATES_DEFAULT` was rewritten identity-neutral — the six
  templates drive off `{{band_name}}` (the active band) + a **new `{{location}}` token**
  (added to `fillTemplate`'s repl map, sourced from `epkSettings.location`) instead of the
  hardcoded "Chris Zemba" / "Las Vegas, NV" signatures. A signature `{{location}}` line that
  resolves empty is swallowed by `fillTemplate`'s existing blank-line hygiene, so a
  half-filled EPK never ships a dangling separator.
- **Blanked URL constants.** `EPK_LIVE_URL` / `EPK_SITE_URL` / `EPK_SYNC_URL` are `''` and
  `EPK_LEGACY_URLS` is `[]` in the public build. The "EPK is live" block and the `🔄 Sync
  from EPK` button already gate on a hosted URL, so they self-hide for strangers. The sync
  fetch now reads a **new blank-default `syncUrl` EPK field** (with a user-settable input in
  EPK & Templates) rather than the module constant, and the button additionally gates on it.
- **The owner's profile preserved as `DEMO_EPK_PROFILE` + `EMAIL_TEMPLATES_DEMO`** (the exact
  prior Zemba content, including the real hosted-EPK URL + sync manifest so "EPK is live" +
  Sync light up again after loading it).
- **Opt-in "Load demo band".** A `DEMO_LIBRARY_CSV` (the neutral classic-rock sample, now
  shared with the "Get a sample CSV" download) + `loadDemoBand()` seed an 11-song library
  through the **same tested `importCSVRobust` path** (via a synthetic file-input event) and
  load the demo press kit via `saveEpkSettings`. Surfaced as a "Load a demo band →" link on
  the first-run onboarding card; guarded with a confirm so it never silently overwrites a
  press kit the user already started.
- **Source hygiene:** the members-field hint and the three "Zemba-style PDF" code comments
  were de-branded ("BandHelper-style"). The historical CLAUDE.md changelog, `LICENSE`, and
  `drafts/` keep their references (they are records, not runtime).

Verification: `npm test` → 149/149 (the template/EPK constants aren't lifted by
`extract-algorithm.js`, and no algorithm logic was touched); Babel compile clean; headless
Playwright drive — fresh install shows no "Zemba" on the home view or in a compose draft (the
draft reads "…on behalf of Default Band…"), the fresh EPK tagline/bio are blank; "Load a demo
band" seeds 11 songs and the demo press kit (tagline + bio verified via the live field values
+ persisted in `localStorage`), all surviving a reload; a pre-seeded custom EPK
(`MY CUSTOM TAGLINE`) survives load with no Zemba injected — proving the owner's data is
untouched; 0 JS page errors.

---

## 9aa. Change log — 2026-09 StageStand: full-screen chart viewer / live music stand (PR 6)

Realizes the `LiveMusicStandAddon.md` ("StageStand") spec's non-negotiable outcome #1 —
*instantly display the exact chart/page for the selected song from a setlist* — **inside the
app**, not as the separate pnpm/Vite/Capacitor/Yjs monorepo the spec literally describes (that
model is irreconcilable with §1's no-build single-file constraint; see `docs/ASSUMPTIONS.md`
for the full reconciliation and the deferred-phase map). It builds on infrastructure that was
already ~60% of the spec's core: the IndexedDB attachment store (§9x), setlists, the
arrangement roadmap (§11), the `StageModeOverlay`, and the **already-loaded PDF.js** — so it
adds **zero new dependencies**. The prior Stage Mode showed only text; `AttachmentRow` opened
charts in a new browser tab (wrong on stage). Both gaps are closed.

- **Pure navigation core** (module scope, after `fmtBytes`; extracted + unit-tested via
  `test/extract-algorithm.js`, so add any new symbol to its whitelist): `resolveChartKind(mime)`
  (`'pdf'|'image'|'unsupported'` — the renderer-registry key and the extension seam for future
  MusicXML/Guitar Pro/ABC/ChordPro), `buildChartQueue(setlists)` (flattens sets to an ordered
  nav queue — one entry per renderable chart attachment; a chart-less song yields one
  `att:null` **cue-card** entry so paging walks the whole set and every song shows *something*),
  `clampChartPage`, and `stageNavStep(queue, cursor, page, numPages, dir)` (page/song stepping
  with spill-over across entries and set boundaries; `dir` ∈ nextPage/prevPage/nextSong/prevSong
  /first/last). `test/stage-chart.test.js` locks all four (18 assertions).
- **Renderer components** (near `StageModeOverlay`): `PdfPageCanvas` (renders one page to a
  `<canvas>` via `window.pdfjsLib` — the first *render* use of PDF.js, which until now only
  extracted text on import; cancels the in-flight `renderTask` on page/size change, re-renders
  on resize/orientation, warms the next page, destroys the doc on unmount), `ImageChart`
  (object-URL `<img>`, revoked on unmount), `CueCard` (big title + `deriveArrangementSections`,
  run through `sanitizeNotation`), and `ChartViewer` (dispatches on `resolveChartKind`, lazily
  pulling the blob from `attStore.get`).
- **`StageModeOverlay` reworked into a chart-first music stand** (same
  `{open,onClose,setlists}` props, same trigger button/mount): full-bleed `ChartViewer`; a
  ☰ Setlist index overlay (reuses the old `.stage-overlay-*` list) to jump to any song; auto-
  hiding top/bottom chrome; click-zones (left 28% ⟵, right 28% ⟶, center toggles chrome) and a
  horizontal-swipe handler (vertical scroll preserved for tall charts); a page/song indicator
  and per-song multi-chart chips. **Keyboard + Bluetooth foot-pedal nav** (most pedals emit
  arrow/PageUp-Down keys): →/PageDown/Space next page, ←/PageUp prev, ↓/j next song, ↑/k prev
  song, Home/End set ends, F fit, Esc closes the index then exits. Fit (`width`/`page`) and
  contrast (dark/amber/light, for stage lighting) persist in the **new additive** localStorage
  key `setlist_stage_prefs_v3` (never touches an existing key — §1 data-contract rule).
- **Deferred** (see `docs/ASSUMPTIONS.md`, mapped to the spec's F-modules): notation renderers
  (OSMD/VexFlow/alphaTab/ABCJS/ChordPro) + importing those formats; the Apple-Pencil ink
  annotation engine; audio backing-tracks/click + MIDI triggers; band-wide CRDT sync (no
  backend); and page-pinning arrangement sections to PDF pages.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 167/167 (+18);
headless Playwright drive of the **real app** (vendored npm libs, PDF.js worker repointed local)
→ 13/13 — seed a 3-song library (PDF / image / chart-less), generate, open Stage Mode: the PDF
attachment renders to a sized canvas reporting 2 pages, → advances p1→p2, the image renders to
an `<img>`, the chart-less song renders a cue card carrying its arrangement text, contrast
cycles, fit persists to `localStorage`, Esc exits; 0 JS page errors.

---

## 9ab. Change log — 2026-09 StageStand: page-pin markers (PR 7, first of the follow-on trio)

First of three follow-on phases the owner green-lit after §9aa merged (page-pinning →
notation renderers → audio/click+MIDI, as separate PRs). Realizes the spec's F2
"page-pinned arrangement sections" on top of the merged chart viewer: a PDF chart
attachment can carry named jump points ("Verse 1" → p2, "Solo" → p3) and Stage Mode jumps
straight to them. No new dependency.

- **Schema (additive):** a PDF attachment's metadata may carry
  `marks: [{ id, label, page }]`, alongside the existing `{id,name,mime,size,kind}`. It
  persists through the same `attachments` spread as everything else — no new localStorage
  key, no migration (a song without marks is byte-identical).
- **Pure helpers** (module scope, after `stageNavStep`; extracted + unit-tested, whitelisted
  in `extract-algorithm.js`): `normalizeMarks(marks)` (coerce pages to positive ints, drop
  invalid, default a blank label to "Mark", sort by page) and `nextMarkPage(marks,
  currentPage, dir)` (page of the next/prev marker, or null). `test/chart-marks.test.js`
  locks both (6 assertions).
- **Editor** in `SongAttachments`: each **PDF** row gets a 🔖 toggle opening a markers panel —
  add `{label, page}` rows (Enter submits, blank label defaults to `Page N`), remove, live
  count on the toggle. Image/other attachments don't show it (single-page).
- **Stage viewer**: a `.stage-marks` chip strip renders above the transport for the current
  PDF chart; tapping a chip jumps to that page (chip highlights when it's the current page),
  and `[` / `]` jump to the prev/next marker. `jumpToPage` deliberately does **not** clamp to
  the possibly-stale `numPagesRef` (chips render instantly from metadata, before the PDF
  reports its count) — `PdfPageCanvas` clamps at render and `handlePages` re-clamps `nav.page`
  once the true count is known, so an early tap still lands correctly. Strip auto-hides with
  the rest of the chrome.

Verification: `npm test` → 173/173 (+6); Babel compile clean (index.html + 3 companion
files); headless Playwright drive of the real app → 6/6, 0 page errors (a PDF seeded with
Verse@p1 + Solo@p2: strip shows both, tapping Solo jumps p1→p2 and highlights the chip, `[`
jumps back to Verse@p1); the §9aa stage drive re-run → 13/13, no regression.

---

## 9ac. Change log — 2026-09 StageStand: notation renderers (PR 8, second of the trio)

Second follow-on phase. Extends the chart renderer registry beyond PDF/image to the
notation formats the owner named — realizing spec F2/§5. Charts of these formats now import
as attachments and render inside Stage Mode; **ChordPro** additionally transposes live.

- **Format registry** (pure, whitelisted + tested): `chartExt(name)` + `resolveChartFormat(att)`
  key off the filename EXTENSION first, then MIME (notation files usually have no MIME) →
  `pdf|image|chordpro|abc|musicxml|guitarpro|powertab|unsupported`. `buildChartQueue` now uses
  it, so notation attachments become queue entries; `SongAttachments`'s marks panel and the
  stage `showPages`/`marks` gate migrated from the old `resolveChartKind` to it (PDF-only).
  `resolveChartKind` stays for its own tests.
- **ChordPro engine** (pure, no dependency, tested hard — `test/notation-chordpro.test.js`,
  +11): `transposeNote` / `transposeChord` (preserve quality + slash bass, sharp/flat spelling,
  wrap-around, negatives, non-chord pass-through), `parseChordProLine` (chord/lyric segments),
  `parseChordPro` (directives title/subtitle/key/tempo, comments, sections). Covers plain chord
  sheets and slash-rhythm charts too.
- **Renderers** (module scope, near the other chart components): `ChordProChart`
  (custom chord-over-lyric layout, applies transpose), `AbcChart` (ABCJS), `MusicXmlChart`
  (OpenSheetMusicDisplay; text for .xml/.musicxml, bytes for compressed .mxl), `GuitarProChart`
  (alphaTab, worker off / main-thread, Bravura font auto-resolved from the script dir),
  `PowerTabNote` (**.ptb has no in-browser renderer** — the spec routes it through offline
  conversion, so we show a convert-to-GP/MusicXML guidance card rather than fail).
- **Lazy library loading** (`NOTATION_LIBS` + `loadScriptOnce` + `ensureNotationLib`): the three
  heavy libs are injected only when a chart of that format is first opened — the app is byte-for-
  byte unchanged on initial load for everyone else (mirrors the Gmail GIS lazy-load). jsDelivr
  `npm` URLs mirror the pinned packages exactly.
- **Import widened**: `SongAttachments`' file `accept` + hint now include the notation
  extensions; `ChartViewer` dispatches on `resolveChartFormat`, reading blob text for
  ChordPro/ABC. **Stage transpose UI**: a ♭ / n / ♯ control (ChordPro only) plus `-` / `=` / `0`
  keys; transpose is ephemeral and per-song (resets on song change). No schema/localStorage change.

Verification: `npm test` → 184/184 (+11); Babel compile clean (index.html + 3 companion files);
headless Playwright drive of the real app (jsDelivr routed to the vendored npm copies; service
worker blocked so the route can serve them) → 9/9, 0 unexpected page errors — ChordPro renders
C,G,Am and `+2` → D,A,Bm, ABC → SVG (ABCJS), MusicXML → SVG (OSMD), alphaTab loads + mounts (a
real .gp render needs a real file the sandbox can't synthesize — verified in a real browser),
PowerTab shows the guidance card; §9aa (13/13) and §9ab (6/6) drives re-run green.

---

## 9ad. Change log — 2026-09 StageStand: audio / click + MIDI (PR 9, third of the trio)

Final follow-on phase — the **pragmatic subset** of spec F6/F7 the owner chose. Adds a Stage
Mode transport: a per-song backing track (offline), a BPM-derived metronome click, and MIDI
Program Change on song select. **No multichannel routing, no MIDI clock/SysEx** (not reliably
achievable client-side — see `docs/ASSUMPTIONS.md`). Shipped **stacked onto PR #150's branch**
at the owner's request (that PR then merged notation + audio/MIDI together).

- **Pure helpers** (whitelisted + tested — `test/audio-midi.test.js`, +6): `beatIntervalMs(bpm)`
  (clamped 20–400), `midiProgramChange(ch, prog)` / `midiControlChange(ch, cc, val)` (status-byte
  build + clamping), `isRenderableChart(fmt)`. `resolveChartFormat` gains an **audio** branch
  (mp3/m4a/wav/ogg/aac/flac/… + `audio/*`), and `buildChartQueue` filters via `isRenderableChart`
  so a backing-track attachment is **not** drawn as a chart (it plays through the transport; a
  song with only audio still gets a cue-card queue entry).
- **Backing track**: reuses the existing IndexedDB `attStore` — audio files import as attachments
  with `kind:'audio'` ("Backing track"), fully offline, and ride the existing backup path. No new
  store. `AudioTransport` loads the blob → `<audio>` with play/pause + loop.
- **Metronome**: `useMetronome` — Web Audio lookahead scheduler, accent on beat 1, click generated
  from the song's BPM (no file needed). Auto-stops on song change and on overlay close.
- **MIDI**: `MidiManager` (lazy — `navigator.requestMIDIAccess` only on connect; graceful when Web
  MIDI is absent). A per-song preset `song.midi = { ch, program }` (edited via the shared
  `MidiPresetFields` in both song forms; additive schema, persists through the `addSong`/`updateSong`
  spread) is sent as a Program Change when the song becomes current in Stage Mode.
- **Stage transport row** (auto-hides with the chrome): 🥁 click toggle (shows BPM), the audio
  ▶/🔁 transport when the song has a backing track, and a 🎹 MIDI connect/status control. Import
  widened (`SongAttachments` `accept` + audio kind detection).

Verification: `npm test` → 189/189 (+6); Babel compile clean; headless drive of the real app →
10/10, 0 page errors (MIDI preset persists; transport renders; click toggles Start/Stop and shows
BPM; the backing-track play control enables after the IDB blob loads; Web MIDI connect path runs
without throwing; the click stops on song change). The §9aa (13/13), §9ab (6/6) and §9ac (9/9)
drives re-run green. Real MIDI **output to a device** and multi-second audio playback are device/
gesture concerns verified in a real browser (the sandbox has no MIDI hardware).

---

## 9ae. Change log — 2026-09 StageStand: personal ink annotation (PR 10) + audio/MIDI re-land

Two things in one PR. (1) **Re-lands the audio/MIDI work (§9ad)** that did not make it onto
`main` — PR #150 merged only the notation half; the audio/MIDI commits were cherry-picked back
on. (2) Adds **F4 personal ink annotation** on charts. The band-sync half of F4 (F8) needs a
backend and stays out — this is a **local-only, per-device** ink layer.

- **IndexedDB v2.** `attOpen` bumped 1→2, adding an `annotations` object store beside
  `attachments` (additive `onupgradeneeded`; existing v1 users keep their blobs). New
  `annoStore` (get/set/del/clear/all) keyed `${attId}:${page}`; the tx/cursor plumbing was
  factored into `_idbTx`/`_idbAll` shared by both stores.
- **Pure geometry** (whitelisted + tested — `test/annotation.test.js`, +4): `annoKey`,
  `pointSegDist` (point→segment distance), `strokeNearPoint` (eraser hit-test over a stroke's
  segments). Stroke points are stored **normalised (0–1)** so ink stays pinned as the chart
  zooms/reflows.
- **`AnnotationLayer`** — a transparent `<canvas>` positioned exactly over the chart element
  (`targetRef` + `ResizeObserver`, sized/offset to the target). Pointer Events capture pressure
  (→ pen line-width; highlighter is wide + translucent; eraser removes whole strokes). Pen/
  highlighter/eraser, 5 colors, undo/redo/clear in a floating toolbar. Strokes load/save to
  `annoStore` on each change. Tilt/azimuth are not used (pressure is the meaningful signal).
- **Wired into the raster renderers only** (PDF + image): `PdfPageCanvas`/`ImageChart` now wrap
  their element in `.stage-anno-wrap` and mount `AnnotationLayer` when annotation is on;
  `ChartViewer` threads an `anno` prop. Notation/ChordPro/cue cards don't annotate. A ✏️ toggle
  in the stage bar (shown for pdf/image) enables it; while on, tap-zone/swipe page-turns are
  suppressed so drawing works (keyboard/pedal still turn pages).
- **Backup/restore** carries annotations (plain JSON `{strokes}` per key — no base64); old
  backups without the key restore unchanged. No `localStorage` key added (ink lives in IDB).

Verification: `npm test` → 193/193 (+4); Babel compile clean; headless drive → 9/9, 0 page
errors (✏️ shows for a PDF; drawing persists to IDB in normalised coords; a 2nd stroke → 2,
undo → 1; toggling off removes the canvas; the stroke survives a reload). The §9aa (13/13),
§9ab (6/6), §9ac (9/9) and §9ad (10/10) drives re-run green. Real Apple-Pencil pressure/tilt is
a device concern verified on the iPad (the sandbox drives synthetic pointer events).

---

## 9af. Change log — 2026-09 StageStand: MusicXML transpose (F5) + bulk chart→song match (F1)

The remaining backend-free items from the `LiveMusicStandAddon.md` spec. F5 extends live
transposition from ChordPro to MusicXML; F1 realizes the "OCR / fuzzy auto-match / bulk
chart auto-organize" module. No new dependency loads on app start (Tesseract is lazy, like
the notation libs and Gmail GIS). Backend-dependent items (F8 CRDT sync) and no-build-
infeasible ones (Capacitor, OSC, external presenter view) stay out — see `docs/ASSUMPTIONS.md`.

- **F5 — MusicXML transposition.** `MusicXmlChart` now takes a `transpose` prop: it assigns
  OSMD's `TransposeCalculator` before load and sets `osmd.Sheet.Transpose = semitones` +
  `updateGraphic()` before render (both guarded — older OSMD builds without the calculator
  no-op safely). The Stage Mode transpose control (♭ / n / ♯ + `-`/`=`/`0` keys), previously
  ChordPro-only, now also shows for MusicXML; `ChartViewer` threads `transpose` through. As
  with ChordPro, transpose is ephemeral and per-song (resets on song change). Guitar Pro/ABC
  have no clean live-transpose seam in their libraries, so they stay fixed-key for now.
- **F1a — pure fuzzy matcher** (module scope, after the ChordPro/annotation helpers;
  whitelisted + tested — `test/fuzzy-match.test.js`): `normalizeTitle` (strip extension,
  leading track number, punctuation, and noise words — the/live/acoustic/remaster/lead
  sheet/…), `titleTokens`, `titleSimilarity` (token-Jaccard 0–1 with an exact/substring
  bonus), `fuzzyMatchSong(query, songs, threshold=0.5)` → `{song, score}` or null, and
  `ocrTitleGuess(text)` (pick the most title-like line out of an OCR block — drop page
  numbers / symbol rows, prefer the letter-rich line near the top).
- **F1b — "Match Charts to Songs" modal** (`ChartMatchModal`, next to `ImportSongsModal`):
  a "📎 Match Charts" button in the Song Library toolbar opens a bulk drop zone. Each
  dropped chart file (PDF/image/notation/backing-track — same `accept` as `SongAttachments`)
  becomes a row auto-matched to a library song by **filename** (`fuzzyMatchSong`), with a
  song-override `<select>`, a strong/likely/weak/no-match confidence chip, and a per-file
  size guard. **"Attach N charts"** puts every matched file's blob into `attStore` and folds
  the metadata onto each song in one functional `setSongs` (`attachChartsToSongs`, grouped by
  song id) — no `localStorage`/schema change (metadata rides the existing `attachments`
  spread, §9x; blobs live in IndexedDB).
- **On-demand OCR** (spec F1, lazy + graceful): a per-row **🔍 Read title** button (PDF/image
  only) lazily injects Tesseract.js (`ensureTesseract`, jsDelivr, mirrors `ensureNotationLib`),
  renders page 1 via the **already-loaded PDF.js** (or the image) to a canvas, OCRs it, distils
  a title with the pure `ocrTitleGuess`, and re-runs the match. The engine fetches its own
  worker/core/lang on first use (needs one live connection, then caches); when it can't load it
  shows an inline notice and the filename match stands — the app is byte-identical on load for
  everyone who never clicks it.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 198/198
(+7 in `test/fuzzy-match.test.js`: normalize/similarity/match + `ocrTitleGuess`); headless Playwright
drive of the real modal → 16/16, 0 page errors (drop 3 files → 2 auto-match to the right songs
with strong chips, the no-library-song file defaults to skip, Read-title degrades gracefully
when the CDN is blocked, Attach lands both blobs in IndexedDB on the correct songs and they
survive a reload); the §9ac notation drive re-run → 9/9 (MusicXML still renders with the
transpose prop). Real Tesseract OCR accuracy and MusicXML transpose output are device/network
concerns verified in a real browser (the sandbox proxy blocks the Tesseract CDN, and transpose
is a live interaction like the pedal/MIDI paths).

---

## 9ag. Change log — 2026-09 Gig Profiles "Import Arrangement Notes" fixes

Fixes the reported bug: uploading a **Master Arrangement Guide** PDF to the Gig Profiles
"Import Arrangement Notes" button attached nothing, while the same PDF worked through the
main-site library importer. Two independent defects, one on the parse side and one on the
apply side.

- **Root cause A — wrapped titles truncated.** The guide renders a long song title across
  two or more column-A rows (e.g. "PRIDE & JOY - LITTLE" / "WING", "LOVE ME TWO TIMES /" /
  "ROADHOUSE BLUES", "WHAT YOU WON'T DO" / "FOR LOVE"). `pdfParseArrangementGuideVisible`
  only captured the number row's title text, so those notes carried a truncated title and
  `arrNoteMatchesTitle` never matched them to a song. Column geometry alone can't fix it —
  a *single-line* title's italic artist even shares the BPM row's baseline — but the **font
  does**: the title runs render in the bold title font, the artist in italic. So
  `pdfExtractRows` now carries each item's `fontName` (additive; every other parser ignores
  it), and the guide parser records the title font on the number row and appends any later
  column-A run that is entirely in that same font, stopping at the italic artist line. Real
  Zemba guide → all 28 titles now recover in full. Guarded: when items carry no font (the
  synthetic `pdf-export-split.test.js` fixtures), the continuation append is skipped and the
  parser behaves exactly as before.

- **Root cause B — apply targeted the library only.** `applyArrangementNotesFromPDF` matched
  the parsed notes against `songs` (the library) exclusively. A user who imports setlists
  straight into Gig Profiles (the workflow in the report) never adds those songs to the
  library, so matching found nothing and the notes silently attached to no one — while the
  main-site importer "worked" only because it *creates* the songs from the same doc. The
  handler now also merges each note onto every **saved gig's setlist songs** (persisted via
  `setGigs` + `LS.set(LS_KEYS.bandGigs(...))`, mirroring `importBandHelperSetlist`), using the
  same tested `arrApplyNoteToArrangement` role-merge. Library updates stay a pure functional
  `setSongs` (id-keyed map). The toast now reports library and gig counts separately and, when
  nothing matches, says the titles must match the PDF. Button relabeled "Import Arrangement
  Notes" (no longer "→ Library") with matching help text.

- **Not changed:** the embedded `[[SLARR:…]]` lossless block in this user's guide is clipped
  (only 84 of 106 chunks survive extraction — an older export drew it past the page with no
  overflow paging), so `pdfDecodeArrangementData` returns null and the visible parser is the
  live path. The current export code already pages the block, so new large guides embed
  cleanly; the visible-title fix covers the existing PDFs regardless.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 199/199
(+1: wrapped-title recovery via font, single-line artist not folded in); real-browser drive
with the reported PDFs (vendored pdfjs 3.11.174, exact repo functions) — the guide parses to
28 full-title notes, and the exact match+merge the handler runs attaches **24/28** onto a gig
built from the companion setlist PDF (including every previously-truncated wrapped title); the
4 misses are genuine cross-document title differences (medley naming, a set-parser title clip)
that the main-site path would miss too. 0 page errors.

---

## 9ah. Change log — 2026-09 package-export fix + in-setlist song editing (live library sync)

Two reported items. (1) "Package (both PDFs)" produced **only the arrangement guide**, never
the stage sheet — though each exported fine on its own. (2) There was no way to tweak a song's
details/arrangement/notes/attachments from inside a generated setlist without deleting,
re-adding and repositioning it.

- **Root cause A — download clobbering.** `exportPDF('package')` built both docs correctly and
  called `stageDoc.save()` then `guideDoc.save()` back-to-back in the same tick. Browsers —
  iOS Safari most aggressively (the reporter is on iPad) — coalesce multiple programmatic
  downloads fired in one tick down to the **last** one, so the stage sheet (saved first) was
  silently dropped and only the guide (saved second) landed. Fix: build every requested doc
  synchronously into a `jobs[]` array, then dispatch the saves **staggered** — the first on the
  current user-gesture tick (iOS requires the download stay on the gesture), each subsequent one
  on a `setTimeout(i * 700)` so it registers as its own download. Single-doc exports are
  unchanged (one job). No test/PDF-pipeline change — the generators are untouched; this is
  purely the App-level save dispatcher.

- **In-setlist song editing + bidirectional library↔setlist sync.** The generated `setlists`
  is separate React state holding **copied** song objects (they carry the library `id` — locks,
  swap and dedup all key on it — but a library `updateSong` never touched them). So:
  - **Extracted `SongEditFields({ value, onChange })`** — a controlled form body carrying every
    editable field (identity, style/key/BPM/energy, sectioned arrangement + role notes with the
    macro strip, reference clips with their own draft state, `SongAttachments`, `MidiPresetFields`).
    The library inline editor was refactored to render it (its old ~120-line inline JSX + the
    now-dead `editClip`/`editClipErr` state removed) so there is exactly one song-edit form.
  - **`SongEditModal`** (+ `songToEditForm`) opens that form over a generated setlist. A new
    `✎` button in each `SetlistView` row's `.song-actions` opens it (via `onEditSong` →
    App `editSetlistSongId`); the song object is looked up live from the library, falling back
    to the setlist copy if it is no longer in the library.
  - **`updateSong` is now the single sync point.** Besides mapping `songs`, it maps every set in
    `setlists`, applying the same `updates` to any song with a matching id and recomputing that
    set's `totalTime` (duration edits stay accurate). Array-level metadata attached to the
    `setlists` array (`qualityScores` / `anchorKey` / `diagnostics` / `stats`) is copied onto the
    new array so a mid-session edit never blanks the quality readouts or PDF summary. Because the
    modal saves through `updateSong` and the library inline editor already called it, **both
    directions sync**: edit in the setlist → library + every set update live; edit in the library
    → the setlist updates. The snapshot autosave (`[songs,setlists,…]`) persists both.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 199/199 (no
algorithm logic touched — the change is App-level state + a shared UI component); headless
Playwright drive of the real app (vendored npm libs) → 12/12, 0 page errors — a generated
setlist shows the `✎` control, editing a song's title in the setlist modal updates the setlist
row live AND persists into `localStorage` (setlist→library), editing a song in the library
inline editor updates the setlist row (library→setlist), and **"Package (both PDFs)" now
downloads two files** (`setlist-*.pdf` + `arrangement-guide-*.pdf`) where before only the guide
arrived.

---

## 9ai. Change log — 2026-09 combined single-PDF package (iOS-safe export)

Follow-up to §9ah. The staggered two-file "package" export is reliable on desktop but iOS/iPadOS
Safari can still drop one of two programmatic downloads even across ticks. Added a combine option
that produces the whole package as **one** PDF, so the export is a single download.

- **`pdfBaseLayout` append seam.** It now accepts `ctx.doc`: when present the renderer draws into
  that existing jsPDF instance (`doc.addPage(...)` to start fresh) instead of `new jsPDF()`.
  Both renderers are untouched otherwise — they still call `pdfBaseLayout` and destructure `doc`.
- **`exportPDF` combined branch.** For `docKind==='package'` with `pdfSettings.combinePackage`,
  it builds the stage sheet, then calls `generateArrangementGuidePDF(guideEntries, {...ctx, doc})`
  to append the guide onto the same doc, and does a single `combined.save(...)`. Falls back to
  just the stage sheet (still one doc) when there are no guide entries. The non-combined path is
  the §9ah staggered `jobs[]`. Shared `stageSummary()` feeds both.
- **`combinePackage` setting** (`DEFAULT_PDF_SETTINGS`, additive): defaults **on** for iOS/iPadOS
  (UA + touch-Mac detection, `typeof navigator` guarded so the Node test sandbox sees `false`),
  off elsewhere; user-toggleable via a "Combine into one PDF" checkbox in `PdfSettingsModal` that
  shows when the Package radio is selected. The package radio description and the export button
  label reflect the choice ("Export combined PDF" vs "both PDFs").
- **`pdfExportFilename('package', …)`** → `setlist-package-<band>-<date>.pdf`.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 199/199 (no
algorithm logic touched; the generators are unchanged); headless Playwright drive of the real app
→ 9/9, 0 page errors — stage-only exports 1 file (2pp), guide-only 1 file (1pp), the **combined
package is ONE download** named `setlist-package-*` whose page count equals stage+guide (3 == 2+1),
and the non-combined package still produces **two** downloads.

---

## 9aj. Change log — 2026-09 live re-score on manual reorder + saveable energy/tonal profiles

Two workflow-polish items from the owner's list.

- **Manual reorder now re-scores (and no longer wipes scores).** Every manual setlist edit
  rebuilt the array with `[...setlists]`, which dropped the array-level `qualityScores` /
  `anchorKey` — so a drag/move/remove/swap made the quality readout **vanish**, and any
  surviving number went stale. New App helpers `recomputeSetlistScores(sets)` (re-derives the
  anchor key like `generate()` and recomputes `calculateSetlistQualityScore` per set, mutating
  + returning the array) and `commitSetlists(sets)` (recompute → `setSetlists`). Every manual
  handler now commits through it — `swapSong`, `moveSong`, `reorderSongWithinSet`,
  `moveSongBetweenSets`, `removeSongFromSetlist`, `addSongToSet`, `replaceSongInSet`,
  `moveToSetDropdown` (via the move helper), and `resetToOriginal`; `updateSong` (§9ah) also
  recomputes (an energy/duration edit changes the score). The `EnergyCurvePreview` was already
  live (it renders from `set.songs`); this makes the energy/tonal/diversity/duration **scores**
  track the current order too. Manual order is never re-optimized away — we re-score, not
  re-sort.
- **Saveable energy/tonal profiles.** Pure `extractEnergyProfile(settings)` /
  `applyEnergyProfile(settings, profile)` over `ENERGY_PROFILE_FIELDS` (the optimizer knobs:
  `useEnergyCurve`, `energyCurveType`, `energyWeight`, `useTonalGravity`, `tonalSmoothness`,
  `anchorKey`, `tonalWeight`, `setTemplate`, `optimizationLevel`, `randomness`,
  `diversityWeight`) capture/reapply just those fields, leaving everything else untouched.
  Profiles are a reusable, cross-band list in the additive global key
  `setlist_energy_profiles_v3` (never touches a per-band key); App `energyProfiles` state +
  `saveEnergyProfile` (overwrites a same-name profile) / `applyEnergyProfileById` /
  `deleteEnergyProfile`. A **Profile bar** at the top of `SetConfiguration` (`.profile-bar`,
  `data-testid="energy-profile-bar"`) loads a saved profile, names + saves the current knobs,
  and deletes the selected one. Loading applies the config to `settings`; the next Generate
  uses it.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 204/204 (+5 in
`test/energy-profiles.test.js`: field-only extract, absent-field omit, overlay-preserves-rest +
no-mutate, extract→apply round-trip, empty-config tolerance); headless Playwright drive of the
real app → 8/8, 0 page errors — save profile "P1" (persists to `localStorage` with
`config.energyCurveType==='standard'`), change the curve to "party", load P1 → reverts to
"standard"; after Generate the quality reads Set 1: 68/100, and a manual reorder (mobile ↓)
keeps the readout and updates it to 67/100 (before this fix it vanished).

---

## 9ak. Change log — 2026-09 faster song→setlist loop + wider one-tap editing

Workflow polish (no algorithm change).

- **Quick-duplicate a song.** `duplicateSong(id)` clones a library song into an editable copy
  (new id, `status:'active'`, title + " (copy)"), deep-copying `mediaLinks`/`midi` and starting
  with **no attachments** — attachment metadata points at IndexedDB blobs keyed by attachment
  id, so sharing ids would let deleting one song free the other's charts. A "Duplicate" button
  sits in each library row's toolbar.
- **Inline add-to-set from the library.** Each active library row shows a compact "+ Set…"
  `<select>` once at least one set exists, routing straight through the existing `addSongToSet`
  (with its dedup guard). No trip through the Unused-Songs panel for a song already in the list.
- **✎ edit reaches the Unused-Songs panel.** `UnusedSongsPanel` rows gain a "✎ Edit" button
  wired to the same `SongEditModal` (via `onEditSong` → `editSetlistSongId`). The setlist rows
  already carry ✎ in every view (Stage/Advance), so editing is now reachable wherever a song
  appears — library (inline), setlist, and unused pool.
- **Keyboard shortcuts in `SongEditModal`.** A document-level listener (active only while open)
  handles **Esc** (close) and **⌘/Ctrl+Enter** (save) regardless of focus; the hint line names
  them. (The prominent one-tap "↻ Regenerate" that reuses the current settings already exists in
  the setlist toolbar.)

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 204/204 (UI-only,
no logic touched); headless Playwright drive of the real app → 9/9, 0 page errors — Duplicate adds
an "Alpha (copy)" and grows the library by one; the library "+ Set…" select appears after Generate;
the Unused-Songs ✎ opens the editor; **Esc** closes it and **Ctrl+Enter** saves + persists the edit
to the setlist.

---

## 9al. Change log — 2026-09 Set Configuration grouped into collapsible sections (PR 3b follow-on)

The `SetConfiguration` panel was one long flat wall of controls. It is now organized so the
**basics stay up top** (Number of Sets, Duration per set, Allow Reuse, the Profile bar) and the
heavier control blocks live in native `<details className="config-group">` collapsibles:
**⚡ Energy Curve** (open), **🎬 Openers & Closers** (open — holds the Force toggles + locked
pools + per-set assignment), **🎵 Tonal Gravity** (collapsed), **⚙ Advanced Settings**
(collapsed — Set Template, Optimization, Randomness, Diversity/Tonal weight, Song Pairings,
Pin-to-Set). Native `<details>` (same low-risk pattern as §9y's Find-rooms menu) means **no new
React state** and the children always render, so every input keeps its value when a section is
collapsed — only visibility toggles via CSS. The inner "Advanced Settings" text header was
dropped in favor of the summary. `.config-group` styling is built on the PR-2 tokens; each
summary has a `data-testid` (`group-energy`/`group-openers`/`group-tonal`/`group-advanced`).

Verification: Babel compile clean (index.html + 3 companion files; the `<details>` nesting
balances); `npm test` → 204/204 (UI-only); headless Playwright drive of the real app → 9/9, 0
page errors — 4 groups render; Energy + Openers open by default, Tonal + Advanced collapsed; the
Randomness control is hidden while Advanced is collapsed and appears when its summary is clicked;
Generate still produces a setlist after the reorg.

---

## 9am. Change log — 2026-09 inline band quick-edit

Last of the workflow-polish items. The active band's identity could only be changed by opening
Manage Bands; the EPK/press-kit is already one click from the top nav (Press Kit deep-links into
`VenueModal`'s settings tab, PR 3a §9v), so this pass closes the remaining gap — band identity.

- **`BandQuickEdit`** component in the band bar (next to Manage Bands): a "✎ Edit band" button
  expands an inline row of name / icon (emoji) / color inputs that write **live** through the new
  App `updateActiveBand(patch)` (`setBands` map over the active id; persisted by the existing
  `bands`→`LS_KEYS.bands` effect). Enter or Done collapses it. No new localStorage key; the band
  switcher and pill reflect the change immediately.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 204/204
(UI-only); headless Playwright drive of the real app → 6/6, 0 page errors — "✎ Edit band" opens
the inline editor, renaming updates the pill live, persists to `localStorage` (`bands[0].name`),
and the band switcher option reflects the new name.

---

## 9an. Change log — 2026-09 StageStand annotation exit (no-way-out fix)

Fixes the reported bug: in Stage Mode the ink-annotation feature (§9ae) drew fine but
**had no way out**. The only exit was the `✏️` toggle in the top `.stage-chart-bar`,
which auto-hides after 4.5s idle — and while annotating the tap-to-reveal-chrome and
click-zone page-turns early-return on `annoOn`, so once the chrome hid the user was
trapped in draw mode with no reachable control. Three coordinated edits, all in
`StageModeOverlay` / `AnnotationLayer`; no schema, localStorage, or algorithm change.

- **Explicit "✓ Done" exit in the ink toolbar.** `AnnotationLayer` gains an `onExit`
  prop and a prominent green **✓ Done** button at the end of the always-on-screen
  `.stage-anno-tools` strip (`z-index:10001`, so it never hides with the chrome). The
  callback is threaded `StageModeOverlay → ChartViewer(anno.onExit) →
  PdfPageCanvas/ImageChart → AnnotationLayer`, resolving to `() => setAnnoOn(false)`.
  This is the primary, unmissable exit on both web and mobile.
- **Escape exits annotation first** on desktop/web (the requested escape-to-exit):
  precedence in the keydown handler is now `indexOpen → annoOn → onClose`, so a first
  Esc leaves drawing and a second closes Stage Mode. `annoOn` added to the effect deps
  so the closure isn't stale.
- **Chrome stays pinned while annotating.** The auto-hide effect now exempts `annoOn`,
  keeping the top-bar `✏️` toggle (relabeled **✏️ Drawing** when active) and `✕ Exit`
  reachable as a secondary path and preserving page/exit controls during a drawing pass.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` →
204/204 (UI-only, no logic touched); headless Playwright drive of the real app (seeded
song + real 2-page PDF attachment in IndexedDB, generate, open Stage Mode) → 14/14, 0
page errors — annotation toggles on, the **✓ Done** button is present, the chrome stays
visible past the 4.5s auto-hide window while annotating, **✓ Done** exits ink mode
without leaving Stage Mode, re-entering then pressing **Esc** exits ink first, and a
second **Esc** closes Stage Mode. Real Apple-Pencil pressure remains a device concern
verified on the iPad (the sandbox drives synthetic pointer events).

---

## 9ao. Change log — 2026-09 Arrangement-notes import routing + artist-aware matching + CSV round-trip

Fixes two reported bugs and closes the "one file for songs + rehearsal notes" loop. Root
causes were confirmed empirically against the user's own three files (Master Arrangement
Guide PDF, Master Song List PDF, the Late Shift Band songs CSV) by running the **lifted**
parser/matcher over pdfjs-reconstructed `pages`.

- **Bug A — a Master Arrangement Guide PDF imported through "Import + Normalize" became
  ~23 junk songs.** `ImportSongsModal.handleFileUpload` sent *every* PDF to
  `pdfExtractLibrarySongs` (a song-list parser), which scraped the guide's artist lines
  ("Grover Washington Jr.", "Cream", "Bill Withers") and wrapped-title fragments ("FOR
  LOVE") into songs. The **notes parser was already correct** (24/24 notes, full wrapped
  titles). Fix is *routing*: new pure **`pdfLooksLikeArrangementNotes(pages)`** (a
  deterministic header/marker sniff — `MASTER ARRANGEMENT GUIDE`, `ARRANGEMENT & HARMONIC
  DIRECTIVES`, an `ARRANGEMENT NOTES` section, or the embedded `[[SLARR:…]]` block; the
  app's own exports ARE the recognized standard). When it fires, the modal shows a
  **notes panel** (`data-testid="notes-doc-panel"`) — "N notes, M match your library" +
  the unmatched list — with **Apply notes to my songs** (→ the existing, now-upgraded
  `applyArrangementNotesFromPDF`), **Import as songs instead** (fallback), and **Cancel**.
  A plain song-list PDF is unaffected (`pdfLooksLikeArrangementNotes` → false, verified on
  the real Master Song List). New `onApplyArrangementNotes` prop wired from App.
- **Bug B — "CSV export blocked: invalid control characters detected."** Damaged
  arrangement notes stored raw (NUL-interleaved per-glyph mojibake) tripped
  `validateCSVRows`, blocking the whole export. Fix: **`guardCSVCell`** (the single CSV
  cell choke point) now strips C0 controls (except TAB/LF/CR) — so no stored data can ever
  block an export — and `exportSongs` runs every arrangement cell through
  `sanitizeNotation` (repairs the mojibake → readable). The literal reproduction: OLD
  `validateCSVRows` → false; NEW → true, and `S␀o␀ ␀s␀l␀o␀w Ⅰ-Ⅴ` exports as `So slow I-V`.
- **Lossless songs+notes CSV round-trip.** The songs-CSV export wrote only the six *role*
  columns, so section-heavy notes (the norm after a guide import) exported blank. Added the
  four **section** columns (`Arr Intro Cue` / `Arr Form Harmony` / `Arr Transition Outro` /
  `Arr General Notes`) to `exportSongs` + `importToCanonicalCSV`, and taught the importers
  to read them via new `ARR_SECTION_IMPORT_HEADERS` / `ARR_FIELD_IMPORT_HEADERS` /
  `ARR_FIELD_EXPORT_HEADERS` (consumed by `importNormalizeRow` + `csvArrangementFromRow`).
  `general_notes` deliberately does not claim the bare "general notes" header (that stays
  the `global` role), so legacy CSVs are unaffected.
- **Artist-aware, fuzzy tiered matching** ("match by artist / abbreviation when the title
  isn't exact"). `pdfParseArrangementGuideVisible` now captures the italic **artist** line
  under each title (font-discriminated from title continuations). New pure
  **`normalizeArtistKey`** ("The Allman Brothers Band"/"Allman Brothers"→`allmanbrothers`;
  "SRV / Hendrix"/"SRVHendrix"→`srvhendrix`; strips feat./ft. tails; guarded so "The Band"
  survives), **`artistKeysMatch`** (equal / substring, ≥4-char guard), and
  **`bestNoteForSong(song, notes, opts)`** — tiers strongest-first: exact title →
  high-similarity fuzzy title → same artist + a weak-but-real title overlap (never artist
  alone). `applyArrangementNotesFromPDF`'s `mergeFor` now routes through it, so the real
  lone miss ("WHAT'S GOING ON / MERCY MERCY ME" vs library "…Mercy Mercy") now attaches:
  the guide's 24 notes match **24/24** (was 23/24) against the user's library.

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → **225/225**
(+21 in `test/arrangement-import.test.js`: detection true/false, artist-key normalize +
match, `bestNoteForSong` tiers incl. exact-over-fuzzy and artist-never-alone, section CSV
round-trip, `guardCSVCell` control strip + formula guard); real-PDF probe of the lifted
functions (24/24 parsed, 24/24 matched, artist captured, detection guide=true/songlist=false);
export-block simulation (OLD blocks, NEW passes + repairs); headless Playwright drive of the
**real app** (vendored npm libs) → 11/11, 0 page errors — the guide upload shows the notes
panel (NOT the song "Map Columns" step), reports 3/24 matched to a seeded 3-song library, and
**Apply** attaches notes to both the exact-title song and the fuzzy-title song, persisted to
`localStorage`. (The drive also caught a self-inflicted regression — two new regexes had
landed as literal control bytes rather than `\u` escapes, which broke the browser's regex
parser though Node tolerated it — now fixed to match the `validateCSVRows` convention.) The
`importBandHelperSetlist` note-apply loop and the setlist→library `flattenSetlistSongs` were
left on exact-title matching (round-trips of the app's own exports; changing them risks the
existing suite for no user-visible gain).

---

## 9ap. Change log — 2026-09 BandLeaderHQ hero logo + dimmed-hero backdrop

Owner supplied the 3D-chrome "BANDLEADER HQ" hero art and asked for it as the app logo
and backdrop. Display-only; no logic/schema/localStorage change (`npm test` untouched).

- **Assets (lightweight, no multi-MB payload):** `assets/bandleaderhq-hero.jpg` (the full
  1365×768 hero, 131 KB) and `assets/bandleaderhq-logo.jpg` (the wordmark lockup cropped
  from it with `jimp`, 700×350, 69 KB). Total added ≈ 200 KB — nothing like the 17 MB
  background §9t removed.
- **Header logo.** The text `<h1>BandLeaderHQ</h1>` became `<img className="brand-logo"
  src="assets/bandleaderhq-logo.jpg" alt="BandLeaderHQ">`. `.brand-logo` feathers the
  rectangular photo crop into the dark header with a radial `mask-image`
  (`radial-gradient(130% 118% at 50% 42%, #000 60%, transparent 90%)`) + a drop-shadow, so
  there is no hard image edge. `width: min(440px, 78vw)` keeps it responsive.
- **Backdrop — the calm-chrome compromise.** The design skill's rule was "never a
  full-bleed hero behind data" (readability on dense screens; the 17 MB removal). To honor
  the owner's request without breaking that principle, the hero is rendered as **blurred,
  dimmed atmosphere** on a fixed `.ide-background::before` (`blur(26px) brightness(0.5)
  saturate(1.12)`, `opacity: 0.55`, `inset: -8%` so blurred edges sit off-screen) — the
  cosmic constellation + warm/cool brand glow read as texture, but the hero's own wordmark
  dissolves so it never competes with the crisp header logo. The base `.ide-background`
  keeps the dark ground + the two brand-glow radials; `.ide-background__content` is
  `position: relative; z-index: 1` so all app content stacks above the backdrop. Content
  panels keep their opaque `--secondary` surfaces, so tables/charts stay fully readable.
  Tuning knobs are documented inline (lower blur / raise opacity for a bolder backdrop).
- **Docs:** the `design-conventions` skill's "brand imagery is edge-only" bullet was
  updated to describe this owner-approved dimmed-hero backdrop so a future pass doesn't
  revert it to a bare gradient. Favicon/OG assets and the EPK/PDF theming surfaces were
  left untouched (out of scope).

Verification: Babel compile clean (index.html + 3 companion files); `npm test` → 225/225
(no logic touched); headless Playwright render of the real app (vendored npm libs) → app
mounts, `.brand-logo` loads (natural 700×350), 0 page errors; screenshot reviewed — the
crisp wordmark logo reads in the header and the backdrop is soft brand atmosphere with no
legible duplicate wordmark. The blur/dim was tuned up from an initial 7 px (which left the
hero's wordmark legible as a doubled watermark) to 26 px after reviewing the render.

---

## 9aq. Change log — 2026-10 normalizer PDF import, iOS/private-mode attachments, structured rehearsal notes

Three user-reported problems (iPad/iPhone Safari, "same in Chrome"), each reproduced on `main` with
the user's own files before fixing, plus two defects the drives surfaced.

- **"PDF fails in Import + Normalize but works in Gig Profiles" — detached `ArrayBuffer`.** PDF.js
  *transfers* the buffer passed to `getDocument({data})` to its worker, detaching it. §9ao's
  notes-detection pre-pass called `pdfExtractRows(buf)` and then `parsePdfAsSongs(buf)` re-used the
  now-empty buffer → `Cannot perform Construct on a detached ArrayBuffer` on **every** song-list PDF
  in every browser (Gig Profiles reads once, so it worked). `pdfExtractLibrarySongs`' own flat
  fallback had the same latent bug (Quick Import). Fix at the source: new pure **`pdfDataCopy`**
  hands PDF.js a private copy in both `pdfExtractRows` and `pdfExtractText`. **Rule: never pass a
  caller-owned buffer straight to `getDocument`.** The normalizer's `<input>` also stopped its click
  bubbling back into the drop zone's `.click()` (re-entrant picker on iOS), accepts MIME types
  alongside extensions, and resets `value` only after the read.
- **Stacked-layout title leak (both import doors).** A long centered title's last word sat past the
  Title/Key midpoint (`THAT'S THE WAY LOVE` | `GOES`), so the title row passed for the meta line:
  title clipped, key = "GOES", the real Key/BPM/Style dropped — **24/175** songs in the user's list.
  New pure `bhStackedRowIsMeta` (row number, numeric BPM/duration, or a Key cell that parses as a
  key — `BH_KEY_CELL_RE`) decides; non-meta rows push their full x-ordered text. Now 175/175 clean.
- **Attachments failing in private browsing / "occasionally" otherwise.** `attStore.put` stored the
  raw `File`; WebKit (every iOS browser, Chrome included) refuses Blob/File values in IndexedDB in
  private mode and can fail on picker-backed Files elsewhere. And `_attDbPromise` cached the
  connection forever — iOS kills IDB connections when Safari is backgrounded, so the dead handle
  failed every later attach until reload. Rewritten storage layer:
  - bytes stored as **`{__att:1, type, bytes:ArrayBuffer}`** (`attRecordFromBytes` /
    `attRecordToBlob`; legacy Blob values still read, so existing libraries need no migration);
  - self-healing connection: cache dropped on `close`/`versionchange`/open failure, 8 s open
    timeout (iOS first-open hang), and a failed transaction reconnects + retries once;
  - last resort **session-memory fallback**: `put` resolves `{persisted:false, reason}`, the chart
    still attaches/renders/rides a Backup, and the form says plainly it won't survive the tab
    (`attStorageErrorMessage` maps Quota/NotReadable/blocked to actionable text);
  - `SongAttachments` reads before clearing the input; Match Charts reports failed/session-only
    counts; `AttachmentRow` opens its tab synchronously (iOS blocks `window.open` after an
    `await`) and shows "not on this device" instead of doing nothing.
  - **Add Song no longer fails silently** — it names the missing required fields (Title/Artist/
    Duration). Attaching a lead sheet then tapping Add with Artist blank looked exactly like
    "the attachment didn't work".
- **Rehearsal notes: structured + condensed rendering** (pure, deterministic, no AI/network):
  `structureNoteText` recovers structure from run-on notes — inline `*` bullets, raw Markdown
  (`**Verse** - **Bars 1-4:**`), role labels glued mid-sentence (`…along with. Bass: …`), `[n]`
  footnotes, nested chord lists, one-sentence-per-line for long prose — into heading/item/text/
  footnote blocks. `formatNoteText` re-emits them as clean line-per-idea text (idempotent);
  `condenseNoteText` builds a stage summary: cue chips (`noteCueTags`) + ≤5 short lines, grouped by
  sub-heading, chord-dense sections collapsed to their cycle (`Verse (12-Bar Cycle): Emaj7 · C#m7 ·
  F#m7 · A/B`), generic advice and footnotes dropped. Surfaces:
  - shared **`<StructuredNote text mode="full|stage">`** component;
  - **Advance view** now renders *section* notes too — previously it showed only role fields, so
    everything an Arrangement Guide import writes (sections) was invisible there;
  - **Stage Mode cue card** defaults to the stage summary, "Show full notes" toggles;
  - **editor** (`ArrSectionFields`): "✨ Tidy formatting (N fields)" applies `formatNoteText` to every
    note field in one atomic `onReplace` (the forms' `upd` closes over a stale form, so per-field
    calls would drop writes) — reviewable, nothing saves until the song does; plus a collapsible
    "🎤 Stage summary preview";
  - **Arrangement Guide PDF**: new `pdfSettings.guideNoteStyle` = `organized` (default: bold
    sub-headings, square bullets with hanging indent, small muted footnotes) | `condensed` (stage
    summary) | `raw` (pre-change behaviour), chosen in `PdfSettingsModal`; layout via the pure
    `guideNoteRuns`. The embedded `[[SLARR:…]]` block is untouched, so re-import stays lossless.
  - Fixed while there: guide titles/artists wrapped to the full column width but were drawn 28pt in
    (after the number badge), overflowing into the KEY column.
- **No regex lookbehind, ever.** Safari < 16.4 cannot parse `(?<=` / `(?<!` and Babel Standalone
  does not transpile it — one blanks the whole app on an older iPad. A test now scans every
  shipped source file for it.

Verification: `npm test` → **243/243** (+18: `test/pdf-import-robustness.test.js` — buffer copy vs
a simulated transfer-detach, real song-list geometry; `test/attachments.test.js` record format +
error mapping; `test/note-format.test.js` over verbatim notes in `test/fixtures/rehearsal-notes.json`,
incl. idempotency and the lookbehind guard); Babel compile clean (index.html + 3 companions).
Headless drives (vendored libs) — each failure first **reproduced on `main`**:
normalizer + real song-list PDF → Map → Review 175/175 → Import; guide PDF through the same door →
notes panel 24/24 matched → applied; attach under four emulated failure modes (normal, WebKit
private Blob rejection, lost connection, IDB blocked → session-only notice) 4/4 (all 4 fail on
`main`); legacy Blob records + backup enumeration; stored PDF renders in Stage Mode after reload;
editor Tidy/preview/save + cue card summary↔full 8/8; guide PDF rendered in all three styles and
reviewed visually; organized guide re-imports 24/24. 0 page errors throughout. Real-device
confirmation (iOS private tab, backgrounding mid-session) is still worth a smoke test.


---

## 9ar. Change log — 2026-10 Gig Prospector v2 (vetting pass)

The Prospector (§9g) had never been run for real outreach. A code audit + fixture probe of the
lifted engine found it silently hid good rooms. The sandbox can't reach Overpass (proxy blocks it),
so everything was verified against fixtures shaped like real OSM tags + a mocked-network drive.

- **Result cap 400 → `PROSPECT_RESULT_CAP` (2000).** Overpass returns elements in **id order, not
  by fit**, so `out … 400` dropped most of a dense 5–10 mi Vegas area *before* scoring saw it (a
  fixture with 199 live-music rooms at high ids → 0 survived). `prospectsTruncated` now surfaces a
  warning when the cap is hit instead of hiding it.
- **Timeouts are errors, not "no places found".** Overpass reports a server abort as HTTP 200 with a
  `remark` + empty `elements`; the old code rendered that as an empty area. `overpassResponseIssue`
  detects it so the loop falls through to the next mirror. Each endpoint gets an `AbortController`
  timeout (`PROSPECT_FETCH_TIMEOUT_MS`, 45 s) so a hung mirror can't spin forever. A third public
  instance (`overpass.private.coffee`) sits between the main and kumi.systems endpoints.
- **Dual-format scoring.** `scoreProspect` now returns `{ score, signals, fit: { soloDuo, band },
  format }` — each place is scored as a solo/duo room (patio, wine/tap-room name, dinner cuisine,
  modest capacity) and as a full-band room (clubs/casinos, `opensLate` from `opening_hours`,
  capacity ≥ 150, bar-room name); `score` is the better fit. `prospectToVenue` writes `format` to
  `preferredFormat`, so the tagged EPK link (`?act=`) opens the matching act — previously every
  prospect fell back to `band`, sending solo/duo rooms to the full-band page.
- **Scoring corrections.** A `brand` + `live_music=yes` place is kept at −2 (chains book acts at the
  location level) instead of zeroed; `takeaway=only` / `drive_through=yes` / `fast_food` are zeroed;
  the name cues "grill" and "social" were dropped (they matched takeout counters and coffee shops) —
  "bar & grill" still counts. Cues live in the `PROSPECT_NAME_CUES` table.
- **Casinos default on** (the owner's actual room history). Areas carry `state`; prospects keep
  `lat`/`lon` + `distanceMi` (haversine) and flag `cityGuessed` when the city came from the search
  area rather than `addr:city`. Venues gain additive `lat`/`lon` fields (not in `BLANK_VENUE`; old
  venues unaffected). `overpassToProspects(json, area)` still accepts the old city-string argument.
- **UI:** fit chip (🎸 solo/duo / 🥁 band, hover shows both scores), distance, a best-fit / nearest
  sort (`data-testid="prospect-sort"`; nearest keeps score-0 rows at the bottom), the truncation
  warning, and the ODbL-required "Map data © OpenStreetMap contributors" credit
  (`data-testid="osm-attribution"`). Overlay copy states OSM coverage is patchy — a supplement to
  the Vegas Directory, not a census.
- **CAN-SPAM footer.** `appendOutreachFooter(body, templateKey, mailingAddress)` runs at the end of
  `fillTemplate`: every template except the transactional `OUTREACH_FOOTER_EXEMPT`
  (`callRequest`, `bookingConfirmation`) ends with a "reply 'no thanks' and I won't follow up" line
  plus the new EPK field **`mailingAddress`** (blank default; a P.O. box is fine). Idempotent —
  skipped when the body already has no-thanks / unsubscribe / opt-out wording, so user templates with
  their own opt-out are respected. Compose shows `data-testid="address-warn"` while the address is
  blank. Marking a "no thanks" venue **Pass** halts its sequence (existing §9l behavior).

**Email context (owner setup, not code):** the owner's `booking@zembamusicco.com` is an **IONOS**
mailbox, not Google, so the §9j Gmail integration can't send from it. The supported path is the
compose overlay's **Email App** button (mailto → the device's mail app with the IONOS account as
default), with replies marked Responded by hand. Automatic reply detection for IMAP providers needs
a small backend — deferred to the marketplace/hosting phase. IONOS DNS: root A records → GitHub
Pages, `www` CNAME → `quantumq1981.github.io`; IONOS auto-creates MX/SPF/DKIM per subdomain. Root
SPF/DKIM/DMARC were not yet confirmed — a `_dmarc` TXT (`v=DMARC1; p=none; …`) is the likely gap.

Verification: `npm test` → **255/255** (+12 in `test/prospector.test.js`: query cap, defaults,
remark/malformed detection, truncation, haversine, `opensLate`, chain/takeout/name-cue scoring,
dual-format fit, coords/state/city-guess mapping incl. the legacy string signature, format → `?act=`
link, footer exemptions + idempotency + address flattening); Babel compile clean (index.html + 3
companions); headless Playwright drive (vendored libs; Overpass mocked — endpoint 1 returns an
HTTP-200 timeout remark, endpoint 2 the fixture) → **23/23**, 0 page errors: fall-through to the
second mirror, casino ranks first with a band fit, wine bar gets solo/duo, takeout last,
chain-with-live-music kept, distance + nearest sort, attribution, 5 venues added with
`preferredFormat`/coords/state/token, compose body ends with the opt-out line and shows the address
warning, and with an address set the footer prints it and a duo venue's link reads
`?act=duo&track=…`. Live Overpass behaviour (real Vegas tag density, mirror availability) still needs
one real-browser run.

---

## 9as. Change log — 2026-10 whole-library set-length mode

Owner request: generate N sets from the **entire library** without picking minutes, then trim —
instead of nudging per-set durations until omitted songs fit. Time-based mode is unchanged and
stays the default.

- **Setting (additive):** `settings.setLengthMode` = `'time'` (default; absent ⇒ time) |
  `'library'`. Persisted with the per-band settings — no new localStorage key.
- **Pure helpers** (module scope, just above `generateSetlistsCore`; whitelisted in
  `extract-algorithm.js`): `SET_LENGTH_MODES`, `LIBRARY_FILL_UNDERSHOOT` (0.9),
  `libraryDistributedDurations(songs, n)` (even split of total minutes; blank durations count
  as 4), `resolveSetDurations(settings, songs)` (per-set targets for either mode — the single
  source for `generate()`, `recomputeSetlistScores` and the UI), and
  `distributeLeftoverSongs(sets, leftovers, opts)`.
- **Core (`generateSetlistsCore`)** in library mode: each set's greedy target is its fair share
  × 0.9, so the builder never exhausts the pool mid-set (the no-reuse abort guard would drop
  that whole set); pool exhaustion no longer aborts in this mode. After the set loop a sweep
  places every unplaced song (dedup by id **and** title+artist, same keys as the reuse guard):
  highest-energy first, into the currently shortest set, at the slot whose
  `targetEnergyCurve` best matches it, never at a forced opener/closer slot, never splitting a
  pair, avoiding keep-apart neighbours, and seated beside an already-placed pair partner when it
  has one. Tonal refinement / deep SA then polish the order as usual. `allowSongReuse` is
  forced off in library mode (each song exactly once by definition).
- `results.targetDurations` now rides on the output; the tonal wrapper's quality score uses it
  per set (previously it scored every set against the uniform `opts.setDuration`, ignoring
  per-set overrides). The validator skips the "library too small for the requested minutes"
  warning in library mode.
- **UI** (`SetConfiguration`): a "Set length" radio pair — ⏱ By duration / 📚 Whole library
  (`data-testid="set-length-time" / "set-length-library"`). Library mode swaps the duration
  inputs for a summary (`data-testid="library-split"`: "All N active songs → K sets, ≈ songs ·
  ~min per set") and hides Allow Song Reuse and the pool-size meter. Generate toast reads
  "Generated K set(s) from all N songs — trim as needed".
- ~~Known, pre-existing: the closer swap could replace a pair's follower~~ — fixed in §9at.

Verification: `npm test` → **267/267** (+12 in `test/set-length-library.test.js`: even split,
mode resolution, every song once across 1/3/4 sets from 200 songs, balanced set times, locked
closers last, pairs/anti-pairs, tonal+deep path, time mode unchanged, sweep opener/closer +
partner seating, validator, reuse ignored); Babel compile clean (index.html + 3 companions);
headless Playwright drive of the real app (vendored libs, 200-song library with 10 shelved) →
14/14, 0 page errors: toggle defaults to By duration, library mode hides duration inputs and
shows "All 190 active songs → 4 sets", Generate yields 4 sets holding all 190 active songs once
(no shelved songs) at 190/189/191/191 min, the mode persists, switching back restores the inputs.

---

## 9at. Change log — 2026-10 "pair together" order fixes + set-length mode in saved profiles

Follow-ups to §9as. A stress probe (60 songs, 3 sets, locked opener + closer pools, a pair, an
A→B→C chain, a keep-apart pair) showed pairs breaking on **every** generator path in both
set-length modes — on `main`: greedy 532/600, tonal 437/600, deep 85/150 runs clean. Three
independent root causes, each fixed at its source:

1. **Forced-closer swap orphaned a pair's follower** (`generateSetlistsCore`, closer block). When
   the set's last song is the trailing half of a pair (`affinityNextMap` says its predecessor
   leads it — `lastIsPairFollower`), a designated closer is now **appended** after the pair
   instead of replacing the follower, and the soft style-closer swap is skipped.
2. **End-of-set deadlock fallback let a follower in before its leader.** Near the end of a set
   the duration window can leave a pair's follower as the *only* candidate; the hard order
   guard then fell through and picked it, the leader landed after it (or got evicted by the
   closer and reused in the next set). Now, when every candidate is a held-back follower, the
   generator places that follower's **leader** instead (never a reserved opener/closer), and the
   existing forced-adjacency pass glues the follower after it.
3. **Tonal refinement + deep SA scored pairs symmetrically.** `_affSet` (wrapper) and the SA
   adjacency term treated `B,A` like `A,B`, so an adjacent swap could reverse a pair for a
   marginal tonal gain. The adjacency reward is now **ordered** (`_affSet` holds `a|b` only; SA
   uses a new `affinityOrdered` set for its −50 term). Anti-affinity stays bidirectional; SA's
   small gap-2/3 affinity bonus still uses the either-order set.

After: 600/600, 600/600, 150/150 in both modes, no duplicates, openers first, closers last.

**Profiles.** `ENERGY_PROFILE_FIELDS` gains `setLengthMode`. A whole-library profile also stores
`numSets` (in that mode the count is the gig's shape); `applyEnergyProfile` restores it and
resizes `setDurations` to match (same rule as the Number of Sets input). By-duration profiles
never store the set count, and profiles saved before this change (no `setLengthMode`) leave the
current mode and count alone. `saveEnergyProfile` stamps the effective mode (`|| 'time'`) so a
band that never touched the toggle still saves "by duration".

Verification: `npm test` → **277/277** (+7 in `test/pairing-order.test.js` — all 3 paths × both
modes with locked openers/closers, plus the pair-at-set-tail case; all 7 **fail on the previous
`index.html`**; +3 profile tests); Babel compile clean; headless Playwright drive of the real app
→ 20/20, 0 page errors (save a 4-set whole-library profile, switch to by-duration × 2, load it →
mode + 4 sets restored; 5 generations with an S10→S11→S12 chain + 4 locked closers: chain always
adjacent and ordered, every set ends on a locked closer, all 190 songs placed).

---

## 9au. Change log — 2026-10 Vegas venue directory expansion (Oct 2026 booking-leads research)

Cross-checked the owner's "Las Vegas Live-Entertainment Booking Leads for Solo, Duo and Trio
Acts (October 2026)" report against `VENUE_DIRECTORY` (§9f) and added everything missing.
Data-only change: no schema, localStorage, or UI logic touched (the browser already groups by
`region` and counts via `VENUE_DIRECTORY.length`).

- **49 → 230 entries** (+181). Two new regions: `Southwest & Spring Valley` (Orleans, Silverton,
  M Resort, Durango, Gold Coast, Palace Station, UnCommons…) and `Private Events: Country & Golf
  Clubs` (25 clubs, type `Event Space`, notes point at the coordinator's preferred-vendor list).
  Multi-room properties under one entertainment office are **one entry naming the rooms** (e.g.
  "ARIA Lounges: Lift Bar, Lobby Bar, Easy's"), because one contact books them all; unrelated
  venues the report grouped on one row are split.
- **`verified` semantics kept strict:** `true` only where the report gives a *published booking
  channel* (new: Category 10, Gold Mine Tavern; existing Sand Dollar Lounge flipped to true with
  `booking@thesanddollarlv.com`). Corporate casino rooms are CONFIRMED music rooms but publish no
  booking channel, so they stay `false` (the "⚠ verify" prefix fits). Every new entry's `extra`
  carries the report's status: `Oct 2026 research: CONFIRMED | LIKELY | SPECULATIVE | NEW …`.
  Addresses the report didn't give are left at district level rather than guessed.
- **Dedup:** 19 report rooms were already present (Vic's, Sand Dollar, Maxan, Dispensary, Piazza,
  Carnaval Court, Gilley's, Rí Rá, Rush, Backstage, Mob Museum Underground, Atomic Liquors,
  SoulBelly, Golden Tiki, Red Dwarf, Hammer's, Lovelady, Roxy's, Railhead); "Grape Street Café"
  is the existing **Grape Vine Cafe** (same address/phone) — alias noted, not re-added. Those
  entries were **enriched** in place (Sand Dollar email/phone/Pro Jam, Dispensary general inbox,
  Maxan manager inbox, Piazza piano-bar night, schedules for Gilley's/Rí Rá/Rush/Roxy's/Railhead,
  Backstage talent-application link + phone discrepancy, Red Dwarf/Grey Witch Fat Cat move).
- **Deliberately excluded:** closed rooms (Fat Cat, Mama Rabbit, Skyfall, The Mirage, Vino Del
  Lago), Double Down Saloon ("no singer-songwriters, no country"), Hard Rock (2027, no room yet),
  and the agencies/union (§9 of the report — not venues). Vinyl Room is listed but flagged
  private-events-only.
- **New guard test** `test/venue-directory.test.js` (VENUE_TYPES / VENUE_DIRECTORY /
  directoryEntryToVenue added to the extract whitelist): case/accent-insensitive unique names
  (the browser and `bulkAddVenues` both dedup by lowercase name, so a duplicate would hide an
  entry), valid types/emails/state, closed rooms absent, the six direct-booking channels present,
  and the unverified-notes mapping.

Verification: `npm test` → 282/282 (+5); Babel compile clean (index.html + 3 companions);
headless Playwright drive → 8/8, 0 page errors (directory renders 230 rows in 9 regions with no
duplicate names, "+ Add 230 venues" lands all of them in the pipeline with tracking tokens and the
Sand Dollar booking email, re-opening shows every row "✓ in your list").

---

## 9av. Change log — 2026-10 directory contact research + Prospector ↔ directory contacts

Follow-up to §9au. The 181 rooms added there carried only the report's few emails, so this
pass researched published contacts for the **independent** rooms (bars, taverns, breweries,
restaurants — the ones likely to publish an inbox; corporate casino lounges publish none) via
the Firecrawl connector (search + scrape) with WebSearch as a fallback when Firecrawl
rate-limited. Only contacts actually published by the venue (its site/contact page, its
own social profile, or a listing quoting it) were recorded; every touched entry's `extra`
ends with `Contact research (Oct 18 2026): <source>`. Nothing was guessed.

- **Emails 20 → 37** (e.g. Red Dwarf `Natalie@reddwarflv.com` — its own band-booking page;
  Taverna Costera `booking@tavernacostera.com`; Jazzy Blu, Frankie's Tiki Room, Glitter Gulch
  Tiki, Mickie Finnz, Chinitas/Sonrisa, Lovelady, LVBC, Tenaya Creek, The Coffee Class, Jive
  Turkey, The Speakeasy). Phones/addresses/websites filled for ~30 more. `verified` flipped to
  true only for Taverna Costera (a stated booking inbox); general/events inboxes stay false and
  say so in `contactName`.
- **Removed 6 rooms confirmed closed:** E-String Grill, Don't Tell Mama, The Pepper Club,
  Artifice, Beauty Bar, Joseph James Brewing (225 entries now). **Corrected:** Grey Witch is in
  Henderson (722 W Sunset Rd), Luckley Tavern is inside the Rio, Wax Rabbit is a DJ room at
  Durango, Tenaya Creek moved to W Bonanza Rd, La Casa is in Summerlin, Hogs & Heifers is at the
  Plaza. **Added** Water Street District (Henderson), which has publicly asked for musicians.
- **Prospector ↔ directory** (pure, tested): `directoryNameKey` / `findDirectoryMatch` /
  `enrichProspectFromDirectory`. Each OpenStreetMap result is matched to a directory room
  (exact normalized key, or a map name that extends a ≥6-char directory key, e.g. "Mickie
  Finnz Fish House & Bar"); a match fills only the email/phone/website the map lacks, adds a
  `📇 booking contact on file (Vegas Directory)` signal, and `prospectToVenue` carries the
  `contactName` plus a provenance line into the venue's notes. Result rows now show the email.
  Score is unchanged. No two directory names share a key (checked).

Verification: `npm test` → 283/283 (directory guard extended: closed rooms, new booking
emails; new matcher test incl. accent/"The"/suffix handling, prefix guard, no-match cases,
map-data-wins, venue mapping); Babel compile clean; headless drives — directory 8/8 (225 rows,
no dups, bulk add, 0 page errors) and Prospector 5/5 with a mocked Overpass response (Red Dwarf
and "Mickie Finnz Fish House & Bar" rows show their directory emails, an unlisted place is
untouched, the added venue keeps email + contact + provenance note, 0 page errors).

---

## 9aw. Change log — 2026-10 club + speculative-room research pass

Second research pass after §9av, covering the 25 country/golf clubs and the ~56 rooms the
report marked SPECULATIVE / ANNOUNCED / NEW / STALE. Data-only (77 entries patched, 3
removed, 222 total); the same rules as §9av — only venue-published contacts, each touched
entry's `extra` ends with `Contact research (Oct 18 2026): <source>`, nothing guessed. Tools:
Firecrawl search/scrape for emails, the **Yelp connector** for open/closed status + phone +
address (it reports `is_closed` directly and doesn't rate-limit like Firecrawl), WebSearch as
fallback. Log: `docs/venue-contact-research-2026-10.md` (pass 2 section).

- **Clubs:** 11 of 25 now carry an events email (Red Rock CC, Las Vegas CC, Las Vegas Golf
  Club, Angel Park, Cascata, Revere, DragonRidge, Painted Desert, The Stirling Club, Firelight
  Barn, Atomic Golf) and 19 a phone. For clubs the catering/events director *is* the booking
  route for event entertainment, so `verified: true` where that email is on the club's own
  site (7). Arcis Golf clubs share an events team (Megan Scholl / Sahar Panahizadeh). Serket
  is in Henderson, not Las Vegas. Firelight Barn turned out to be a live-music dinner theater.
- **Speculative rooms:** almost all confirmed open with a phone; **removed 3 closed** —
  Downtown Cocktail Room (closed Nov 2024), Andiron Steak & Sea (replaced by Harlo), Public
  School 702. **Corrected:** "Aces & Ales (Arts District)" → `Aces & Ales` (no Arts District
  location; the report's 1327 S Main is Nevada Brew Works, which is in the Arts District, not
  Henderson). Rampart Casino is now **The Resort at Summerlin** (noted on Round Bar / Summerlin
  Room; names kept so existing pipelines still dedup). Still not open: Sip Sip Wok (delayed),
  Neon Fork, Girograno, EDO Gastropub, Stix Asia, The Corner Store; Bäco Grill couldn't be
  found anywhere and is flagged. UnCommons runs a Fri/Sat local-artist slot.
- Guard test extended (3 more closed rooms, club emails, count ≥ 220).

Verification: `npm test` → 283/283; Babel compile clean; headless drives — directory 8/8 (222
rows, 9 regions, no dups, bulk add, 0 page errors), Prospector 5/5 (directory contacts still
flow into map results), 0 page errors; no two directory names share a match key.

---

## 11. PDF export — two decoupled documents

Exports split into two independent pipelines, both fed by pure model builders. Nothing
in the pipeline touches React state: `exportPDF(kind)` in `App` builds a context object
and hands it to a module-scope renderer, so both renderers are drivable headlessly.

| | Stage Setlist | Master Arrangement Guide |
|---|---|---|
| Purpose | on the music stand | in the rehearsal folder |
| Model | `buildStageSetlistModel(sets, {includeCues})` | `buildArrangementGuideModel(sets, {roleFilter})` |
| Renderer | `generateStageSetlistPDF(model, ctx)` | `generateArrangementGuidePDF(entries, ctx)` |
| Content | `#`, title, artist, key, BPM, style; `*` marks a song with a guide entry; one ≤40-char cue line in Advance view | 3-column grid `[Song # & Title] \| [Key/BPM/Style] \| [Arrangement & Harmonic Directives]`, grouped by set |
| Arrangement prose | **never** | all of it |
| Filename | `setlist-<band>-<date>.pdf` | `arrangement-guide-<band>-<date>.pdf` |

`kind` is `'stage' | 'guide' | 'package'` (`PDF_DOC_KINDS`). The Setlist view exposes
all three as buttons (`data-testid="export-stage" / "export-guide" / "export-package"`);
`PdfSettingsModal` carries the same choice as a radio group (`data-testid="pdf-doc-kind"`)
plus an optional **Venue / Event** line (`pdfSettings.eventLabel`) printed in both headers.
`arrangementSongCount` (memo in `App`) drives the guide button's count + enablement.

**`'package'` — two paths (§9ah, §9ai).** When `pdfSettings.combinePackage` is **off**,
`exportPDF` builds each doc into a `jobs[]` array and dispatches the `.save()` calls on separate
ticks — the first synchronously (so iOS keeps the download on the user gesture), the rest via
`setTimeout(i * 700)`. Firing both saves in one tick makes browsers (iOS Safari especially) drop
all but the last, which is why "Package" once produced only the guide. When `combinePackage` is
**on** (default on iOS/iPadOS, user-toggleable in `PdfSettingsModal`), the two documents are
concatenated into **one** PDF (`setlist-package-<band>-<date>.pdf`) so the export is a single
download — the fully reliable path where multi-download suppression bites. The concatenation
seam is `pdfBaseLayout`: pass `ctx.doc` and the renderer `addPage`s onto that existing doc
instead of `new jsPDF()`, so `generateStageSetlistPDF` then `generateArrangementGuidePDF({...ctx,
doc})` draw into one instance. Keep both paths if you touch the dispatcher.

**Note style (§9aq).** `pdfSettings.guideNoteStyle` — `organized` (default) | `condensed` | `raw` —
picks how column C lays each note out, via the pure `guideNoteRuns(text, style)` (headings bold,
items with a drawn square bullet + hanging indent, footnotes small/muted). Runs are wrapped with
the font they're drawn in, so `measureBlocks` stays exact. Column A wraps title/artist to
`COL_A − 2·PAD − 28` (the badge offset).

**Layout rules the guide must keep.** No full-bleed watermark — a background wash under
dense chord prose is what made the combined export unreadable; the logo is a 30pt mark in
the header band instead. Rows are measured (`measureBlocks`) before they are drawn, so a
song is never split across a page and a continuation page repeats its set band. Zebra
striping is a flat tint, never a graphic.

### `sanitizeNotation(text)` — the notation sanitizer

Every string entering either document goes through it. Two phases:

1. **Repair.** jsPDF's built-in fonts are WinAnsi/Latin-1: handed a codepoint above
   U+00FF they emit the two raw bytes. That is the exact corruption in the reference
   exports — U+2160 (Ⅰ) came out as ``!` ``, U+2164 (Ⅴ) as `!d`, U+266D (♭) as `&m`,
   U+266F (♯) as `&o`; a second fallback mode drew one glyph at a time and interleaved
   NULs, producing the letter-spaced `S  o    s  l  o  w` rows. `repairNotationMojibake`
   undoes the byte pairs (the `&` pass runs **before** the `!` pass so `&o!` `9` resolves),
   `repairRomanChain` recovers a partially damaged progression (`!e7-a7-1d7` → `VI7-II7-V7`),
   and the NUL collapse undoes the per-glyph mode.
2. **Normalise.** Roman-numeral codepoints (U+2160–U+217F) → ASCII, accidentals
   (♭ ♯ ♮ 𝄪 𝄫 Δ ∅ °) → `b # (nat) x bb maj o/ dim`, superscript extensions → digits,
   then `pdfSafeText` for the Latin-1 net and whitespace hygiene. Idempotent.

Guards keep prose safe: the marker may not be glued to a word character (`R&B`, `Yeah!ok`)
and `!` may not be followed by a lowercase letter.

`arrRowText` closes the same loop on **import**: when a row's items carry measured widths
it re-joins them by horizontal gap (`ARR_WORD_GAP_PT` = 2.6), so a per-glyph row comes back
as words instead of `S o s l o w`. Rows without widths keep the old single-space join.

### Sectioned note schema

`ARR_SECTIONS = ['intro_cue', 'form_harmony', 'transition_outro', 'general_notes']`
sit **alongside** the six `ARR_ROLES` in the same arrangement object (`ARR_FIELDS` is the
union). Roles answer "who"; sections answer "where in the song". `parseArrangement` /
`serializeArrangement` / `hasArrangementData` / `normalizeArrObj` /
`arrApplyNoteToArrangement` all operate over `ARR_FIELDS`; a lone free-text note still
serialises as a plain string, so legacy libraries are byte-identical.

`deriveArrangementSections(arrangement)` gives every legacy note a sectioned view:
explicit section fields always win; otherwise each role line is **repaired first** and
then classified by `classifyArrLine` (a leading `[tag]` is authoritative, then harmony,
then outro, then intro, else general). When the sections are derived, the guide suppresses
the roles block (`derivedFromRoles`) — they would print the same text twice. Both song
forms render the shared `<ArrSectionFields>` component; do not re-hardcode the field list.

### Round-trip

Guide PDFs still carry the lossless `[[SLARR:…]]` block, so re-import is exact —
including characters the visible text transliterates. `pdfParseArrangementNotes` resolves
embedded → legacy footnote layout (`pdfParseArrangementNotesVisible`) → guide grid
(`pdfParseArrangementGuideVisible`, which recovers column origins from the header strip
rather than assuming them).

### Verification for this area

`npm test` (`test/pdf-export-split.test.js` drives the renderers through a recording stub
jsPDF, so the suite stays dependency-free), plus the scratchpad recipe from §2 for a real
jsPDF → pdf.js round-trip and the Playwright drive.

## 10. Gmail API integration (BUILT 2026-07 — see §9j; spec kept for reference)

**Goal.** Close the outreach loop: replace fire-and-forget `mailto:` with real sends
through the user's Gmail, and detect replies automatically so the pipeline advances
itself (contacted → responded) and follow-up nagging stops the moment a buyer answers.
This is the top-priority unbuilt item from the 2026-07 recommendations pass (§9i built
the measurement half; this builds the sending/detection half).

### Architecture (respect the app's constraints)
- **No backend, no build step.** Everything runs client-side in the single file.
- **Auth**: Google Identity Services (GIS) token client —
  `https://accounts.google.com/gsi/client`, `google.accounts.oauth2.initTokenClient`.
  Load this script **lazily** (inject the tag only when the user clicks "Connect
  Gmail") so the app keeps working fully offline/unconnected.
- **API**: plain `fetch` against the Gmail REST API with the Bearer token — do NOT
  pull in the heavy `gapi` client library.
- **Scopes** (least privilege): `gmail.send` + `gmail.readonly`.
- **User setup**: each user supplies their own OAuth **Client ID** (they create a free
  Google Cloud project, enable the Gmail API, add an OAuth consent screen + a Web
  client with their hosting origin). Ship a step-by-step help block in the UI.
  Store `{ clientId, connectedEmail }` in a new LS key `setlist_gmail_v3`.
- **Tokens**: keep the access token **in memory only** (≈1 h expiry); re-acquire via
  `tokenClient.requestAccessToken({ prompt: '' })` for silent refresh. Never persist
  tokens to localStorage.

### Sending
- Build an RFC 2822 message (To/Subject/body from the compose overlay state), UTF-8,
  base64url-encode, `POST /gmail/v1/users/me/messages/send` with `{ raw }`.
  Start with `text/plain`; HTML multipart is a later nicety.
- On success, extend the venue's `contactLog` sent entry with `{ threadId, messageId }`
  (schema is additive — older entries without these still work everywhere).
- Compose overlay (`composeSend` in `VenueModal`): when connected, add a primary
  "Send via Gmail" action; keep mailto/Gmail-web/Copy/Mark-sent as fallbacks.
  The existing `recordOutreach` already handles status bump + logging — reuse it.

### Reply detection
- On venue-modal open (and/or app mount), for venues whose log has sent entries with
  `threadId` and whose status is still `contacted`:
  `GET /gmail/v1/users/me/threads/{threadId}?format=metadata&metadataHeaders=From`.
  If the thread contains a message whose `From` is not the connected user → call
  `onUpdateVenue` with `status: 'responded'`. The §9i status-event logging then feeds
  the Outreach Performance dashboard automatically — no extra wiring.
- Throttle: check at most ~50 threads per open, sequentially; skip venues checked in
  the last few hours (stamp `lastReplyCheckAt` on the venue).

### Where things live (current code map)
- Compose machinery: `VenueModal` in `index.html` — `fillTemplate`, `openCompose`,
  `composeSend`, `recordOutreach` (all near the top of the component).
- Status-transition logging: `updateVenue` in the App component (search
  `kind: 'status'`).
- Dashboard that consumes the data: `renderAnalyticsTab` → `outreachSection`
  (search `Outreach Performance`).
- Settings UI candidates: the EPK & Templates tab (`renderSettingsTab`) or a small
  "Gmail" block inside the compose overlay footer.

### Verification recipe (sandbox cannot reach Google)
The agent proxy 403s `accounts.google.com` / `googleapis.com`, so live OAuth cannot
run here. Follow the established pattern (§2 + the 2026-07 passes): Babel
compile-check, `npm test`, then the headless Playwright drive with
`page.route('**/gmail/v1/**', …)` fixtures — assert (1) send POST carries a base64url
`raw` and logs `threadId`, (2) a fixture thread containing a foreign `From` flips the
venue to Responded and shows up in the dashboard, (3) disconnected state leaves every
existing compose path untouched, 0 page errors. Screenshot the connected compose
overlay for the PR.

### Out of scope for the first PR
Open/click tracking, HTML templates, attachments (link the EPK instead), scheduled
sends, and multi-account support. Keep the first PR: connect → send → detect → done.
