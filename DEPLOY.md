# Deploying BandLeaderHQ (GitHub Pages + custom domain)

BandLeaderHQ is a fully static, no-build app (React + Babel Standalone in the
browser). Every path is relative, so it serves correctly from a project URL or a
root custom domain with no code changes. There is nothing to compile — Pages
serves the repo as-is.

## 1. Turn on GitHub Pages (works today, before you own a domain)

1. Push to `main` (this repo already builds nothing).
2. Repo → **Settings → Pages**.
3. **Source:** *Deploy from a branch* → Branch **`main`**, folder **`/ (root)`** → Save.
4. Wait ~1 min. Your site is live at:
   `https://quantumq1981.github.io/Setlist-Generator-v3.0.1-bandmgtpro/`

That URL is ugly and tied to the repo name — the custom domain below replaces it.
(Optionally rename the repo to `bandleaderhq` in Settings first; Pages will then
serve `https://quantumq1981.github.io/bandleaderhq/`. Renaming keeps issues/PRs.)

## 2. Point a custom domain at it (once purchased)

Buy a domain (e.g. `bandleaderhq.com`) from any registrar, then:

**DNS records at your registrar** — apex + www:

| Type  | Host | Value |
|-------|------|-------|
| A     | @    | 185.199.108.153 |
| A     | @    | 185.199.109.153 |
| A     | @    | 185.199.110.153 |
| A     | @    | 185.199.111.153 |
| CNAME | www  | quantumq1981.github.io. |

**In the repo:**

1. Add a `CNAME` file at the repo root containing exactly your domain
   (one line, e.g. `bandleaderhq.com`) — or set it via Settings → Pages →
   Custom domain, which creates the file for you.
2. Settings → Pages → wait for the DNS check to pass, then tick
   **Enforce HTTPS** (GitHub provisions a free certificate; can take up to ~24 h).

## 3. After the domain is live — update absolute URLs

Two spots hardcode the interim Pages base for social/SEO. Swap
`https://quantumq1981.github.io/Setlist-Generator-v3.0.1-bandmgtpro` → `https://<your-domain>`:

- `index.html` `<head>` — `canonical`, `og:url`, `og:image`, `twitter:image`
  (there is a comment marking the block).
- `404.html` already redirects to `/`, which is correct on a custom domain.

That's the whole deploy. No Actions workflow is required for branch-based Pages;
add one only if you later introduce a build step (there is none today).

## 4. Shipping a release

- **Bump `SHELL_VERSION` in `sw.js`** (e.g. to the release date). The service worker serves
  the app network-first, so users get a new build on their next load either way; the bump
  retires the old offline copies.
- **Changing a CDN library version** means updating three things together: the `<script>` URL,
  its `integrity` hash (`curl -sS <url> | openssl dgst -sha384 -binary | base64`), and the
  matching entry in `sw.js` `CDN_PRECACHE`. `npm test` (`test/supply-chain.test.js`) fails if
  any of them is missing or a version is not exact.
