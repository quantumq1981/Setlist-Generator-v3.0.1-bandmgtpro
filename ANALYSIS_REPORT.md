# Venue Outreach × EPK — Deep Analysis & Enhancement Report

**Author:** Claude (automated analysis)
**Date:** 2026-08-03
**Scope:** `Setlist-Generator-v3.0.1-bandmgtpro` (venue outreach feature) ↔ `chriszemba-EPK` (live at `zembamusicco.com`)
**Branch:** `claude/epk-venue-outreach-analysis-wojkxy`

---

## 1. Executive summary

The two projects are individually strong but **have drifted apart**. They were built by parallel
efforts and now describe the same artist through two disconnected surfaces:

- **The app** (`Setlist-Generator`) is a mature, backend-free outreach CRM: pipeline, mass
  messaging, Gmail send + reply detection, sequences, a learning loop, and a per-venue EPK
  link-tagging scheme (`?act=<format>&track=<token>`).
- **The EPK** (`chriszemba-EPK`) is a polished, mobile-first static site on a branded domain
  (`zembamusicco.com`) with a **purpose-built venue cut** (`/venues/`), a working booking form,
  Plausible analytics, rich JSON-LD, and downloadable one-sheet / rider / repertoire PDFs.

**The central problem: the outreach engine and the EPK do not know about each other.**

1. **The app never points venues at the venue cut.** It sends `https://bit.ly/Chris-Zemba-EPK`
   (a redirect to the *generic* GitHub Pages site), not the tailored, budget-ladder-free
   `https://zembamusicco.com/venues/` that was built precisely for bookers.
   ([`index.html:1057`](index.html))
2. **The attribution loop is open at both ends.** The app appends a per-venue `?track=<token>`,
   but the EPK **ignores `?track` and `?ref` entirely** — it only reads `?act`
   ([`chriszemba-EPK/index.html:1677-1681`](../chriszemba-EPK/index.html)). Plausible never
   records the token, and the booking form carries **no hidden field** identifying which venue
   or outreach produced the inquiry. So "which buyer clicked / booked" — the entire premise of
   §9m/§9o in `CLAUDE.md` — is currently **unmeasurable end-to-end**.
3. **Canonical data lives in the EPK but the app ships blanks.** `EPK_SETTINGS_DEFAULT` has
   `contactEmail: ''`, `contactPhone: ''`, `website: ''`
   ([`index.html:1148-1149`](index.html)), yet the EPK already publishes
   `booking@zembamusicco.com`, `(702) 706-2145`, and `zembamusicco.com`. Every outreach email
   sent before the user manually fills those fields goes out with an **empty signature block**.
4. **Even the `?act` tag is half-wired.** The app emits `act=band` and `act=trio`, but the EPK's
   deep-link handler only maps `solo`/`duo`→acoustic and `late_shift`→lateshift — **`band` and
   `trio` fall through** even though a `band` media tab exists.

None of this requires a backend to fix. The highest-leverage work is **~1 day of edits across
both repos** to (a) target the venue cut, (b) read the tracking token on the EPK and echo it into
Plausible + a hidden form field, and (c) sync the canonical contact/media data. The rest of this
report quantifies the gaps and lays out a prioritized, phased plan.

---

## 2. Current-state assessment

### 2.1 The EPK (`chriszemba-EPK`)

| Aspect | Finding | Reference |
|---|---|---|
| Hosting | Static site, GitHub Pages, custom domain `zembamusicco.com` (CNAME). No backend, no API. | `CNAME`, `HOSTING.md` |
| Architecture | `index.html` is the **single source of truth**; audience cuts are *generated* by `build.mjs` from `src/variants.json`. No copy-paste drift. | `README.md`, `build.mjs` |
| Venue cut | `/venues/index.html` — tailored `<title>`/hero copy, `hideBudgetLadder: true`, canonical `https://zembamusicco.com/venues/`. Purpose-built for bookers. | `src/variants.json` |
| Booking form | Posts to FormSubmit.co `/ajax/booking@zembamusicco.com`; fields: name, email, phone, date, venue, event_type, music_style, ensemble, sound/lighting; honeypot; AJAX with inline confirmation. | `index.html:1427` |
| Analytics | Plausible (`data-domain="zembamusicco.com"`) with file-downloads + outbound-links + **tagged-events**; fires `plausible('Booking Inquiry')` on submit. | `index.html:150, 1800` |
| Deep-linking | Reads `?act=` → opens a media tab. **Only `solo`/`duo`/`late_shift` handled.** Ignores `?track`, `?ref`, and UTM. | `index.html:1677-1681` |
| Structured data | Rich JSON-LD: Organization, Person, MusicGroup ×3, WebSite, FAQPage, ContactPoint. Excellent SEO/AI-agent readiness. | `index.html` `<head>` |
| Downloadable assets | `chris-zemba-one-sheet.pdf`, `zemba-music-corporate-repertoire.pdf`, `zemba-music-tech-rider.pdf`, `zemba-music-press-photos.zip`. | `assets/downloads/` |
| Mobile-readiness | Tailwind responsive, click-to-load YouTube/SoundCloud facades, lazy images, `prefers-reduced-motion`, `preconnect`. **Strong — bookers-on-phones are well served.** | `index.html` |
| Contact of record | `booking@zembamusicco.com`, `(702) 706-2145`, `linktr.ee/chriszemba`. | `index.html:1406-1415, 916` |

**Verdict:** The EPK is production-grade and mobile-first. Its only outreach-relevant weaknesses
are *inbound plumbing*: it does not capture the tracking token, and its booking form does not
record where an inquiry came from.

### 2.2 The app's outreach feature (`Setlist-Generator`)

| Aspect | Finding | Reference |
|---|---|---|
| Platform | Single-file React, no backend, `localStorage`. Outreach logic in `VenueModal` + module-scope helpers. | `CLAUDE.md §1` |
| EPK target | `EPK_LIVE_URL = 'https://bit.ly/Chris-Zemba-EPK'` — a redirect to the **generic** site, not the venue cut. | `index.html:1057` |
| Link tagging | `epkLinkForVenue()` appends `?act=<format>&track=<token>` (tokened venues) or `?ref=<slug>` (legacy). | `index.html:1308-1318` |
| Default EPK data | `contactEmail`, `contactPhone`, `website` all **blank**; `linktree` duplicates the bit.ly EPK link; demo/gallery/rider/testimonials blank. | `index.html:1148-1149` |
| Templates | 7 templates (outreach, followup, tailoredPitch, callRequest, postGig, bookingConfirmation, +Let's Connect). Reference `{{epk_link}}`, `{{linktree}}`. | `index.html:1087-1118` |
| Personalization | `suggestForVenue()` builds a venue-type-tailored pitch + 6 song picks **from the local song library** by keyword/energy. | `index.html:8155-8213` |
| Outreach ops | Sequences (`nextActionFor`), daily cap 25, Gmail send + reply detection, learning loop, Prospector, Vegas directory. Genuinely advanced. | `CLAUDE.md §9j–§9n` |
| EPK awareness | **Zero** references to `zembamusicco.com`, the `/venues/` cut, the one-sheet PDF, or UTM parameters anywhere in the app. | (verified by grep) |

**Verdict:** The outreach machinery is excellent. Its weakness is that it treats the EPK as a
single opaque URL, unaware of the branded domain, the venue cut, the downloadable proof assets, or
the analytics waiting on the other side.

---

## 3. Current data flow (and where it breaks)

```
   APP (Setlist-Generator, localStorage)                 EPK (zembamusicco.com, static)
   ┌──────────────────────────────────┐                 ┌──────────────────────────────────┐
   │ Venue { trackingToken,           │   email w/       │  / (full EPK)                    │
   │        preferredFormat }         │   {{epk_link}} = │  /venues/ (tailored cut) ◄── NOT │
   │ fillTemplate() ──► epkLinkForVenue│──────────────►  │       TARGETED by the app        │
   │   bit.ly/Chris-Zemba-EPK         │  ?act&track      │  reads ?act ✓ (solo/duo/lateshift)│
   │   ?act=<fmt>&track=<token>       │                  │  reads ?track ✗   reads ?ref ✗   │
   └──────────────────────────────────┘                 │  Plausible: token NOT captured ✗ │
              ▲                                          │  Booking form → FormSubmit       │
              │ reply detection (Gmail API) ✓            │    NO hidden venue/token field ✗ │
              │                                          └──────────────────────────────────┘
              │                                                        │
              │        ✗ BROKEN: booking-form conversions             │
              └──────────────────────────────────────────────────────┘
                       never flow back to the venue that was pitched
```

**Two loops exist; one works, one is broken:**

- ✅ **Email-reply loop** (works): Gmail reply detection flips `contacted → responded` and feeds
  the Outreach Performance dashboard (`CLAUDE.md §9j`).
- ❌ **Web-engagement / booking-form loop** (broken): a booker who clicks the EPK link or submits
  the booking form generates **no signal the app can attribute** to the venue that was pitched.
  The `track` token is dead weight because the EPK discards it.

---

## 4. Gap analysis

| # | Gap | Current behavior | Desired behavior | Severity |
|---|-----|------------------|------------------|----------|
| G1 | **Venue cut not used** | App links generic bit.ly → full EPK | Link `zembamusicco.com/venues/` (budget-ladder hidden, venue hero copy) | 🔴 High |
| G2 | **Tracking token ignored** | EPK never reads `?track`/`?ref` | EPK reads token → Plausible prop + sessionStorage | 🔴 High |
| G3 | **Booking form has no attribution** | Inquiry email doesn't say which venue/token | Hidden `venue`/`track`/`act`/`source` fields on the form | 🔴 High |
| G4 | **Canonical contact blank in app** | `contactEmail/Phone/website` = `''` → empty signatures | Seed defaults from EPK (`booking@zembamusicco.com`, `(702) 706-2145`, `zembamusicco.com`) | 🔴 High |
| G5 | **`?act` half-mapped** | `band`/`trio` fall through on the EPK | Map `band`/`trio` to the `band` tab | 🟠 Med |
| G6 | **Proof assets unused** | One-sheet / rider / repertoire PDFs never linked in outreach | Offer one-sheet PDF + tech rider as merge tags | 🟠 Med |
| G7 | **Pitch ignores EPK credibility** | Tailored pitch uses only the local song list | Inject FOX5 / Review-Journal / casino-residency proof | 🟠 Med |
| G8 | **No UTM standardization** | Only custom `track` param; Plausible needs config to see it | `utm_source/medium/campaign` + `track` | 🟠 Med |
| G9 | **Manual data sync** | Contact/media edited in two places, drift guaranteed | EPK build emits `epk.json`; app "Sync from EPK" pulls it | 🟡 Low |
| G10 | **bit.ly redirect fragility** | Assumes bit.ly forwards query params & preserves referrer | Point directly at the domain (no redirect hop) | 🟡 Low |
| G11 | **No A/B on subjects** | One subject per template | Rotate 2 subject variants, measure via dashboard | 🟡 Low |

---

## 5. Best-practices context (music-booking outreach in 2026)

- **Send the *tailored* asset, not the front door.** Bookers decide in seconds; a venue-specific
  cut with the money question de-emphasized and "easy to book" up front converts better than a
  full EPK. The EPK already ships `/venues/` — the app just has to use it. *(→ G1)*
- **Close the attribution loop or you're flying blind.** Every serious outreach stack ties a click
  and a form submit back to the specific recipient. Without G2+G3, the app's learning loop
  (`CLAUDE.md §9n`) can only learn from *email replies*, missing every buyer who clicks or books
  through the web form. *(→ G2, G3, G8)*
- **Personalize with proof, not just repertoire.** "We fit your Friday crowd" is weaker than
  "As seen on FOX5, featured in the Las Vegas Review-Journal, casino-lounge residencies at Sam's
  Town and Planet Hollywood." The EPK is full of this proof; the pitch generator uses none of it.
  *(→ G7)*
- **A one-sheet PDF is the currency of booking.** Talent buyers forward PDFs internally. Linking
  the existing `chris-zemba-one-sheet.pdf` (and tech rider for advancing) makes the app's emails
  match how buyers actually work. *(→ G6)*
- **Sequence cadence is already right.** 7-day steps, 4 sends, 25/day cap
  (`SEQUENCE_STEP_DAYS`, `MAX_SEQUENCE_SENDS`, `DAILY_OUTREACH_CAP`) match deliverability best
  practice — keep it. The improvement is **engagement-aware prioritization** (surface venues that
  clicked), which G2 unlocks.
- **Mobile-first is handled.** The EPK is responsive with click-to-load media and reduced-motion.
  No action needed — note it as a strength.

---

## 6. Prioritized recommendations (with code hints)

> Effort: **L** ≈ <2 h · **M** ≈ half-day · **H** ≈ 1–2 days. Each app-side change follows the
> `CLAUDE.md §2` verification recipe (Babel compile → `npm test` → headless Playwright drive).

### P0 — Reconnect the two systems (highest ROI, ~1 day total)

#### R1 · Target the venue cut & seed canonical data — *App, effort L, impact High* (G1, G4, G10)

The empty-field backfill loader (`CLAUDE.md §9h`) means updating these defaults **auto-populates
existing installs** that never customized the fields.

```js
// index.html — module scope
// Point venue outreach at the tailored, branded venue cut (no redirect hop).
const EPK_SITE_URL  = 'https://zembamusicco.com';
const EPK_LIVE_URL  = 'https://zembamusicco.com/venues/';   // was bit.ly/Chris-Zemba-EPK

// EPK_SETTINGS_DEFAULT — seed the values the EPK already publishes
contactEmail: 'booking@zembamusicco.com',   // was ''
contactPhone: '(702) 706-2145',             // was ''
website:      'https://zembamusicco.com',    // was ''
linktree:     'https://linktr.ee/chriszemba',// was the duplicate bit.ly link
epkUrl:       EPK_LIVE_URL,
```

#### R2 · Read the tracking token on the EPK & echo it into analytics + the form — *EPK, effort M, impact High* (G2, G3)

This is the single most valuable change — it turns the dead `track` token into real attribution.
Add one script and four hidden inputs to `chriszemba-EPK/index.html` (and it flows to `/venues/`
automatically on the next `npm run build`, since cuts are generated from `index.html`).

```html
<!-- chriszemba-EPK/index.html — after the Plausible snippet -->
<script>
  (function () {
    var q = new URLSearchParams(location.search);
    var tag = { track: q.get('track') || '', ref: q.get('ref') || '', act: q.get('act') || '' };
    try { sessionStorage.setItem('epkTag', JSON.stringify(tag)); } catch (e) {}
    // Attribute the pageview to the venue so Plausible shows who clicked.
    if (window.plausible && (tag.track || tag.ref)) {
      plausible('pageview', { props: { venue: tag.track || tag.ref, act: tag.act || 'na' } });
    }
    // Stamp the booking form so an inquiry says which venue/outreach produced it.
    document.addEventListener('DOMContentLoaded', function () {
      var form = document.querySelector('#book form'); if (!form) return;
      [['epk_track', tag.track], ['epk_ref', tag.ref], ['epk_act', tag.act],
       ['source', 'venue-outreach']].forEach(function (kv) {
        if (!kv[1] && kv[0] !== 'source') return;
        var i = document.createElement('input');
        i.type = 'hidden'; i.name = kv[0]; i.value = kv[1]; form.appendChild(i);
      });
    });
  })();
</script>
```

Then in the `plausible('Booking Inquiry')` call (`index.html:1800`), pass the tag as a prop so the
**conversion** is attributed too:

```js
if (window.plausible) {
  var tag = JSON.parse(sessionStorage.getItem('epkTag') || '{}');
  plausible('Booking Inquiry', { props: { venue: tag.track || tag.ref || 'direct', act: tag.act || 'na' } });
}
```

**Result:** Plausible's "Booking Inquiry" goal, broken down by the `venue` custom property, shows
exactly which pitched venues clicked *and* which submitted the form — and the inquiry email that
lands in `booking@` now names the venue. Closed loop, no backend.

#### R3 · Standardize UTM alongside `track` — *App, effort L, impact Med* (G8)

Makes the tags legible to Plausible/GA and any future tool, and lets you slice by template
("which campaign converts"). Extend `epkLinkForVenue`:

```js
const epkLinkForVenue = (epkUrl, venue, opts = {}) => {
  const url = String(epkUrl || '').trim(); if (!url) return '';
  if (!venue) return url;
  const p = new URLSearchParams();
  const format = VENUE_FORMATS.includes(venue.preferredFormat) ? venue.preferredFormat : 'band';
  if (venue.trackingToken) { p.set('act', format); p.set('track', venue.trackingToken); }
  else p.set('ref', epkVenueSlug(venue));
  p.set('utm_source', 'outreach'); p.set('utm_medium', 'email');
  if (opts.template) p.set('utm_campaign', opts.template);
  return url + (url.includes('?') ? '&' : '?') + p.toString();
};
```

### P1 — Make the pitch pull its weight

#### R4 · Add EPK act mapping for band & trio — *EPK, effort L, impact Med* (G5)

```js
// chriszemba-EPK/index.html:1679 — the app already emits act=band and act=trio
if (act === 'solo' || act === 'duo') setMediaTab('acoustic');
else if (act === 'late_shift') setMediaTab('lateshift');
else if (act === 'band' || act === 'trio') setMediaTab('band');   // NEW
```

#### R5 · Surface the one-sheet & rider as merge tags — *App, effort L→M, impact Med* (G6)

The EPK already hosts them. Seed the defaults and add placeholders so templates can offer a
"forward-ready" PDF and an advancing rider:

```js
// EPK_SETTINGS_DEFAULT
oneSheetUrl:  'https://zembamusicco.com/assets/downloads/chris-zemba-one-sheet.pdf',
techRiderUrl: 'https://zembamusicco.com/assets/downloads/zemba-music-tech-rider.pdf',
// fillTemplate() repl map
'{{one_sheet}}': localEpk.oneSheetUrl || '',
'{{tech_rider}}': localEpk.techRiderUrl || '',
```

Then add to `bookingConfirmation` ("tech rider attached for your team: `{{tech_rider}}`") and
`tailoredPitch` ("one-page overview: `{{one_sheet}}`").

#### R6 · Inject EPK credibility into the tailored pitch — *App, effort M, impact Med* (G7)

`suggestForVenue()` currently draws only on the local song list. Add a short, EPK-sourced proof
line so every pitch carries social proof:

```js
// EPK_SETTINGS_DEFAULT.pressNews already exists; add a compact credibility string:
credibility: 'Featured on FOX5 Las Vegas and in the Las Vegas Review-Journal; ' +
             'casino-lounge residencies including Sam\'s Town, Planet Hollywood, and Bally\'s.',
// In suggestForVenue(), append it to the pitch:
pitch += ` ${localEpk.credibility || ''}`.trimEnd();
```

### P2 — Durable sync & optimization

#### R7 · Generate `epk.json` from the EPK build; add "Sync from EPK" in the app — *Both, effort M→H, impact Med* (G9)

Kill the two-places-to-edit problem. `build.mjs` already parses `index.html`; have it also emit a
tiny machine-readable manifest (GitHub Pages serves it CORS-open):

```js
// chriszemba-EPK/build.mjs — after generating cuts
import { writeFileSync } from 'node:fs';
writeFileSync('epk.json', JSON.stringify({
  contactEmail: 'booking@zembamusicco.com',
  contactPhone: '(702) 706-2145',
  website: 'https://zembamusicco.com',
  venueCut: 'https://zembamusicco.com/venues/',
  linktree: 'https://linktr.ee/chriszemba',
  oneSheet: 'https://zembamusicco.com/assets/downloads/chris-zemba-one-sheet.pdf',
  techRider: 'https://zembamusicco.com/assets/downloads/zemba-music-tech-rider.pdf',
  repertoire: 'https://zembamusicco.com/assets/downloads/zemba-music-corporate-repertoire.pdf',
  updatedAt: new Date().toISOString(),
}, null, 2));
```

```jsx
// App — EPK & Templates tab: a "Sync from EPK" button
const syncFromEpk = async () => {
  const r = await fetch('https://zembamusicco.com/epk.json', { cache: 'no-store' });
  const d = await r.json();
  setLocalEpk(prev => ({ ...prev,
    contactEmail: prev.contactEmail || d.contactEmail,
    contactPhone: prev.contactPhone || d.contactPhone,
    website: prev.website || d.website,
    epkUrl: d.venueCut, linktree: d.linktree,
    oneSheetUrl: d.oneSheet, techRiderUrl: d.techRider }));
  showToast('Synced booking details from the live EPK', 'success');
};
```

#### R8 · A/B subject lines & engagement-aware prioritization — *App, effort M, impact Med* (G11)

- Store 2 subject variants per template; alternate per send; the Outreach Performance dashboard
  already attributes replies, so add a per-subject reply-rate bar (mirrors the per-template bars in
  `CLAUDE.md §9i`).
- Once R2 lands, a Plausible "clicked but didn't reply" segment becomes the warmest follow-up
  cohort — surface those venues at the top of "Today's Outreach" (`nextActionFor`).

---

## 7. Implementation roadmap

| Phase | Items | Repos | Effort | Outcome |
|---|---|---|---|---|
| **0 — Reconnect** | R1, R2, R3 | App + EPK | ~1 day | Venue cut targeted; click + form conversions attributed to the pitched venue; empty signatures fixed |
| **1 — Stronger pitch** | R4, R5, R6 | App + EPK | ~1 day | Act deep-links complete; one-sheet/rider offered; every pitch carries proof |
| **2 — Durable sync & optimize** | R7, R8 | App + EPK | ~2 days | Single source of truth for booking data; A/B + engagement-aware sequencing |

**Sequencing note:** R2 (EPK reads token) and R1 (app targets venue cut) should ship *together* —
tagging a venue cut that discards the tag delivers no value, and reading a tag on a URL nobody is
sent is equally inert.

---

## 8. Security & privacy notes

- **No new secrets required.** R1–R8 add no API keys. Plausible props and FormSubmit hidden fields
  are non-sensitive routing metadata (a venue slug and a random base36 token), not PII.
- **`epk.json` is public by design** — it contains only already-published booking contact info and
  asset URLs. Do **not** add anything private to it.
- **CORS:** GitHub Pages serves `epk.json` with permissive CORS, so the app's `fetch` (R7) works
  from any origin without a proxy.
- **Token is opaque:** `trackingToken` is a random 6-char base36 string with no embedded PII;
  it identifies a venue only by cross-referencing the app's local pipeline, which never leaves the
  user's browser.
- Keep the booking form honeypot and FormSubmit `_captcha` handling as-is.

---

## 9. Success metrics (KPIs to track after the changes)

| KPI | Baseline today | Instrument | Target after Phase 0–1 |
|---|---|---|---|
| **EPK click-through per outreach** | Unmeasured (token discarded) | Plausible pageviews w/ `venue` prop (R2) | Establish baseline; ≥ 25% of sends |
| **Booking-form conversions attributed to a venue** | 0% (no hidden field) | "Booking Inquiry" goal × `venue` prop (R2) | 100% of web inquiries attributed |
| **Reply rate (email)** | Tracked (dashboard) | Existing `venueOutcome` | +relative lift from proof/one-sheet |
| **Time-to-first-response** | Untracked | Contact-log timestamps | Establish baseline |
| **Venue-cut vs full-EPK bounce** | N/A (cut unused) | Plausible entry-page report | Lower bounce on `/venues/` |
| **Signature completeness** | Fails until user edits | Manual/EPK meter | 100% out of the box (R1) |
| **Data drift incidents** | Frequent (2 sources) | `epk.json.updatedAt` vs app | 0 after R7 |

---

## 10. Appendix — key code references

**App (`Setlist-Generator-v3.0.1-bandmgtpro/index.html`)**
- `EPK_LIVE_URL` — `:1057`
- `epkVenueSlug` / `epkLinkForVenue` — `:1305-1318`
- `EMAIL_TEMPLATES_DEFAULT` — `:1087-1118`
- `EPK_SETTINGS_DEFAULT` (blanks to seed) — `:1123-1151`
- `BLANK_VENUE` (`trackingToken`, `preferredFormat`) — `:1153`
- `VENUE_TUNING` (pitch tuning) — `:1063-1074`
- `nextActionFor` (sequence brain) — `:1344`
- `suggestForVenue` / `fillTemplate` — `:8155-8213`
- Gmail reply detection — `:8140-8149`

**EPK (`chriszemba-EPK/`)**
- Plausible snippet — `index.html:150`
- Booking form — `index.html:1427`
- `?act` deep-link handler (extend for band/trio) — `index.html:1677-1681`
- `plausible('Booking Inquiry')` on submit — `index.html:1800`
- Venue-cut variant config — `src/variants.json`
- Build/generation — `build.mjs`, `HOSTING.md`
- Downloadable assets — `assets/downloads/`

---

*Prepared as a read-only analysis. No application or EPK code was modified by this report; all
snippets are proposals scoped for the `CLAUDE.md §2` verification workflow.*
