---
name: design-conventions
description: >-
  Engineering + design conventions for the BandLeaderHQ single-file app
  (index.html + featureHelp.js / InfoModal.jsx / InfoTrigger.jsx). Use this
  whenever you touch styling, theming, colors, fonts, layout, components,
  the header/band bar, PDF or EPK output styling, a rebrand, favicon/icons,
  or any UI/UX change in this repo — even a "quick" CSS tweak. It encodes the
  no-build constraint, the localStorage-key immutability rule that protects
  users' data, the three separate theming surfaces, the shared component
  patterns to reuse, the genre-color triple-sync rule, and the mandatory
  verification loop. Read it BEFORE editing so a change doesn't silently
  break the app, orphan saved data, or diverge one of the three color systems.
---

# BandLeaderHQ — design & engineering conventions

BandLeaderHQ (formerly "Setlist Generator Pro") helps working bands build
optimized setlists, run venue outreach/bookings, and share a press kit. It is a
**single-file React app**: nearly everything is `index.html` (~14k lines) plus
three `text/babel` companions (`featureHelp.js`, `InfoModal.jsx`,
`InfoTrigger.jsx`). Read `CLAUDE.md` for the full architecture and feature
history; this skill is the narrower "how to change the look without breaking
things" guide.

## The non-negotiables (why they matter)

### 1. No build step — ever
React 18 + Babel Standalone transpile JSX **in the browser**. There is no
bundler, no npm runtime dependency, no framework. A design change ships as plain
CSS in the single `<style>` block and JSX in the `text/babel` script. Do not
introduce Tailwind build tooling, a component library that needs compilation, or
an import statement — none of it runs here. Utility classes copied from
shadcn/Tailwind must be hand-translated to real CSS.

### 2. Never rename a `localStorage` key string
Every persisted key is `setlist_*`-prefixed (`LS_KEYS` factory in `index.html`;
`PDF_SETTINGS_STORAGE_KEY`; the backup restore filter
`k.startsWith('setlist_')`). These strings are the on-disk contract with every
existing user's saved bands, songs, venues, bookings, and EPK. **Renaming a key
orphans real data.** Rebrand *display* strings freely; leave key strings alone.
If a key genuinely must change, ship an explicit load-time migration that reads
the old key and writes the new one — never a bare rename.

### 3. There are THREE independent theming surfaces — keep them coherent
A visual change usually has to be made in all three, or they drift:

| Surface | Where | Notes |
|---|---|---|
| **App UI** | the single `<style>` block, `:root` custom properties | `--accent` (orange), `--primary/secondary/text/...`, and ~90 `--style-*` genre vars |
| **EPK export** | `buildEPKHtml` — a separate `:root`/CSS built as a JS template string | its own accent + fonts; does **not** inherit the app theme |
| **PDF export** | `PDF_PALETTE` — RGB-array JS constant, plus `PDF_FONT_FAMILIES` | jsPDF colors as `[r,g,b]`; unrelated to the CSS vars |

When you recolor the brand, grep for hard-coded hex too (e.g. `#ff6b35`,
`rgba(255,107,53,…)`) — several focus rings, shadows, and inline
`style={{ color }}` overrides bypass the `--accent` var and must be updated by hand.

## Reuse these — don't re-hardcode

- **Genre badges + energy dots:** `StyleBadge({ song })` and `EnergyMeta({ song })`.
  Every row (library, setlist, unused-songs) renders them. Extend these, don't
  inline a new badge.
- **Buttons:** `.btn`, `.btn-primary`, `.btn-small`, `.btn-toggle-active`. Prefer a
  class over a new inline style; if you need an accent variant, add a modifier class.
- **Panels / modals:** `.panel` / `.panel-header` / `.panel-title`; `.modal-backdrop` +
  `.modal`; the `InfoModal.jsx` `.info-modal-*` family for help popups.
- **Contextual help:** the `featureHelp.js` (`window.featureDefinitions`) +
  `InfoTrigger` + `InfoModal` trio. To add help for a feature, add a definition
  and drop an `<InfoTrigger>` — don't invent a new tooltip mechanism.

## The genre-color triple-sync rule

A style/genre lives in **three** places that must stay in lockstep (see CLAUDE.md
§4): `GENRE_DATABASE`/`GENRE_PARAMS`+`ENERGY_MAP`, the `--style-slug` CSS var **and**
its `.style-slug` badge class, and the `STYLE_GROUPS` editor dropdown. Adding or
recoloring a genre means updating all three (badge slug = `style.replace(/\s+/g,'-')`).

## Design direction (BandLeaderHQ brand)

- **Palette:** orange × blue complementary. **Blue is primary** (HQ/pro/trust);
  the legacy `#ff6b35` **orange is the secondary/energy accent** — demoted, not
  removed. Deep near-black base, disciplined neutrals, real elevation.
- **Motifs** (from the logo): network constellation (the venue/prospecting graph),
  soundwave "B" monogram, hexagon node. Translate them into flat SVG/CSS — dividers,
  icons, empty-state art.
- **Fonts:** Space Mono for display/data, Manrope for text. Retire Oswald from the
  app (reserve for print/PDF).
- **Brand imagery is edge-only.** The logo's 3D-chrome/photographic hero treatment
  is for splash/landing/OG image — **never an app-wide background**. Dense data
  screens (chord charts, venue tables, the setlist grid) need calm chrome; a busy
  backdrop is exactly why the old 17 MB image was removed. Keep the app backdrop a
  lightweight CSS gradient.
- **Icons:** `assets/icon.svg` (scalable favicon), `assets/icon-square.svg` (full-bleed
  raster source), `assets/icon-512.png` (PWA/Apple), `assets/og-image.png` (social).
  No multi-MB images ship. Regenerate rasters with headless Chromium (see
  `assets/README.md`) — there is no ImageMagick/rsvg in the sandbox.

## Verify before you push (always)

The sandbox has no CDN access, so verification is a fixed recipe (CLAUDE.md §2):

1. **Babel compile-check** every edited `text/babel` file — a JSX syntax error is a
   blank page, not a test failure:
   `require('@babel/standalone').transform(code, { presets: ['react'] })`.
2. **`npm test`** — the dependency-free pure-algorithm suite (Node's `node:test`).
   Design changes shouldn't touch logic, but run it to prove they didn't.
3. **Headless render** (vendor libs from npm, rewrite CDN `src`→`node_modules`, serve
   over http, drive Chromium at `/opt/pw-browsers/…`). Assert `pageerror` count is 0
   and the changed surface is present. Screenshot it for the PR.

A visual change that compiles but throws at runtime still ships a blank page — the
headless render is what catches that. Don't skip it.
