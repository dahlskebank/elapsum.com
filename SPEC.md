# Elapsum — Build Spec (iteration 1)

> Approved design for the first build, 2026-07-17. Behavior spec for the app
> itself is `_temp/days-counter-v3.html` (the working prototype) as annotated
> by `_temp/ELAPSUM-HANDOFF.md` — port it faithfully except where this
> document says otherwise (see "Where the handoff is overruled").
> Structural template is E:\www\sub\30days: hand-authored `_site/` is both
> source and web root, vanilla HTML/CSS/JS, no build step, no npm.

## 1. What this is

A self-hosted PWA replacement for the Android app "Days Counter" (pulled from
Google Play — the whole point is that a self-hosted app can't be taken away).
Counts days **since** and **until** events, tracks **periods** (start→end with
duration + distance from both ends) and **yearly repeating** events.
Phone-first web app; installable; offline-capable. Iteration 1 is the web app —
a native wrapper with widgets is a possible later iteration (see §12).

- **Name:** Elapsum (Latin *elapsum* — "that which slipped away")
- **Motto:** *Tempus elapsum, opus incohatum* (shown on the desktop deck, above the footer links)
- **Logo:** the E-mark — three duration bars + gradient spine (SVG in handoff §2). Brand ramp: tint `#f6b183` · accent `#f07f2e` · shade `#a4561e` (light-bg variants in handoff §2).
- **Wordmark (resolved 2026-07-17, supersedes handoff §2's "parked"):** the E-mark is the ONLY constructed glyph. The wordmark is simply E-mark + "Elapsum" set in Archivo Expanded. **Never attempt letterforms in the bars grammar** — that direction was tried and rejected in the original chat.

## 2. Locked decisions

Everything in handoff §3 stands (vanilla stack; dark default + light toggle;
localStorage key `days.slate.v1`; export/import instead of Drive sync;
no swipe-to-delete ever; Slate design as-is), plus these, decided 2026-07-17:

| Decision | Outcome |
|---|---|
| Stylesheet name | `style.css` — census of all projects under e:\www: 15× style.css (incl. the dfault boilerplate) vs 2× styles.css. 30days is the outlier, not the precedent. |
| JS layout | Three files: `app.js` (UI + orchestration), `model.js` (pure logic: day math, breakdown, recurrence, tint/shade, date tokens, merge-pair detection), `storage.js` (localStorage, migrate, export, both import parsers). |
| Analytics | **GA4 on** — every Daniel project gets GA4, even single-user tools. 30days pattern: `window.GA_ID = ""` + conditional gtag loader; empty string = disabled until the measurement ID is pasted. Overrides handoff §1 "no analytics". |
| Desktop | ≥992px hides the app and shows a 30days-style landing deck (§6). Below 992px the app renders as v3's centered ≤430px column. |
| Site chrome | Full public treatment: OG/Twitter meta + og-image, JSON-LD WebApplication, robots index+follow, sitemap, humans.txt, security.txt, 403/404. |
| Color palette order | Swatch grid sorted by hue (rainbow), neutrals last by lightness (§5). |
| Versioning | Start `v1.0.0`. `APP_VERSION` in app.js + `CACHE` in sw.js + version line in Settings→About; bump all three per deploy. |
| License / git | WTFPL. Git repo with public GitHub remote: github.com/dahlskebank/elapsum.com (created 2026-07-17 at Daniel's request). |

## 3. Where the handoff is overruled

1. **Analytics:** GA4 included (see above).
1a. **Wordmark:** no longer parked — resolved as E-mark + Archivo Expanded type; bars-grammar letterforms permanently rejected (§1).
2. **Manifest icons:** separate `purpose:"any"` and `purpose:"maskable"` PNGs
   (192 + 512 each), not `"any maskable"` on one file — a maskable-safe icon
   looks shrunken when used as a regular icon. Matches 30days.
3. **Desktop view:** landing deck instead of just the centered column.
4. **Palette:** sorted, not the v3 random order.

## 4. Project structure

```
e:\www\dev\elapsum.com\
├── README.md            what/why/how + origin story
├── SPEC.md              this document
├── HANDOFF.md           session-continuation doc (living; created at first build)
├── DEPLOY.md            deploy + local-dev runbook
├── deploy.sh            lftp/SFTP mirror (ported from 30days verbatim)
├── .env.example         DEPLOY_* template; .env is gitignored
├── .editorconfig  .gitignore  LICENSE (WTFPL)
├── _temp\               handoff, v3 prototype, backup.txt (gitignored — personal data)
└── _site\               hand-authored source AND web root
    ├── index.html  style.css  app.js  model.js  storage.js
    ├── sw.js  manifest.webmanifest
    ├── .htaccess  robots.txt  sitemap.xml  humans.txt  favicon.ico  403.html  404.html
    ├── .well-known\security.txt
    └── assets\
        ├── fonts\   Archivo 400/500/600/800 + Archivo Expanded 600, latin woff2, self-hosted
        ├── icons\   icon.svg · icon-192/512.png · icon-maskable-192/512.png · apple-touch-icon.png
        └── img\     og-image.jpg (1200×630) · qr-elapsum.svg
```

## 5. The port — code plan

Port every v3 mechanic as-is (handoff §5): UTC-noon day math, unit breakdown
with calendar-accurate months, yearly recurrence with Feb-29 clamp, tint/shade
spine system, WordPress-style date tokens, midnight rollover, tabs, edge-vs-mid
swipe gestures, long-press drag reorder, pin, delete-with-undo, double-confirm
wipe, FAB hide-on-scroll, live search, brutalist toggle, merge tool.
Educational comments throughout (30days density — Daniel is learning).

Approved fixes folded in (handoff §7):

- Drag-reorder **disabled while search filter is active** (prevents persisting a filtered list as the full custom order).
- Date-token formatter gets **backslash escaping** (`\d` renders a literal d); hint text updated.
- Import **dedupe warning**: same title+date as an existing event → listed and confirmable before append.
- Verify panel `calc(50% - 215px)` positioning on narrow screens (wide-screen case is mooted by the deck).
- `prefers-reduced-motion` kept for all animations.
- Touch gesture thresholds ported as-is; Daniel tunes on-device (tests in production, Chrome on Pixel).

**Palette sort:** the 32 colors sorted once in the source array — chromatic
colors by hue (red→…→pink), low-saturation neutrals appended sorted by
lightness. The 8×4 swatch grid then reads as a rainbow with a neutral tail.
Because neighbours in a sorted array look alike, the default color for a new
event strides through the array with a step coprime to 32 (e.g. every 7th,
wrapping) so consecutive new events stay visually distinct.

## 6. Desktop deck (≥992px)

30days `.deck` pattern: the app shell hides, the landing shows —

- E-mark + "Elapsum" brand, short pitch, and the origin story: built because
  Days Counter was pulled from Google Play; a self-hosted app can't be taken away.
- A line noting the importer accepts the original Days Counter backup format
  (and Elapsum's own exports) — other apps' formats are not supported.
- QR code (`qr-elapsum.svg`) linking to https://elapsum.com/ — "open on your phone" framing.
- Bottom, in order: the motto *Tempus elapsum, opus incohatum* (italic, muted),
  the four dfault network links (labels/URLs from the boilerplate's
  `site.json → footer.links` at build time), then the legal line
  `© 2026 ⌁ <year> → Elapsum.com · v1.0.0`.

## 7. PWA layer

- **manifest.webmanifest:** name + short_name "Elapsum", `id`/`start_url`/`scope` `/`,
  standalone, portrait, background/theme `#101014`, icon set per §3.2.
- **sw.js:** 30days pattern verbatim — versioned cache name (`elapsum-v1.0.0`),
  cache-first, shell cached atomically with `cache:"reload"` and the
  which-file-404'd diagnostic, **`"/"` cached instead of `/index.html`**
  (the clean-URL 301 poisons cached navigations), navigations served from the
  cached shell, cross-origin (GA) passes straight through, skipWaiting +
  clients.claim, one-shot reload on controllerchange.
- **Fonts self-hosted** (the previous attempt's offline bug: Google Fonts CSS
  was precached but the font files weren't). Latin woff2 subsets, first-paint
  faces preloaded.
- **Icons:** E-mark on `#101014` rounded-square tiles; maskable variants keep
  the mark inside the inner 80% safe zone.

## 8. Head, meta, analytics

Full 30days head: title/description/author, canonical `https://elapsum.com/`,
OG + Twitter cards (generated og-image in Slate style), JSON-LD WebApplication,
theme-color `#101014` (swapped by the light-theme toggle at runtime),
apple-touch/mobile-web-app meta, GA4 loader with `GA_ID = ""` until the
property exists.

## 9. Local dev + deploy

- Daniel has added `elapsum.com` to hosts. Build creates
  `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf` (kiande.conf clone,
  ROOT `E:/www/dev/elapsum.com/_site`) and a dedicated cert with an
  `elapsum.com` SAN in `E:\vlaragon\etc\ssl\`. Daniel then runs the one-time
  admin trust step (`certutil -addstore Root E:\vlaragon\etc\ssl\elapsum.crt`) —
  the shared laragon.crt has no elapsum.com SAN and Chrome silently blocks the
  service worker without it (kiande's old "install doesn't work" bug).
- **Domain not acquired yet.** All URLs written for `https://elapsum.com/`;
  deploy.sh/.env.example/DEPLOY.md ship ready; `.env` stays blank and go-live
  (DNS, Domeneshop webhotel, LE cert, GA property, Search Console) is parked
  until acquisition.
- `.htaccess` ships in no-cache test mode with the launch cache block
  commented and marked RE-ENABLE AT LAUNCH, like 30days.

## 10. Acceptance (run against Daniel's real backup.txt, dropped in `_temp\`)

Handoff §9 verbatim: import → 30 events, dates matching the old app; merge
finds exactly 9 pairs (DD1, TB, NPP, DD2, BPC, DD3, PB, ANA, MIX — "Carnivore
Light Start" untouched) → 21 cards; DD3 shows 98/495/397 on 2026-07-17 with
gradient spine; yearly turns-N + countdown; mid-screen swipe switches tabs;
drag order survives reload; undo-delete restores in place; brutalist + light +
custom format `D j. F Y` survive reload; airplane mode → app + fonts load from
SW cache. Plus new: dedupe warning fires on double-import; drag is inert while
searching; deck renders ≥992px with QR + motto + footer.

## 11. Not building (iteration 1)

Letterform wordmark in bars style (REJECTED — never build, see §1) · Capacitor/native wrapper ·
home-screen widgets · milestone highlights · share-card-as-image ·
notifications · Google Drive sync (dropped) · swipe-to-delete (rejected,
never) · dfault.it/projects catalog entry (post-launch).

## 12. Iteration 2 — look into

- **Flexible recurrence** (noted 2026-07-17): beyond yearly — every N days,
  every ⟨weekday⟩, every Nth of the month. Especially relevant once the app
  becomes a native app with widgets. Needs design: recurrence rules in the
  data model (`kind:'yearly'` generalizing to a rule object), next-occurrence
  math, and how such events sort/display in the Yearly tab (rename?).
- **Sidethought, not planned:** 30 Days could live under the elapsum.com
  umbrella (same universe/spirit; 30days has only a subdomain today) — e.g.
  as an app catalog on elapsum.com. Revisit only if Daniel raises it again.
