# CLAUDE.md — Setlist Generator Pro

Authoritative engineering guide for this repository. Supersedes `Agent.MD` (kept
for historical handoff notes). Read this first.

Last updated: 2026-07-12.

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
Feature branch: `claude/epk-venue-messaging-enhance-1xcsu7`. Open PRs against `main`.
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

---

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
