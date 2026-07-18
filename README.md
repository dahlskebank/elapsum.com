# Elapsum

**Days since. Days until.** A self-hosted PWA days counter — built after the
Android app "Days Counter" was pulled from Google Play. A self-hosted app
can't be taken away.

*Tempus elapsum, opus incohatum.*

## What it does

- Counts days **since** and **until** single dates
- **Periods** (start → end) with duration + distance from both ends — the
  feature the original app never had
- **Yearly** repeating events (birthdays: "turns N on …")
- Per-event display units (years/months/weeks/days), pinning, drag reorder,
  search, custom date formats, dark/light/brutalist themes
- JSON export/import — including backups from the original Days Counter app
- Installable PWA, fully offline, all data in localStorage on your device

## Stack

Vanilla HTML/CSS/JS. No framework, no build step, no npm. `_site/` is both
the hand-authored source and the web root.

- `_site/model.js` — pure logic (dates, breakdown, recurrence, palette)
- `_site/storage.js` — localStorage, migration, import/export
- `_site/app.js` — DOM orchestration
- `_site/sw.js` — versioned cache-first service worker

## Develop

Serve `_site/` (Laragon vhost or `npx http-server _site -p 8331 -c-1`) and
edit. Tests: `node _dev/run-tests.mjs`. Deploy: see `DEPLOY.md`.

## Docs

`SPEC.md` — the approved iteration-1 design. `HANDOFF.md` — orientation for
future sessions. `_temp/` — the original prototype + handoff this was built
from.

## License

WTFPL — see `LICENSE`.
