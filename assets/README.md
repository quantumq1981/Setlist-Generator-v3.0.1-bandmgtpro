# assets

Brand assets for BandLeaderHQ. All are lightweight (no multi-MB images ship).

- `icon.svg` — rounded-tile monogram, used as the scalable browser-tab favicon
  (`<link rel="icon" type="image/svg+xml">`).
- `icon-square.svg` — full-bleed source of the raster app icons (no transparent
  corners, so iOS/Android home-screen masks crop cleanly).
- `icon-512.png` — 512×512 raster of `icon-square.svg`; the PWA manifest icon and
  the Apple touch icon (the OS downscales it).
- `og-image.png` — 1200×630 social share card (`og:image` / `twitter:image`).

Regenerating the rasters (no ImageMagick/rsvg in the sandbox — use headless
Chromium): render `icon-square.svg` inline at 512×512 and screenshot; downscale
that PNG for any smaller sizes via a raster `<img>` (SVG intrinsic sizing is
unreliable below ~512px in headless Chromium). See the PR that introduced them.
