# HANDOFF — Elapsum (elapsum.com)

> Orientation for continuing work in a fresh Claude session.
> Read this + README.md; SPEC.md governs design decisions;
> `_temp/ELAPSUM-HANDOFF.md` + `_temp/days-counter-v3.html` are the
> original behavior spec this was built from.

## What this is

Single-user days-counter PWA (since/until/periods/yearly). Vanilla
HTML/CSS/JS, no build step — `_site/` is hand-authored source AND web
root, committed to git. Repo: https://github.com/dahlskebank/elapsum.com
(public). Domain elapsum.com acquired 2026-07-18; go-live checklist in
DEPLOY.md still pending (DNS/webhotel, LE cert, GA property).

## Architecture

- `_site/model.js` — pure logic; `storage.js` — localStorage (key
  `days.slate.v1`) + import/export; `app.js` — DOM + state.
- `_site/sw.js` — cache-first shell. **Bump CACHE + APP_VERSION (app.js)
  + sitemap lastmod on every deploy.**
- Update lifecycle: sw.js skipWaiting+claim pairs with app.js's
  hadController-gated, overlay-deferred reload — first install never
  reloads, updates wait until no sheet is open.
- Desktop ≥992px shows the deck (landing + QR), not the app.
- Tests: `node _dev/run-tests.mjs` (35). Acceptance vs the real backup:
  `node _dev/acceptance-backup.mjs` (needs `_temp/backup.txt`, gitignored).

## Local dev

- hosts: `127.0.0.1 elapsum.com` (done). Vhost:
  `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf` → `_site/`
  (Laragon had auto-created it pointing at the shared laragon.crt —
  corrected to the dedicated cert; the shared cert has no elapsum SAN
  and Chrome silently blocks the SW with it).
- Cert `E:\vlaragon\etc\ssl\elapsum.crt|key` (SAN elapsum.com + www,
  valid to 2036) — must be certutil-trusted once (admin) + Apache
  restarted. UNDONE as of 2026-07-18 — Daniel's step.
- Quick loop: `npx http-server _site -p 8331 -c-1`. Pixel testing:
  Chrome USB port forwarding (recipe in DEPLOY.md).

## Open items (2026-07-18)

1. Daniel: certutil-trust the cert + restart Apache + verify
   https://elapsum.com loads with the SW registering.
2. Daniel: on-device walkthrough (SPEC §10 list — import ×2/dedupe,
   merge → 21 cards, yearly card, drag-vs-search, undo, formats,
   offline, deck, install). Gestures were ported untested from v3 —
   tuning expected (original handoff §7).
3. Go-live checklist in DEPLOY.md (DNS/webhotel, LE cert, GA_ID paste,
   .htaccess cache re-enable + HSTS, Search Console).
4. Iteration-2 ideas: SPEC §12 (flexible recurrence — every N days /
   weekday / Nth-of-month — matters for the widget-app future).

## Conventions

Tabs (ported v3 regions keep their 2-space indent); educational
comments; WTFPL; version in three places (see DEPLOY.md); never add
swipe-to-delete; never render letterforms in the E-mark's bars grammar
(wordmark = E-mark + Archivo Expanded type); `_temp/` is read-only
history; `_dev/` is never deployed.
