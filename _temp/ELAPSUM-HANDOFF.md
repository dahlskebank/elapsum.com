# Elapsum — Claude Code Handoff

**Owner:** Daniel Dahl
**Origin:** "Recreating the Days Counter app" chat, July 2026
**Deploy target:** elapsum.com (domain being acquired; HTTPS required for PWA install)
**Reference implementation:** `days-counter-v3.html` — a working single-file prototype. It is the spec. Behaviour described below is implemented and testable in that file; port it faithfully unless this doc says otherwise.

---

## 1. What this is

A self-hosted PWA replacement for the Android app "Days Counter" (pulled from Google Play, reason unknown — the whole point is that a self-hosted app can't be taken away). Counts days **since** and **until** events, tracks **periods** (start→end with duration + distance from both ends — the feature the original lacked), and **yearly repeating** events (birthdays).

Single user. Phone-first. No accounts, no backend, no analytics.

## 2. Identity (locked)

- **Name:** Elapsum (Latin *elapsum* — "that which slipped away")
- **Logo:** the E-mark — three horizontal duration bars (tint / accent / shade) joined by a vertical gradient spine, forming a letter E. SVG:

```svg
<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
  </linearGradient></defs>
  <line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#eg)" stroke-width="3.6"/>
  <line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
  <line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
  <line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
</svg>
```

- Brand ramp: tint `#f6b183` · accent `#f07f2e` · shade `#a4561e`. On light backgrounds use `#e89a5e` / `#d96a1e` / `#8f4413`.
- Replace the current header logo in v3 (a different draft glyph) with the E-mark. App name string "Days Counter" → "Elapsum" everywhere (header, `<title>`, manifest, about).
- **Parked idea (do NOT build yet):** rendering the full wordmark "Elapsum" in the bars style. Dahl wants to ponder this later.

## 3. Decisions locked — do not relitigate

| Decision | Outcome |
|---|---|
| Stack | Vanilla HTML/CSS/JS. **No frameworks, no build step, no npm.** Splitting the single file into `index.html` + `style.css` + `app.js` is fine and preferred for maintainability. |
| Theme | Dark default; light theme toggle exists. |
| Storage | localStorage, key `days.slate.v1` (keep the key — Dahl may have test data). JSON export/import as backup. |
| Google Drive sync | **Not in scope.** An earlier incarnation had it; dropped in favor of export/import. |
| Widgets / native | Deferred. Capacitor is the eventual path; do not scaffold now. |
| Swipe-to-delete | Explicitly rejected. Never add it. |
| Design | The "Slate" look in v3. Do not redesign. Dahl explicitly rejected warm-editorial-serif aesthetics. |

## 4. Data model

```js
// state (localStorage 'days.slate.v1')
{
  events: [{
    id: Number,            // unique, monotonic
    title: String,
    desc: String,
    date: "YYYY-MM-DD",    // date-only strings everywhere; day math via UTC-noon
    end: "YYYY-MM-DD"|null,// only for kind 'range'; null = ongoing period
    kind: 'single'|'range'|'yearly',
    units: {y,m,w,d}|null, // per-event display units; null = days only
    pinned: Boolean,
    color: "#rrggbb",      // from the 32-color palette
    added: Number          // ms epoch
  }],
  sort: 'custom'|'title_asc'|...|'dur_desc'|'added_desc',
  order: [ids],            // custom drag order (counters only)
  settings: {
    theme:'dark'|'light', brutal:Boolean, gradient:Boolean,
    dateFmt: pattern|'CUSTOM', dateFmtCustom: String
  }
}
```

Migration: older saves may have `isRange` instead of `kind`, and lack `units`/`pinned`. `migrate()` in v3 handles it — keep it, applied on load AND on import.

**Import formats (both must keep working):**
1. Own export: `{app, version, events, order, settings}`
2. Original Days Counter backup: raw array of `{id, title, description, date(ms), addition_date, widget_id}` → map ms→local date string, kind 'single'. Dahl's real `backup.txt` (30 events) is the acceptance test.

**Merge tool:** detects `"X Start"` + `"X End"` singles (regex also matches `ca End`, `slutt`), previews with checkboxes, collapses each pair into one range. Against Dahl's backup it must find exactly 9 pairs: DD1, TB, NPP, DD2, BPC, DD3, PB, ANA, MIX — and leave "Carnivore Light Start" untouched.

## 5. Core mechanics (implemented in v3 — port as-is)

- **Day math:** date strings → `Date.UTC(y,m-1,d,12)`; diff/86400000 rounded. DST-safe.
- **Unit breakdown:** cascade through enabled units largest→smallest; months are calendar-accurate with month-end clamping (Jan 31 + 1m = Feb 28); leading zero units trimmed. Verified: 165d = 23w 4d; 2023-03-23→2026-07-17 = 3y 3m 24d.
- **Yearly recurrence:** next occurrence this year or next; Feb 29 clamps to Feb 28 in non-leap years; `turns = nextYear - birthYear`; daysUntil 0 → "turns N today" celebration state.
- **Tint/shade system:** `tint = mix(color, #fff, .45)`, `shade = mix(color, #000, .32)` (dark theme; light theme .18/.38). Gradient spine on closed ranges runs tint→shade; "Since start" stat uses tint, "Since end" uses shade, Duration neutral. This mapping is intentional — spine top = start, bottom = end.
- **Date formatting:** WordPress-style tokens `d j m n y Y M F D l`. No escape character yet (see §7).
- **Midnight rollover:** setTimeout to 00:00:05, re-render, reschedule.
- **Tabs:** Counters / Yearly. Yearly self-sorts by daysUntil; FAB pre-selects kind by active tab.
- **Gestures:** mid-screen horizontal swipe = tab switch (60px threshold); **edge** swipe (≤28px from viewport edge) = slide panels (left edge → sort panel, right edge → settings), slideout.js-style (panels underneath, content translates). Header icons open the same panels.
- **Drag reorder:** long-press 350ms lifts card (haptic via navigator.vibrate), drag reorders live, release persists to `order` and switches sort to 'custom'. Counters tab only. Mouse fallback exists.
- **Pin:** toggle in edit sheet; pinned float above everything in every sort mode.
- **Delete:** single = instant + toast with Undo (6s, restores order position). Delete-all = double confirm, second gate requires typing DELETE.
- **FAB:** 44px, hides on scroll-down, returns on scroll-up.
- **Search:** header toggle, live filter on title+desc of active tab.
- **Brutalist toggle:** `--radius:0`, `--bw:2px`, shadows off — pure CSS var swap.

## 6. New work for CC (in priority order)

1. **Split & tidy.** `index.html` / `style.css` / `app.js`. Keep code vanilla and readable. Dahl's style: CSS custom properties, no clever abstractions.
2. **Brand swap.** E-mark logo, "Elapsum" naming, favicon.svg from the E-mark.
3. **PWA layer.**
   - `manifest.json`: name Elapsum, short_name Elapsum, `start_url:"/"`, standalone, portrait, `background_color`/`theme_color` `#101014`.
   - Icons: render the E-mark onto `#101014` rounded-square tiles → `icon-192.png`, `icon-512.png`, both `purpose: any maskable` (mind maskable safe zone — keep the mark within the inner 80%).
   - Service worker: cache-first, versioned cache name, offline fallback to index.
   - **Self-host the fonts.** Download Archivo + Archivo Expanded WOFF2 subsets and serve locally. (Lesson from the previous Days Counter attempt: precaching the Google Fonts CSS URL but not the font files breaks offline.)
4. **Deploy prep.** Root deployment on elapsum.com assumed (`start_url:"/"`, SW scope `/`). Plain static hosting, Apache-friendly, no server code.

## 7. Known soft spots — check these while porting

These are untested-by-author or knowingly imperfect. No formal test protocol — Dahl tests in production and iterates; just make these sane:

- Touch gestures were written blind (no device in the authoring environment): edge-vs-mid swipe discrimination, tab-flick threshold, long-press drag vs scroll cancellation, panel drag-follow. Expect tuning.
- Drag-reorder while search filter is active reorders the *filtered* list and persists that as the full order — **disable drag while `searchQ` is non-empty**, or merge intelligently.
- Import appends; importing the same file twice duplicates events. A content-hash or (title+date) dedupe warning would be a nice touch — Dahl-approved as optional.
- Date token formatter has no escape character; a literal `d`/`j`/etc. in a custom pattern gets substituted. Add backslash escaping if cheap.
- `id` collisions: `nextId()` is max+1; fine single-device, just don't change the scheme without migrating.
- Panel positioning uses `calc(50% - 215px)` for the desktop-centered column; verify on very wide and very narrow screens.
- Yearly + search + pinned interactions are lightly exercised.
- `prefers-reduced-motion` is respected for pulse/slide; keep it when adding animations.

## 8. Parked / future (do not build without asking)

- Wordmark "Elapsum" in bars style (Dahl pondering)
- Home-screen widgets via Capacitor (+ `@capacitor-community/android-widget`)
- Milestone highlights (100/365/1000 days), share-card-as-image, notifications
- Recurring intervals other than yearly
- dfault.it/projects catalog entry once live

## 9. Acceptance walkthrough

1. Open fresh → empty state → Settings (right edge swipe) → Import → Dahl's original `backup.txt` → 30 events appear, dates match the old app (Reta 02.02.2026 = 165 days passed on 2026-07-17).
2. Tools → Merge pairs → 9 pairs found, all checked → Merge → 12 single events + 9 period cards remain (30 − 18 + 9 = 21 cards).
3. DD3 card shows Duration 98 / Since start 495 / Since end 397 (on 2026-07-17), gradient spine.
4. Add yearly event, birth year in the past → correct "turns N on <date>" and countdown; switch tabs by swiping mid-screen.
5. Long-press drag a counter card → order persists across reload; sort shows "Custom order".
6. Delete a card → Undo within 6s restores it in place.
7. Toggle brutalist + light + a custom date format `D j. F Y` → everything re-renders, survives reload.
8. Kill network → app loads from SW cache, fonts included.
