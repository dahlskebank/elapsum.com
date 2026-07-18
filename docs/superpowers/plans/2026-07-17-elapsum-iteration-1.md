# Elapsum Iteration 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the days-counter-v3 prototype into a branded, installable, offline-capable Elapsum PWA in `_site/`, structured like E:\www\sub\30days, with deploy prep and local Laragon dev.

**Architecture:** Hand-authored `_site/` is both source and web root — vanilla HTML/CSS/JS, no build step, no npm dependencies. Three plain global scripts loaded in order (`model.js` pure logic → `storage.js` persistence → `app.js` DOM orchestration), a versioned cache-first service worker, and a desktop landing deck at ≥992px. Dev-only tooling lives in `_dev/` (never deployed; deploy mirrors `_site/` only).

**Tech Stack:** Vanilla ES2020 JS, CSS custom properties, node:vm test harness (zero deps), Chrome headless for asset rendering, one-off `npx` CLIs for QR/ico generation, lftp/SFTP deploy.

---

## Conventions (read first)

1. **PORT convention.** "PORT lines A–B of `_temp/days-counter-v3.html`" means: copy those lines **verbatim** from the committed file (commit `9549aed` — line numbers are stable), then apply only the explicitly listed deltas. The v3 prototype is the behavior spec; do not "improve" ported code beyond the listed deltas.
2. **No modules.** The app files are plain `<script src>` global scripts (like 30days). `model.js` defines globals `storage.js` and `app.js` use. Load order matters.
3. **Tests.** `node _dev/run-tests.mjs` — a zero-dependency harness that loads `model.js` + `storage.js` into a `node:vm` context. UI code (`app.js`) is verified by browser walkthrough steps, not unit tests.
4. **Style.** Tabs for indent (see `.editorconfig`, Task 1). Educational comments — Daniel is learning; explain *why*, in the density of 30days' files. Never write `VRFY`/`TEST`/`PEND`/`DONE`/`NOTE` tagged comments.
5. **Dates in tests are always fixed strings** (e.g. `'2026-07-17'`), never "today" — tests must pass forever.
6. **Commits** end with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` (heredoc form shown in Task 1; reuse it everywhere).
7. Machine paths in this plan are literal: project root `E:\www\dev\elapsum.com`, Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`, Laragon at `E:\vlaragon`.

---

### Task 1: Scaffold, .editorconfig, LICENSE, test harness

**Files:**
- Create: `.editorconfig`, `LICENSE`, `_dev/run-tests.mjs`
- Create (empty for now): `_site/model.js`

- [ ] **Step 1: Create `.editorconfig`** (identical to 30days'):

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = tab
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 2: Create `LICENSE`** (WTFPL, Daniel's standard):

```text
            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) 2026 Daniel Dahl

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
```

- [ ] **Step 3: Create `_dev/run-tests.mjs`** (complete file):

```js
/* ============================================================
   run-tests.mjs — zero-dependency test runner.
   The app has no module system (plain <script> files sharing
   globals, exactly like the browser), so we load the files into
   a node:vm context and evaluate expressions inside it with
   call(). Run:  node _dev/run-tests.mjs
   ============================================================ */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function freshContext(files = ['_site/model.js', '_site/storage.js']) {
	const store = new Map(); /* in-memory localStorage stand-in */
	const ctx = vm.createContext({
		console,
		localStorage: {
			getItem: (k) => (store.has(k) ? store.get(k) : null),
			setItem: (k, v) => store.set(k, String(v)),
			removeItem: (k) => store.delete(k),
			clear: () => store.clear(),
		},
	});
	for (const f of files) {
		vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
	}
	/* call('expr') evaluates inside the app's global scope — needed
	   because top-level const/let in a script are not reachable as
	   properties of the context object. */
	return { call: (expr) => vm.runInContext(expr, ctx) };
}

let pass = 0, fail = 0;
function test(name, fn) {
	try { fn(); pass++; console.log('  ok  ' + name); }
	catch (e) { fail++; console.error('FAIL  ' + name + ' — ' + e.message); }
}
function eq(actual, expected, msg = '') {
	const a = JSON.stringify(actual), b = JSON.stringify(expected);
	if (a !== b) throw new Error(msg + ' expected ' + b + ', got ' + a);
}
process.on('exit', () => {
	console.log('\n' + pass + ' passed, ' + fail + ' failed');
	if (fail) process.exitCode = 1;
});

/* ==== tests are appended below, one block per task ==== */
```

- [ ] **Step 4: Create empty `_site/model.js`** containing only:

```js
'use strict';
/* model.js — pure logic: dates, unit breakdown, recurrence, colors,
   date-token formatting, merge-pair detection. No DOM, no storage. */
```

- [ ] **Step 5: Run the harness to verify it loads**

Run (from `E:\www\dev\elapsum.com`): `node _dev/run-tests.mjs`
Expected: fails with `ENOENT ... _site/storage.js` — storage.js doesn't exist yet. Temporarily confirm harness logic with: `node -e "console.log('node ok')"` → `node ok`. (storage.js arrives in Task 6; until then run tests with the model-only context — every test block below that predates Task 6 uses `freshContext(['_site/model.js'])`.)

- [ ] **Step 6: Commit**

```bash
git add .editorconfig LICENSE _dev/run-tests.mjs _site/model.js
git commit -m "$(cat <<'EOF'
Scaffold: editorconfig, WTFPL license, vm test harness

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: model.js — pure logic port (TDD)

**Files:**
- Modify: `_site/model.js`
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests** to `_dev/run-tests.mjs`:

```js
/* ==== Task 2: core date math ==== */
{
	const { call } = freshContext(['_site/model.js']);
	test('daysBetween: Reta 2026-02-02 → 2026-07-17 = 165', () => {
		eq(call(`daysBetween('2026-02-02','2026-07-17')`), 165);
	});
	test('daysBetween is DST-safe across EU change (2026-03-29)', () => {
		eq(call(`daysBetween('2026-03-28','2026-03-30')`), 2);
	});
	test('breakdown: 165 days as weeks+days = 23w 4d', () => {
		eq(call(`breakdown('2026-02-02','2026-07-17',{y:false,m:false,w:true,d:true})`),
			[{ v: 23, u: 'w' }, { v: 4, u: 'd' }]);
	});
	test('breakdown: 2023-03-23 → 2026-07-17 = 3y 3m 24d', () => {
		eq(call(`breakdown('2023-03-23','2026-07-17',{y:true,m:true,w:false,d:true})`),
			[{ v: 3, u: 'y' }, { v: 3, u: 'm' }, { v: 24, u: 'd' }]);
	});
	test('addMonthsUTC clamps month-end: Jan 31 + 1m = Feb 28 (2026)', () => {
		eq(call(`new Date(addMonthsUTC(toUTCnoon('2026-01-31'),1)).toISOString().slice(0,10)`),
			'2026-02-28');
	});
	test('nextOccurrence: Feb 29 birthday clamps in non-leap year', () => {
		eq(call(`nextOccurrence('2024-02-29','2026-07-17')`),
			{ next: '2027-02-28', daysUntil: call(`daysBetween('2026-07-17','2027-02-28')`), turns: 3 });
	});
	test('nextOccurrence: birthday today → daysUntil 0, correct turns', () => {
		eq(call(`nextOccurrence('1983-07-17','2026-07-17')`),
			{ next: '2026-07-17', daysUntil: 0, turns: 43 });
	});
	test('mix: 50% black/white = #808080', () => {
		eq(call(`mix('#000000','#ffffff',0.5)`), '#808080');
	});
	test('tintOf/shadeOf take an explicit light flag (no state in model)', () => {
		eq(call(`tintOf('#f07f2e', false)`), call(`mix('#f07f2e','#ffffff',0.45)`));
		eq(call(`tintOf('#f07f2e', true)`),  call(`mix('#f07f2e','#ffffff',0.18)`));
		eq(call(`shadeOf('#f07f2e', false)`), call(`mix('#f07f2e','#000000',0.32)`));
		eq(call(`shadeOf('#f07f2e', true)`),  call(`mix('#f07f2e','#000000',0.38)`));
	});
	test('fmtTokens: base tokens', () => {
		eq(call(`fmtTokens('2026-01-31','D j. F Y')`), 'Sat 31. January 2026');
	});
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node _dev/run-tests.mjs`
Expected: 10 FAIL lines, each `— daysBetween is not defined` (ReferenceError) or similar.

- [ ] **Step 3: Implement in `_site/model.js`** (append under the header comment):

PORT the following v3 line ranges **verbatim**:
- lines 622–629 (`hexToRgb`, `mix`)
- lines 634–650 (`todayStr`, `toUTCnoon`, `daysBetween`, `msToDateStr`, `MMM`/`MMMM`/`DDD`/`DDDD`)
- lines 651–662 (`fmtTokens` — replaced in Task 3, port as-is for now)
- lines 669–711 (`addMonthsUTC`, `breakdown`, `UNIT_WORD`, `unitWord`, `compact`, `isDaysOnly`)
- lines 712–723 (`clampDate`, `nextOccurrence`)
- line 580 (`const DEFAULT_UNITS = {y:false,m:false,w:false,d:true};`) — place it ABOVE `breakdown`, which references it

Do NOT port lines 630–631 (`tintOf`/`shadeOf` read `state.settings.theme` — model.js must stay state-free). Write these instead:

```js
/* Tint/shade pair for a card color. The light theme needs different
   mix ratios (lighter backgrounds swallow pale tints), so the caller
   passes light=true/false instead of the model reading app state. */
function tintOf(c, light) { return light ? mix(c, '#ffffff', 0.18) : mix(c, '#ffffff', 0.45); }
function shadeOf(c, light) { return light ? mix(c, '#000000', 0.38) : mix(c, '#000000', 0.32); }
```

Also port line 728–731 (`evDuration`) into model.js verbatim.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node _dev/run-tests.mjs`
Expected: all 10 `ok`, `0 failed`.

- [ ] **Step 5: Commit**

```bash
git add _site/model.js _dev/run-tests.mjs
git commit -m "$(cat <<'EOF'
model.js: port pure date/unit/recurrence/color logic from v3

tintOf/shadeOf now take an explicit light flag instead of reading
app state, so the model stays pure and testable.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: model.js — backslash escaping in fmtTokens (TDD)

**Files:**
- Modify: `_site/model.js` (replace `fmtTokens`)
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
/* ==== Task 3: fmtTokens backslash escaping ==== */
{
	const { call } = freshContext(['_site/model.js']);
	test('fmtTokens: \\ escapes a token letter', () => {
		eq(call(String.raw`fmtTokens('2026-01-31','\\D j')`), 'D 31');
	});
	test('fmtTokens: escaped literals inside a pattern', () => {
		eq(call(String.raw`fmtTokens('2026-01-31','j. \\o\\f F')`), '31. of January');
	});
	test('fmtTokens: escaping a non-token char passes it through', () => {
		eq(call(String.raw`fmtTokens('2026-01-31','\\x j')`), 'x 31');
	});
	test('fmtTokens: trailing lone backslash survives as-is', () => {
		eq(call(String.raw`fmtTokens('2026-01-31','j\\')`), '31\\');
	});
}
```

- [ ] **Step 2: Run tests** — Expected: the 4 new tests FAIL (`\D j` currently renders `Sat 31` etc.); Task 2 tests still pass.

- [ ] **Step 3: Replace the `fmtTokens` body** in `_site/model.js` with:

```js
/* WordPress-style token formatter: d j m n y Y M F D l.
   A backslash escapes the next character ("\Y Y" → "Y 2026"): the
   regex consumes backslash+char in a single match, so escaped letters
   never reach the token map. A trailing lone backslash matches
   nothing and is left as-is. */
function fmtTokens(s, pattern) {
	const [y, m, d] = s.split('-').map(Number);
	const dow = new Date(toUTCnoon(s)).getUTCDay();
	const map = {
		d: String(d).padStart(2, '0'), j: String(d),
		m: String(m).padStart(2, '0'), n: String(m),
		y: String(y).slice(2), Y: String(y),
		M: MMM[m - 1], F: MMMM[m - 1], D: DDD[dow], l: DDDD[dow]
	};
	return pattern.replace(/\\(.)|[djmnyYMFDl]/g, (mt, escd) => escd !== undefined ? escd : map[mt]);
}
```

- [ ] **Step 4: Run tests** — Expected: all pass. **Step 5: Commit** (message: `model.js: backslash escaping for date format tokens`, same heredoc form as Task 1 Step 6).

---

### Task 4: model.js — sorted palette + stride default color (TDD)

**Files:**
- Modify: `_site/model.js`
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
/* ==== Task 4: sorted palette ==== */
{
	const { call } = freshContext(['_site/model.js']);
	const V3_COLORS = [
		'#d63ce0','#e6c229','#3d9be9','#2ec9a7','#5fbf4a','#e05252','#f07f2e','#8b5cf6',
		'#f472b6','#9aa3b2','#c0392b','#e74c3c','#ff6b9d','#b03a8e','#7d3cff','#5c6bc0',
		'#2f80ed','#00b8d9','#00c7b1','#27ae60','#a3cb38','#f5d547','#f2a33c','#e8863a',
		'#c96f4a','#a9746e','#8d6e63','#6d7b8d','#4f5b66','#7f8c8d','#c8cdd4','#efe9dd'
	];
	test('COLORS: same 32 colors as v3, no additions or losses', () => {
		const c = call('COLORS');
		eq(c.length, 32);
		eq([...c].sort().join(), [...V3_COLORS].sort().join());
	});
	test('COLORS: rainbow order — reds first, neutral tail last', () => {
		const c = call('COLORS');
		eq(c[0], '#e05252');
		eq(c.slice(-6), ['#efe9dd', '#c8cdd4', '#9aa3b2', '#7f8c8d', '#6d7b8d', '#4f5b66']);
	});
	test('pickDefaultColor strides so consecutive events differ, covers all 32', () => {
		const seen = new Set();
		for (let i = 0; i < 32; i++) seen.add(call(`pickDefaultColor(${i})`));
		eq(seen.size, 32);
		eq(call('pickDefaultColor(0) === pickDefaultColor(32)'), true);
	});
}
```

- [ ] **Step 2: Run tests** — Expected: 3 FAIL (`COLORS is not defined`).

- [ ] **Step 3: Add to `_site/model.js`** (near the top, replacing nothing — v3's COLORS lives at lines 573–578 and is NOT ported):

```js
/* The 32-color palette, hue-sorted so the swatch grid reads as a
   rainbow: 26 chromatic colors by hue (red → orange → yellow → green
   → teal → blue → purple → pink), then 6 neutrals by lightness.
   Same colors as v3, order changed on purpose (Daniel's request).
   8 columns × 4 rows: row 1 reds/oranges, row 2 yellow→teal,
   row 3 blue→magenta, row 4 pinks + the neutral tail. */
const COLORS = [
	'#e05252', '#e74c3c', '#c0392b', '#a9746e', '#8d6e63', '#c96f4a', '#f07f2e', '#e8863a',
	'#f2a33c', '#e6c229', '#f5d547', '#a3cb38', '#5fbf4a', '#27ae60', '#2ec9a7', '#00c7b1',
	'#00b8d9', '#3d9be9', '#2f80ed', '#5c6bc0', '#8b5cf6', '#7d3cff', '#d63ce0', '#b03a8e',
	'#f472b6', '#ff6b9d', '#efe9dd', '#c8cdd4', '#9aa3b2', '#7f8c8d', '#6d7b8d', '#4f5b66'
];
/* Default color for the n-th created event. Neighbours in the sorted
   array look alike, so we stride through it in steps of 7 (coprime
   with 32 → the cycle still visits every color exactly once) to keep
   consecutive new events visually distinct. */
function pickDefaultColor(n) { return COLORS[(n * 7) % COLORS.length]; }
```

- [ ] **Step 4: Run tests** — Expected: all pass. **Step 5: Commit** (`model.js: hue-sorted palette + stride-picked default colors`).

---

### Task 5: model.js — merge-pair detection (TDD)

**Files:**
- Modify: `_site/model.js`
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
/* ==== Task 5: detectPairs ==== */
{
	const { call } = freshContext(['_site/model.js']);
	const EVENTS = JSON.stringify([
		{ id: 1, title: 'DD1 Start', kind: 'single', date: '2025-01-01' },
		{ id: 2, title: 'DD1 End', kind: 'single', date: '2025-02-01' },
		{ id: 3, title: 'TB start', kind: 'single', date: '2025-03-01' },
		{ id: 4, title: 'TB slutt', kind: 'single', date: '2025-04-01' },
		{ id: 5, title: 'NPP Start', kind: 'single', date: '2025-05-01' },
		{ id: 6, title: 'NPP ca End', kind: 'single', date: '2025-06-01' },
		{ id: 7, title: 'Carnivore Light Start', kind: 'single', date: '2025-07-01' },
		{ id: 8, title: 'Solo Range', kind: 'range', date: '2025-01-01' }
	]);
	test('detectPairs: finds Start/End, start/slutt, Start/"ca End"; ignores unpaired + non-singles', () => {
		const pairs = call(`detectPairs(${EVENTS})`);
		eq(pairs.length, 3);
		eq(pairs.map(p => p.base).sort(), ['DD1', 'NPP', 'TB']);
		const dd1 = pairs.find(p => p.base === 'DD1');
		eq([dd1.start.id, dd1.end.id], [1, 2]);
	});
}
```

- [ ] **Step 2: Run tests** — Expected: FAIL (`detectPairs is not defined`).

- [ ] **Step 3: Implement.** PORT v3 lines 1302–1317 (`SUFFIX_RE` + `detectPairs`) into `_site/model.js` with ONE delta — the function takes the events array as a parameter instead of reading `state`:

```js
/* Merge tool: the original Days Counter had no periods, so Daniel
   tracked them as two singles — "X Start" + "X End". This finds those
   pairs among single events. The regex also accepts "ca End" (approx.
   end) and Norwegian "slutt". */
const SUFFIX_RE = /\s+(ca\s+)?(start|end|slutt)\s*$/i;
function detectPairs(events) {
	const singles = events.filter(e => e.kind === 'single');
	const groups = {};
	singles.forEach(e => {
		const m = e.title.match(SUFFIX_RE);
		if (!m) return;
		const base = e.title.replace(SUFFIX_RE, '').trim();
		const kind = /start$/i.test(m[2]) ? 'start' : 'end';
		(groups[base] = groups[base] || {})[kind] = (groups[base][kind] || e);
	});
	return Object.entries(groups)
		.filter(([, g]) => g.start && g.end)
		.map(([base, g]) => ({ base, start: g.start, end: g.end }));
}
```

- [ ] **Step 4: Run tests** — Expected: all pass. **Step 5: Commit** (`model.js: merge-pair detection as pure function`).

---

### Task 6: storage.js — persistence + export (TDD)

**Files:**
- Create: `_site/storage.js`
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests** (these use the default two-file context — from here on `freshContext()` works):

```js
/* ==== Task 6: storage ==== */
{
	const { call } = freshContext();
	test('load: empty storage → default state', () => {
		eq(call('load()'),
			{ events: [], sort: 'added_desc', order: [], settings: { theme: 'dark', brutal: false, gradient: true, dateFmt: 'd.m.Y', dateFmtCustom: '' } });
	});
	test('migrate: isRange → kind, defaults pinned/units', () => {
		eq(call(`migrate({ id: 1, title: 'x', date: '2025-01-01', isRange: true })`),
			{ id: 1, title: 'x', date: '2025-01-01', kind: 'range', pinned: false, units: null });
	});
	test('save/load round-trip through localStorage', () => {
		call(`(function(){ const s = load(); s.events.push({ id: 1, title: 'a', desc: '', date: '2025-01-01', end: null, kind: 'single', units: null, pinned: false, color: COLORS[0], added: 1 }); save(s); })()`);
		eq(call('load().events.length'), 1);
	});
	test('buildExport: elapsum envelope with events/order/settings', () => {
		const out = call(`buildExport({ events: [{ id: 1 }], order: [1], settings: { theme: 'dark' } }, '2026-07-17T00:00:00.000Z')`);
		eq(out.app, 'elapsum');
		eq(out.version, 4);
		eq(out.exported, '2026-07-17T00:00:00.000Z');
		eq(out.events, [{ id: 1 }]);
	});
}
```

- [ ] **Step 2: Run tests** — Expected: 4 FAIL (missing file / `migrate is not defined`).

- [ ] **Step 3: Create `_site/storage.js`:** header comment, then PORT v3 lines 572 (`STORE_KEY`), 579 (`DEFAULT_SETTINGS`), 591–619 (`migrate`, `load`, `save`) verbatim, with ONE delta in `save()`: v3's `toast(...)` call becomes `console.error` + rethrow-free return (storage must not know about the toast UI; app.js wraps it — see Task 8 Step 3 delta list). Then append:

```js
/* Export envelope. "elapsum" v4 supersedes the prototype's
   "days-slate" v3 — import (below) accepts both, it only looks for
   an events array. exportedIso is a parameter for testability. */
function buildExport(state, exportedIso) {
	return {
		app: 'elapsum', version: 4, exported: exportedIso,
		events: state.events, order: state.order, settings: state.settings
	};
}
```

`save()` in full after the delta:

```js
function save(state) {
	try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); return true; }
	catch (e) { console.error('save failed', e); return false; }
}
```

(Note `save(state)` now takes the state as a parameter — v3 closed over a global `state`; app.js owns that global and passes it in. Same for `load()` which already returns it.)

- [ ] **Step 4: Run tests** — Expected: all pass. **Step 5: Commit** (`storage.js: load/save/migrate + elapsum export envelope`).

---

### Task 7: storage.js — import parsers + dedupe detection (TDD)

**Files:**
- Modify: `_site/storage.js`
- Test: `_dev/run-tests.mjs` (append)

- [ ] **Step 1: Append failing tests:**

```js
/* ==== Task 7: parseImport ==== */
{
	const { call } = freshContext();
	test('parseImport: original Days Counter array format (ms dates)', () => {
		/* Date.UTC(2026,1,2,12) — noon keeps the local calendar date stable
		   in any timezone west of UTC+12 */
		const ms = Date.UTC(2026, 1, 2, 12);
		const r = call(`parseImport('${JSON.stringify([{ id: 9, title: ' Reta ', description: 'd', date: 'MS', addition_date: 5, widget_id: 0 }]).replace('"MS"', String(ms))}', [])`);
		eq(r.ok, true);
		eq(r.imported.length, 1);
		eq(r.imported[0].title, 'Reta');
		eq(r.imported[0].date, '2026-02-02');
		eq(r.imported[0].kind, 'single');
		eq(r.imported[0].added, 5);
	});
	test('parseImport: own format runs migrate (isRange → kind)', () => {
		const r = call(`parseImport('${JSON.stringify({ app: 'days-slate', events: [{ id: 1, title: 'x', date: '2025-01-01', isRange: true }] })}', [])`);
		eq(r.ok, true);
		eq(r.imported[0].kind, 'range');
	});
	test('parseImport: flags duplicates by title+date against existing', () => {
		const existing = JSON.stringify([{ id: 1, title: 'Reta', date: '2026-02-02' }]);
		const incoming = JSON.stringify({ events: [{ id: 7, title: 'reta ', date: '2026-02-02' }, { id: 8, title: 'New', date: '2026-03-03' }] });
		const r = call(`parseImport('${incoming.replace(/'/g, "\\'")}', ${existing})`);
		eq(r.dupes.length, 1);
		/* the raw title keeps its trailing space — only the dedupe KEY is
		   trimmed/lowercased; migrate() never rewrites titles */
		eq(r.dupes[0].title, 'reta ');
	});
	test('parseImport: garbage → ok:false with message', () => {
		eq(call(`parseImport('not json', []).ok`), false);
		eq(call(`parseImport('{"nope":1}', []).error`), 'No events found in file');
	});
}
```

- [ ] **Step 2: Run tests** — Expected: 4 FAIL (`parseImport is not defined`).

- [ ] **Step 3: Append to `_site/storage.js`:**

```js
/* Import parser. Accepts exactly two formats:
   1. The original Days Counter backup — a raw ARRAY of
      {id,title,description,date(ms),addition_date,widget_id}.
   2. Elapsum's own export (and the old days-slate prototype export) —
      an OBJECT with an events array; migrate() upgrades old fields.
   Returns {ok:false,error} or {ok:true,imported,dupes} where dupes
   lists incoming events whose title+date already exist — the UI asks
   before appending those (importing the same file twice used to
   silently duplicate everything). ids are NOT assigned here; the app
   assigns them on append so they stay unique against live state. */
function parseImport(text, existingEvents) {
	let data;
	try { data = JSON.parse(text); }
	catch (e) { return { ok: false, error: 'Not valid JSON' }; }
	let imported = [];
	if (Array.isArray(data)) {
		imported = data
			.filter(x => x && typeof x.title === 'string' && typeof x.date === 'number')
			.map((x, i) => ({
				id: 0,
				title: x.title.trim(),
				desc: (x.description || '').trim(),
				date: msToDateStr(x.date),
				end: null, kind: 'single', units: null, pinned: false,
				color: pickDefaultColor(i),
				added: typeof x.addition_date === 'number' ? x.addition_date : Date.now()
			}));
	} else if (data && Array.isArray(data.events)) {
		imported = data.events.filter(x => x && x.title && x.date).map(migrate);
	}
	if (imported.length === 0) return { ok: false, error: 'No events found in file' };
	const key = (e) => e.title.trim().toLowerCase() + '|' + e.date;
	const seen = new Set(existingEvents.map(key));
	const dupes = imported.filter(ev => seen.has(key(ev)));
	return { ok: true, imported, dupes };
}
```

- [ ] **Step 4: Run tests** — Expected: all pass. **Step 5: Commit** (`storage.js: dual-format import parser with title+date dedupe detection`).

---

### Task 8: index.html + style.css — shell, head, deck

**Files:**
- Create: `_site/index.html`, `_site/style.css`

- [ ] **Step 1: Create `_site/style.css`.** PORT v3 lines 12–376 verbatim (everything inside v3's `<style>` block: `:root` through `#toastAct.show` — line 377 is the closing `</style>` tag and must NOT be copied). Then apply deltas:

1. At the very top, add the font-face placeholder comment (filled by Task 10):

```css
/* ==== self-hosted fonts (added in the fonts task) ==== */
```

2. Append after the ported CSS — deck, about-version, and duplicate-sheet styles:

```css
/* ============ desktop deck (≥992px) ============
   Elapsum is phone-first. Desktops don't get the app — they get the
   pitch and a QR code, same pattern as 30days. Below 992px the deck
   is display:none and the app renders as usual. */
.deck{display:none}
@media (min-width:992px){
	#content,.fab,.panel{display:none !important}
	.deck{
		display:flex;flex-direction:column;align-items:center;justify-content:center;
		min-height:100vh;padding:48px 24px 32px;text-align:center;
	}
	.deck-brand{display:flex;align-items:center;gap:14px;margin-bottom:10px}
	.deck-brand svg{width:44px;height:44px;display:block}
	.deck-name{font-family:'Archivo Expanded',sans-serif;font-size:34px;font-weight:600;letter-spacing:.02em}
	.deck-tag{color:var(--accent);font-size:15px;font-weight:600;margin-bottom:18px}
	.deck-copy{color:var(--muted);font-size:14px;line-height:1.7;max-width:480px;margin-bottom:14px}
	.deck-copy.dim{font-size:12.5px}
	.deck-qr{margin:26px 0 10px;display:flex;flex-direction:column;align-items:center;gap:10px}
	.deck-qr img{width:148px;height:148px;border-radius:var(--radius-sm);background:#fff;padding:8px}
	.deck-qr-cap{color:var(--muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;line-height:1.6}
	.deck-motto{font-style:italic;color:var(--muted);font-size:13px;margin:34px 0 14px}
	.deck-links{font-size:12px;display:flex;gap:14px;flex-wrap:wrap;justify-content:center;margin-bottom:8px}
	.deck-links a{color:var(--muted);text-decoration:none}
	.deck-links a:hover{color:var(--accent)}
	.deck-legal{font-size:11px;color:var(--muted)}
	.deck-legal a{color:inherit}
}
/* version line in Settings → About */
.about-version{color:var(--accent)}
```

- [ ] **Step 2: Create `_site/index.html`.** Head in full:

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
	<title>Elapsum — days since, days until</title>
	<meta name="description" content="A self-hosted days counter. Days since, days until, periods with both ends counted, and yearly events — installable, offline, all data on your device.">
	<meta name="author" content="Daniel Dahl">
	<meta name="robots" content="index, follow">
	<link rel="canonical" href="https://elapsum.com/">

	<!-- Open Graph -->
	<meta property="og:type" content="website">
	<meta property="og:site_name" content="Elapsum">
	<meta property="og:locale" content="en_US">
	<meta property="og:url" content="https://elapsum.com/">
	<meta property="og:title" content="Elapsum">
	<meta property="og:description" content="Days since, days until. A self-hosted days counter that can't be taken away.">
	<meta property="og:image" content="https://elapsum.com/assets/img/og-image.jpg">
	<meta property="og:image:type" content="image/jpeg">
	<meta property="og:image:width" content="1200">
	<meta property="og:image:height" content="630">
	<meta property="og:image:alt" content="Elapsum — a self-hosted days counter">

	<!-- Twitter / X card -->
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="Elapsum">
	<meta name="twitter:description" content="Days since, days until. A self-hosted days counter that can't be taken away.">
	<meta name="twitter:image" content="https://elapsum.com/assets/img/og-image.jpg">

	<!-- PWA + icons -->
	<meta name="theme-color" content="#101014">
	<link rel="manifest" href="/manifest.webmanifest">
	<link rel="icon" href="/favicon.ico" sizes="48x48">
	<link rel="icon" href="/assets/icons/icon.svg" type="image/svg+xml">
	<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
	<link rel="sitemap" type="application/xml" href="/sitemap.xml">
	<meta name="apple-mobile-web-app-capable" content="yes">
	<meta name="mobile-web-app-capable" content="yes">
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
	<meta name="apple-mobile-web-app-title" content="Elapsum">

	<!-- Self-hosted fonts: preload the two that paint first (brand + body) -->
	<link rel="preload" href="/assets/fonts/archivo-expanded-600-latin.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="preload" href="/assets/fonts/archivo-400-latin.woff2" as="font" type="font/woff2" crossorigin>
	<link rel="stylesheet" href="/style.css">

	<!-- Google Analytics 4 — paste the elapsum.com measurement id
	     ("G-XXXXXXXXXX") below to enable. Empty string = fully disabled.
	     Offline/PWA safe: without network the gtag request fails silently. -->
	<script>
		window.GA_ID = "";
		if (window.GA_ID) {
			window.dataLayer = window.dataLayer || [];
			window.gtag = function () { dataLayer.push(arguments); };
			gtag("js", new Date());
			gtag("config", window.GA_ID);
			var gaScript = document.createElement("script");
			gaScript.async = true;
			gaScript.src = "https://www.googletagmanager.com/gtag/js?id=" + window.GA_ID;
			document.head.appendChild(gaScript);
		}
	</script>

	<!-- JSON-LD structured data -->
	<script type="application/ld+json">
	{
		"@context": "https://schema.org",
		"@type": "WebApplication",
		"name": "Elapsum",
		"url": "https://elapsum.com/",
		"description": "A self-hosted days counter: days since, days until, periods, yearly events. Installable PWA, fully offline.",
		"applicationCategory": "UtilitiesApplication",
		"operatingSystem": "Any"
	}
	</script>
</head>
```

- [ ] **Step 3: Body.** PORT v3 lines 379–561 verbatim (panels → toast), then apply deltas:

1. **Header brand** (v3 lines 439–444): replace the draft glyph `<svg>` with the E-mark (note the gradient id is namespaced `egH` — the deck copy uses `egD`; duplicate DOM ids would break both gradients):

```html
<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" aria-hidden="true">
	<defs><linearGradient id="egH" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
	</linearGradient></defs>
	<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#egH)" stroke-width="3.6"/>
	<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
	<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
	<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
</svg>
```

2. `<h1 id="appName">Days Counter</h1>` → `<h1 id="appName">Elapsum</h1>`.
3. **About panel-hint** (v3 line 430) becomes:

```html
<div class="panel-hint">Elapsum · self-hosted · <span class="about-version" id="aboutVersion"></span><br>
Built after the Days Counter app vanished from Google Play — a self-hosted app can't be taken away.<br>
Edge-swipe: left edge = sort, right edge = settings. Mid-screen swipe switches tabs.</div>
```

4. **Duplicate-import sheet** — insert after the merge overlay (v3 line 559 equivalent):

```html
<!-- import duplicates -->
<div class="overlay" id="dupOv">
	<div class="sheet">
		<h2>Duplicates found</h2>
		<p class="confirm-text" id="dupInfo"></p>
		<div id="dupList"></div>
		<div class="actions">
			<button class="btn ghost" id="dupCancel">Cancel</button>
			<button class="btn ghost" id="dupSkip">Skip duplicates</button>
			<button class="btn primary" id="dupAll">Import all</button>
		</div>
	</div>
</div>
```

5. **Date-format hint** (v3 lines 415–418, the `panel-hint` inside `#fmtCustomWrap`): SPEC §5 requires the hint to teach the new escape rule. Append to the existing token list, before the closing `</div>`:

```html
· <b>\</b> escapes a letter (<b>\D</b> → literal D)
```

6. **Deck** — insert immediately before `</body>`-bound scripts (after the toast div):

```html
<!-- Desktop landing (≥992px). Phones never see this. -->
<div class="deck">
	<div class="deck-brand">
		<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" aria-hidden="true">
			<defs><linearGradient id="egD" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
			</linearGradient></defs>
			<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#egD)" stroke-width="3.6"/>
			<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
			<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
			<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
		</svg>
		<span class="deck-name">Elapsum</span>
	</div>
	<p class="deck-tag">Days since. Days until. Periods with both ends counted.</p>
	<p class="deck-copy">Built to replace the Android app "Days Counter" after it was pulled
		from Google Play — the whole point of a self-hosted app is that it can't be taken away.
		No account, no cloud: everything lives in your phone's own storage, fully offline
		once installed.</p>
	<p class="deck-copy dim">Imports backups from the original Days Counter app, plus
		Elapsum's own exports. Other apps' formats are not supported.</p>
	<div class="deck-qr">
		<img src="/assets/img/qr-elapsum.svg" alt="QR code linking to elapsum.com" width="148" height="148">
		<span class="deck-qr-cap">Open on your phone<br>elapsum.com</span>
	</div>
	<p class="deck-motto">Tempus elapsum, opus incohatum</p>
	<footer>
		<p class="deck-links">
			<a href="https://dahlskebank.com" target="_blank" rel="noopener" title="Dahlske Bank">Powered by dB</a>
			<a href="https://danieldahl.com" target="_blank" rel="noopener" title="Daniel Dahl">Fueled by dD</a>
			<a href="https://dxd.no" target="_blank" rel="noopener" title="deus ex Dahl">Pinnacle of dxD</a>
			<a href="https://dfault.it" target="_blank" rel="noopener" title="D-Fault Pending">D-Fault Pending</a>
		</p>
		<p class="deck-legal">© 2026 ⌁ <span id="footYear"></span> →
			<a href="https://elapsum.com">Elapsum.com</a> · <span id="footVersion"></span></p>
	</footer>
</div>

<script src="/model.js"></script>
<script src="/storage.js"></script>
<script src="/app.js"></script>
</body>
</html>
```

(The v3 inline `<script>` block — lines 563–1405 including the wrapping tags — is NOT ported into index.html; its body, lines 564–1404, becomes app.js in Task 9. The footer labels above were verified against `e:/www/dev/__boilerplate/src/_data/site.json → footer.links` on 2026-07-17; re-check that file before executing this step and update labels/URLs if they changed.)

- [ ] **Step 4: Sanity-check the DOM** (no browser needed):

Run: `node -e "const h=require('fs').readFileSync('_site/index.html','utf8'); for(const id of ['panelLeft','panelRight','content','scrim','fabBtn','editOv','wipe1Ov','wipe2Ov','mergeOv','dupOv','toast','aboutVersion','footYear','footVersion']){ if(!h.includes('id=\"'+id+'\"')) throw new Error('missing #'+id); } console.log('all ids present');"`
Expected: `all ids present`.

- [ ] **Step 5: Commit** (`index.html + style.css: shell port, Elapsum head/meta/GA, desktop deck`).

---

### Task 9: app.js — orchestration port with the approved fixes

**Files:**
- Create: `_site/app.js`

- [ ] **Step 1: Create `_site/app.js`.** PORT v3 lines 564–1404 (the `<script>` body — lines 563 and 1405 are the HTML `<script>`/`</script>` tags themselves and must NOT be copied) verbatim EXCEPT the ranges replaced by the deltas below. Structure the file with the same section banners v3 uses. The deltas, in order:

1. **Do not port** lines 572–580 (`STORE_KEY`, `COLORS`, `DEFAULT_SETTINGS`, `DEFAULT_UNITS`) — they live in model.js/storage.js now. Add instead at the top:

```js
'use strict';
/* app.js — DOM orchestration. Pure logic lives in model.js, storage
   in storage.js; this file owns state, rendering and events. */
const APP_VERSION = 'v1.0.0'; /* bump with sw.js CACHE on every deploy */
```

2. **Do not port** lines 591–631 (storage + color helpers — now in the other files), 634–723 (model functions), or 728–731 (`evDuration` — already in model.js; a duplicate here would silently shadow the tested copy). Also do NOT port lines 1302 and 1304–1317 (`SUFFIX_RE` + `detectPairs` — now in model.js; since these are plain scripts sharing one global scope, a second top-level `const SUFFIX_RE` is a SyntaxError that kills ALL of app.js at parse time). DO port line 1303 (`let mergePairs = [];`) — the merge handlers at 1318–1361 still need it. KEEP lines 663–667 (`currentPattern`, `fmtDate`) — they read `state`, so they belong here.
3. Line 585 `let editColor = COLORS[2];` → `let editColor = COLORS[0];` (placeholder until openEdit sets it).
4. Every `save()` call becomes `save(state)` (v3 has 11 call sites; the one at line 1294 disappears with delta 9's import rewrite, leaving 10 to convert — but the authoritative gate is the grep: after porting there must be zero bare `save()` left). Wrap the failure case once by adding after the state declaration:

```js
function persist() { if (!save(state)) toast('Could not save — storage full?'); }
```

   …and change all `save(state)` call sites to `persist()` (educational: one place decides how failure is surfaced).
5. `tintOf(color)`/`shadeOf(color)` call sites (v3 line 789) → `tintOf(color, state.settings.theme === 'light')` / `shadeOf(color, state.settings.theme === 'light')`.
6. **Drag guard — the approved fix.** v3 line 1027 `if(tab==='yearly') return;` becomes `if (tab === 'yearly' || searchQ) return;` and the same change at the mouse fallback, v3 line 1071. (Reordering a filtered list would persist the filtered subset as the entire custom order.)
7. `openEdit` default color (v3 line 1168): `editColor = ev ? (ev.color || COLORS[0]) : pickDefaultColor(state.events.length);`
8. **Export** (v3 lines 1256–1266) becomes:

```js
document.getElementById('exportBtn').addEventListener('click', () => {
	const blob = new Blob(
		[JSON.stringify(buildExport(state, new Date().toISOString()), null, 2)],
		{ type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'elapsum-backup-' + todayStr() + '.json';
	a.click();
	URL.revokeObjectURL(a.href);
});
```

9. **Import** (v3 lines 1267–1299) becomes the parse → maybe-ask → append flow:

```js
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', e => {
	const file = e.target.files[0];
	e.target.value = '';
	if (!file) return;
	const reader = new FileReader();
	reader.onload = () => {
		const r = parseImport(reader.result, state.events);
		if (!r.ok) { toast(r.error); return; }
		if (r.dupes.length) { openDupSheet(r); return; }
		appendImported(r.imported);
	};
	reader.onerror = () => toast('Could not read file');
	reader.readAsText(file);
});

/* Appending assigns fresh ids HERE (not in the parser) so they are
   unique against whatever is in state right now. */
function appendImported(events) {
	let id = nextId();
	events.forEach(ev => {
		ev.id = id++;
		state.events.push(ev);
		if (state.sort === 'custom' && ev.kind !== 'yearly') state.order.push(ev.id);
	});
	persist(); render(); setPanel(0); closeOv('dupOv');
	toast('Imported ' + events.length + ' event' + (events.length === 1 ? '' : 's'));
}

/* Duplicate confirm sheet: same title+date already exists. */
let pendingImport = null;
function openDupSheet(r) {
	pendingImport = r;
	document.getElementById('dupInfo').textContent =
		r.dupes.length + ' of ' + r.imported.length +
		' events already exist (same title and date). Import them anyway?';
	document.getElementById('dupList').innerHTML = r.dupes.map(d =>
		`<div class="pair"><div><div class="pname">${esc(d.title)}</div>
		<div class="pdates">${fmtDate(d.date)}</div></div></div>`).join('');
	setPanel(0); openOv('dupOv');
}
document.getElementById('dupCancel').addEventListener('click', () => { pendingImport = null; closeOv('dupOv'); });
document.getElementById('dupAll').addEventListener('click', () => {
	if (pendingImport) appendImported(pendingImport.imported);
	pendingImport = null;
});
document.getElementById('dupSkip').addEventListener('click', () => {
	if (pendingImport) {
		const key = (e) => e.title.trim().toLowerCase() + '|' + e.date;
		const dup = new Set(pendingImport.dupes.map(key));
		const fresh = pendingImport.imported.filter(ev => !dup.has(key(ev)));
		if (fresh.length) appendImported(fresh);
		else { closeOv('dupOv'); toast('Nothing new to import'); }
	}
	pendingImport = null;
});
```

10. **Merge** button handler (v3 line 1319): `mergePairs = detectPairs(state.events);` (parameterized model call). The merge-confirm handler (1341–1361) ports verbatim apart from `save()` → `persist()`.
11. Append at the end, before the init block:

```js
/* ---------- version + deck footer ---------- */
document.getElementById('aboutVersion').textContent = APP_VERSION;
document.getElementById('footYear').textContent = String(new Date().getFullYear());
document.getElementById('footVersion').textContent = APP_VERSION;

/* ---------- service worker ---------- */
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
	/* After a deploy the new SW takes over (skipWaiting+claim); reload
	   once so the page runs the code the new cache serves. */
	let reloaded = false;
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (reloaded) return; reloaded = true; location.reload();
	});
}
```

12. `state = load()` stays (line 582) — `load()` now comes from storage.js.

- [ ] **Step 2: Static check — no undefined leftovers**

Run: `node --check _site/app.js`
Expected: no output (syntax OK).
Run: `node -e "const s=require('fs').readFileSync('_site/app.js','utf8'); const bad=[/\bsave\(\)/, /COLORS\s*=/, /function migrate/, /function daysBetween/, /const SUFFIX_RE/, /function detectPairs/, /function evDuration/]; bad.forEach(re=>{ if(re.test(s)) throw new Error('leftover: '+re); }); console.log('clean');"`
Expected: `clean`.

- [ ] **Step 3: Browser smoke test** (localhost — the SW needs HTTPS or localhost, and this also seeds Task 15's comparison):

Run: `npx --yes http-server _site -p 8331 -c-1` (background), then open `http://localhost:8331` in Chrome. Verify manually: empty state renders; + opens the sheet; adding a single event renders a card; Settings panel opens; brutalist/light toggles work; the swatch grid reads as a rainbow. Stop the server after.

- [ ] **Step 4: Run the full test suite** — `node _dev/run-tests.mjs` → all pass (app.js is not loaded by the harness; this guards against accidental edits to the other files).

- [ ] **Step 5: Commit** (`app.js: port v3 orchestration; drag/search guard, dedupe sheet, version+SW wiring`).

---

### Task 10: Self-hosted fonts

**Files:**
- Create: `_dev/fetch-fonts.mjs`, `_site/assets/fonts/*.woff2` (5 files)
- Modify: `_site/style.css` (font-face block)

- [ ] **Step 1: Create `_dev/fetch-fonts.mjs`** (complete file):

```js
/* One-off: download the latin woff2 subsets for the app's five faces
   from Google Fonts and print the @font-face CSS to paste into
   style.css. Self-hosted because the previous Days Counter attempt
   precached the Google Fonts CSS but not the font files — offline
   had no fonts. Run:  node _dev/fetch-fonts.mjs

   NOTE: "Archivo Expanded" is NOT a Google Fonts family — the v3
   prototype requested it and Google silently dropped it, so v3's
   headers were rendering in fallback sans-serif all along (verified
   live 2026-07-17). The expanded face is really Archivo with its
   width axis pinned to 125%, requested via the wdth axis and
   self-declared here under the family name the app's CSS expects. */
import { writeFileSync, mkdirSync } from 'node:fs';
/* A modern-Chrome UA makes the API serve woff2 (default UA gets ttf). */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
/* [request URL, family name to declare locally, extra @font-face line, slug base] */
const JOBS = [
	['https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&display=swap',
		'Archivo', '', 'archivo'],
	['https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,600&display=swap',
		'Archivo Expanded', '\tfont-stretch:125%;\n', 'archivo-expanded'],
];
mkdirSync('_site/assets/fonts', { recursive: true });
let out = '';
for (const [url, family, extra, slugBase] of JOBS) {
	const css = await (await fetch(url, { headers: { 'User-Agent': UA } })).text();
	const blocks = [...css.matchAll(/\/\* ([a-z-]+) \*\/\s*@font-face\s*\{([^}]+)\}/g)];
	for (const [, subset, body] of blocks) {
		if (subset !== 'latin') continue; /* latin only — no latin-ext */
		const weight = body.match(/font-weight:\s*(\d+)/)[1];
		const fileUrl = body.match(/url\((https:[^)]+\.woff2)\)/)[1];
		const slug = slugBase + '-' + weight + '-latin.woff2';
		const buf = Buffer.from(await (await fetch(fileUrl)).arrayBuffer());
		writeFileSync('_site/assets/fonts/' + slug, buf);
		console.log('saved', slug, buf.length, 'bytes');
		out += `@font-face{\n\tfont-family:'${family}';\n\tfont-style:normal;\n\tfont-weight:${weight};\n${extra}\tfont-display:swap;\n\tsrc:url('/assets/fonts/${slug}') format('woff2');\n}\n`;
	}
}
console.log('\n/* paste into style.css: */\n' + out);
```

- [ ] **Step 2: Run it** — `node _dev/fetch-fonts.mjs`
Expected: 5 files saved — `archivo-400-latin.woff2`, `archivo-500-latin.woff2`, `archivo-600-latin.woff2`, `archivo-800-latin.woff2`, `archivo-expanded-600-latin.woff2` — plus the printed @font-face block, whose last entry declares `font-family:'Archivo Expanded'` with `font-stretch:125%` (deliberate relabeling — see the NOTE in the script — so v3's ported `font-family:'Archivo Expanded'` CSS works unchanged). If any of the five names differ, STOP and report; the SW shell list (Task 12) and index.html preloads depend on these exact names.

- [ ] **Step 3: Paste the printed @font-face block** into `_site/style.css` under the `==== self-hosted fonts ====` comment (before `:root`).

- [ ] **Step 4: Verify files + offline readiness:** `ls _site/assets/fonts` → exactly 5 `.woff2` files, then reload the Task 9 smoke server: DevTools → Network shows fonts loading from `/assets/fonts/`, zero requests to `fonts.googleapis.com`/`gstatic.com`.

- [ ] **Step 5: Commit** (`fonts: self-hosted Archivo + Archivo Expanded latin subsets`).

---

### Task 11: Icons, favicon, og-image, QR

**Files:**
- Create: `_dev/icon-tile.html`, `_dev/og-image.html`, `_site/assets/icons/*` (6 files), `_site/favicon.ico`, `_site/assets/img/og-image.jpg`, `_site/assets/img/qr-elapsum.svg`

- [ ] **Step 1: Create `_site/assets/icons/icon.svg`** (standalone E-mark on tile — browsers scale SVG, one file serves all favicon sizes):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
	<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
	</linearGradient></defs>
	<rect width="512" height="512" rx="112" fill="#101014"/>
	<g fill="none" stroke-linecap="round" transform="translate(64,64) scale(16)">
		<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#eg)" stroke-width="3.6"/>
		<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
		<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
		<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
	</g>
</svg>
```

Gotcha to verify by eye when first opened: the vertical spine uses an objectBoundingBox gradient on a zero-width line. Chrome renders it, but if the spine ever shows a single flat color, switch the gradient to `gradientUnits="userSpaceOnUse" x1="6" y1="4.5" x2="6" y2="19.5"`.

- [ ] **Step 2: Create `_dev/icon-tile.html`** (renders any icon variant for headless capture):

```html
<!doctype html>
<meta charset="utf-8">
<style>html,body{margin:0;background:transparent}</style>
<div id="tile"></div>
<script>
	/* ?size=512            → rounded tile, 12.5% padding (purpose:any)
	   ?size=512&mode=mask  → full-bleed square, 19% padding (maskable safe zone)
	   ?size=180&mode=apple → full-bleed square, 15% padding (iOS crops its own radius) */
	const q = new URLSearchParams(location.search);
	const size = Number(q.get('size') || 512);
	const mode = q.get('mode') || 'any';
	const rx = mode === 'any' ? Math.round(size * 0.22) : 0;
	const padFrac = { any: 0.125, mask: 0.19, apple: 0.15 }[mode];
	const pad = Math.round(size * padFrac);
	document.getElementById('tile').innerHTML =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
			<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
			</linearGradient></defs>
			<rect width="${size}" height="${size}" rx="${rx}" fill="#101014"/>
			<g fill="none" stroke-linecap="round" transform="translate(${pad},${pad}) scale(${(size - pad * 2) / 24})">
				<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#eg)" stroke-width="3.6"/>
				<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
				<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
				<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
			</g>
		</svg>`;
</script>
```

- [ ] **Step 3: Capture the PNGs** (PowerShell, from the project root; `--default-background-color=00000000` keeps rounded corners transparent):

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$base = "file:///E:/www/dev/elapsum.com/_dev/icon-tile.html"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_site\assets\icons\icon-512.png"          --window-size=512,512 --default-background-color=00000000 "$base`?size=512"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_site\assets\icons\icon-192.png"          --window-size=192,192 --default-background-color=00000000 "$base`?size=192"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_site\assets\icons\icon-maskable-512.png" --window-size=512,512 "$base`?size=512&mode=mask"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_site\assets\icons\icon-maskable-192.png" --window-size=192,192 "$base`?size=192&mode=mask"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_site\assets\icons\apple-touch-icon.png"  --window-size=180,180 "$base`?size=180&mode=apple"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_dev\icon-48.png"                          --window-size=48,48   --default-background-color=00000000 "$base`?size=48"
```

Expected: 6 PNGs. Open `icon-512.png` and `icon-maskable-512.png` to eyeball: gradient spine renders, maskable version has clearly more padding.

- [ ] **Step 4: favicon.ico** — run in **Git Bash, not PowerShell** (PowerShell's `>` re-encodes binary output as UTF-16 and corrupts the file): `npx --yes png-to-ico _dev/icon-48.png > _site/favicon.ico` (verify: `node -e "const b=require('fs').readFileSync('_site/favicon.ico'); if(b[2]!==1) throw 0; console.log('ico ok', b.length, 'bytes')"`).

- [ ] **Step 5: QR code** — `npx --yes qrcode -t svg -o _site/assets/img/qr-elapsum.svg "https://elapsum.com/"`. Verify the file starts with `<svg` and scan it with a phone once it renders on the deck.

- [ ] **Step 6: Create `_dev/og-image.html`** (1200×630, Slate style):

```html
<!doctype html>
<meta charset="utf-8">
<style>
	html,body{margin:0}
	body{
		width:1200px;height:630px;background:#101014;color:#eceaf0;
		font-family:'Archivo',sans-serif;display:flex;align-items:center;gap:70px;
		padding:0 90px;box-sizing:border-box;overflow:hidden;
	}
	@font-face{font-family:'Archivo';font-weight:400;src:url('../_site/assets/fonts/archivo-400-latin.woff2') format('woff2')}
	@font-face{font-family:'Archivo';font-weight:600;src:url('../_site/assets/fonts/archivo-600-latin.woff2') format('woff2')}
	@font-face{font-family:'Archivo Expanded';font-weight:600;src:url('../_site/assets/fonts/archivo-expanded-600-latin.woff2') format('woff2')}
	svg{width:220px;height:220px;flex-shrink:0}
	h1{font-family:'Archivo Expanded',sans-serif;font-size:84px;font-weight:600;margin:0 0 18px;letter-spacing:.01em}
	p{font-size:30px;color:#77747f;margin:0;line-height:1.5}
	.motto{font-style:italic;font-size:24px;margin-top:26px;color:#f07f2e}
</style>
<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round">
	<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
	</linearGradient></defs>
	<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#eg)" stroke-width="3.6"/>
	<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
	<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
	<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
</svg>
<div>
	<h1>Elapsum</h1>
	<p>Days since. Days until.<br>A self-hosted days counter that can't be taken away.</p>
	<p class="motto">Tempus elapsum, opus incohatum</p>
</div>
```

- [ ] **Step 7: Capture + convert** (new shell session — redefine `$chrome` first):

```powershell
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
& $chrome --headless=new --screenshot="E:\www\dev\elapsum.com\_dev\og-image.png" --window-size=1200,630 "file:///E:/www/dev/elapsum.com/_dev/og-image.html"
npx --yes sharp-cli --input _dev/og-image.png --output _site/assets/img/og-image.jpg
```

Fallback if sharp-cli fails to install/run: ship the PNG instead — copy it to `_site/assets/img/og-image.png` and update the THREE references (`og:image`, `og:image:type` → `image/png`, `twitter:image` in index.html) plus the SPEC §4 tree. Do not leave a jpg reference pointing at nothing.

- [ ] **Step 8: Commit** (`assets: E-mark icon set, favicon, og-image, QR code + _dev generators`).

---

### Task 12: manifest.webmanifest + sw.js

**Files:**
- Create: `_site/manifest.webmanifest`, `_site/sw.js`

- [ ] **Step 1: Create `_site/manifest.webmanifest`:**

```json
{
	"name": "Elapsum",
	"short_name": "Elapsum",
	"description": "Days since, days until. A self-hosted days counter — periods, yearly events, fully offline.",
	"id": "/",
	"start_url": "/",
	"scope": "/",
	"display": "standalone",
	"orientation": "portrait",
	"background_color": "#101014",
	"theme_color": "#101014",
	"icons": [
		{ "src": "/assets/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
		{ "src": "/assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
		{ "src": "/assets/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
		{ "src": "/assets/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
	]
}
```

- [ ] **Step 2: Create `_site/sw.js`** (complete file — 30days pattern, Elapsum shell):

```js
/* ============================================================
   sw.js — versioned cache-first app shell.
   Update strategy: bump CACHE (in lockstep with APP_VERSION in
   app.js) on every deploy — install caches the new shell, activate
   discards the old cache, skipWaiting + clients.claim switch running
   clients over immediately; app.js reloads once on controllerchange.
   Cross-origin requests (Google Analytics) pass straight through.
   ============================================================ */

const CACHE = "elapsum-v1.0.0";

/* NOTE: "/" (not "/index.html") — the .htaccess clean-URL rule 301s
   /index.html to /, and a cached redirected response is rejected by
   Chrome when replayed for a navigation. "/" returns a direct 200. */
const SHELL = [
	"/",
	"/style.css",
	"/model.js",
	"/storage.js",
	"/app.js",
	"/manifest.webmanifest",
	"/assets/fonts/archivo-400-latin.woff2",
	"/assets/fonts/archivo-500-latin.woff2",
	"/assets/fonts/archivo-600-latin.woff2",
	"/assets/fonts/archivo-800-latin.woff2",
	"/assets/fonts/archivo-expanded-600-latin.woff2",
	"/assets/icons/icon.svg",
	"/assets/icons/icon-192.png",
	"/assets/icons/icon-512.png",
	"/assets/icons/icon-maskable-192.png",
	"/assets/icons/icon-maskable-512.png",
	"/assets/icons/apple-touch-icon.png",
	"/assets/img/qr-elapsum.svg",
	"/favicon.ico",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			/* cache:"reload" bypasses the HTTP cache — otherwise a deploy
			   could lock a day-old app.js into the brand-new cache */
			.then(async (cache) => {
				await cache
					.addAll(SHELL.map((url) => new Request(url, { cache: "reload" })))
					.catch(async (err) => {
						/* addAll is atomic and its error never names the culprit —
						   probe each URL so the console says WHICH file 404s */
						const missing = [];
						for (const url of SHELL) {
							try {
								const r = await fetch(url, { cache: "reload" });
								if (!r.ok) missing.push(url + " → " + r.status);
							} catch (probeErr) {
								missing.push(url + " → network error");
							}
						}
						console.error("[sw] install failed — missing shell files:", missing);
						throw err;
					});
			})
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const request = event.request;
	if (request.method !== "GET") return;
	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return; /* GA goes to the network */

	/* any navigation lands on the shell (single page, offline included) */
	if (request.mode === "navigate") {
		event.respondWith(caches.match("/").then((hit) => hit || fetch(request)));
		return;
	}

	event.respondWith(
		caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request)),
	);
});
```

- [ ] **Step 3: Verify against reality** — every SHELL entry must exist:

Run: `node -e "const fs=require('fs'); const src=fs.readFileSync('_site/sw.js','utf8'); const block=src.match(/const SHELL = \[([\s\S]*?)\];/)[1]; const shell=[...block.matchAll(/\"(\/[^\"]*)\"/g)].map(m=>m[1]).filter(u=>u!=='/'); const missing=shell.filter(u=>!fs.existsSync('_site'+u)); if(missing.length){ throw new Error('missing: '+missing.join(', ')); } console.log('shell complete:', shell.length, 'files');"`
Expected: `shell complete: 18 files`. (The extraction is scoped to the SHELL array literal on purpose — the NOTE comment above it contains the quoted string `"/index.html"`, which a whole-file scan would miscount as a 19th entry.)

- [ ] **Step 4: Live check on localhost** — restart `npx --yes http-server _site -p 8331 -c-1`, open `http://localhost:8331`, DevTools → Application → Service Workers: sw activated; Cache Storage → `elapsum-v1.0.0` holds 19 entries. Then Network tab → Offline → reload: app renders with fonts. Back online, stop server.

- [ ] **Step 5: Commit** (`pwa: manifest + versioned cache-first service worker`).

---

### Task 13: Static chrome — .htaccess, robots, sitemap, humans, security, 403/404

**Files:**
- Create: `_site/.htaccess`, `_site/robots.txt`, `_site/sitemap.xml`, `_site/humans.txt`, `_site/.well-known/security.txt`, `_site/404.html`, `_site/403.html`

- [ ] **Step 1: `_site/.htaccess`** — copy `E:\www\sub\30days\_site\.htaccess` and apply exactly these deltas:
1. Header comment → `.htaccess for Elapsum — https://elapsum.com` (keep the Tier-1/CSP/HSTS note).
2. Delete the two audio MIME lines (`AddType audio/mpeg mp3`, `AddType audio/wav wav`).
3. In the commented launch-cache block, delete the two audio `ExpiresByType` lines.
Everything else — error documents, `-Indexes`, HTTPS redirect, www→non-www, clean-URL rule, TRACE block, query-string block, extension block, the four security headers, `sw.js` no-cache, deflate, the active global no-cache test block with its `RE-ENABLE AT LAUNCH` banner — ports verbatim.

- [ ] **Step 2: `_site/robots.txt`:**

```text
User-agent: *
Disallow:

Sitemap: https://elapsum.com/sitemap.xml
```

- [ ] **Step 3: `_site/sitemap.xml`** (bump `lastmod` at each deploy):

```xml
<?xml version="1.0" encoding="utf-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
	<url>
		<loc>https://elapsum.com/</loc>
		<lastmod>2026-07-17</lastmod>
	</url>
</urlset>
```

- [ ] **Step 4: `_site/humans.txt`:**

```text
/* TEAM */
	Author: Daniel Dahl
	Site: https://danieldahl.com
	Location: Norway

/* SITE */
	Site name: Elapsum
	URL: https://elapsum.com
	Language: English
	Stack: Vanilla HTML/CSS/JS — no framework, no build step, no dependencies
	Type: Installable PWA, fully offline, all data on device
	Fonts: Archivo, Archivo Expanded (self-hosted)

/* THANKS */
	The original Days Counter app — gone from Google Play, not forgotten
```

- [ ] **Step 5: `_site/.well-known/security.txt`:**

```text
Contact: mailto:dahlskebank@gmail.com
Expires: 2027-07-17T00:00:00.000Z
Preferred-Languages: en, no
Canonical: https://elapsum.com/.well-known/security.txt
```

- [ ] **Step 6: `_site/404.html`** (self-contained on purpose — an error page must not depend on assets that may be the very thing that went missing):

```html
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<title>404 — Elapsum</title>
	<meta name="robots" content="noindex">
	<link rel="icon" href="/favicon.ico" sizes="48x48">
	<style>
		*{box-sizing:border-box}
		body{
			margin:0;min-height:100vh;display:grid;place-items:center;
			background:#101014;color:#eceaf0;text-align:center;
			font-family:'Archivo','Segoe UI',sans-serif;
		}
		svg{width:72px;height:72px;margin:0 auto 20px;display:block}
		h1{font-size:17px;letter-spacing:.24em;text-transform:uppercase;margin:0 0 8px;font-weight:600}
		p{color:#77747f;font-size:13.5px;margin:0 auto 26px;max-width:300px;line-height:1.7}
		a{
			display:inline-block;padding:12px 26px;color:#1a0f05;text-decoration:none;
			background:#f07f2e;border-radius:10px;font-weight:600;font-size:14px;
		}
	</style>
</head>
<body>
	<main>
		<svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" aria-hidden="true">
			<defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#f6b183"/><stop offset="1" stop-color="#a4561e"/>
			</linearGradient></defs>
			<line x1="6" y1="4.5" x2="6" y2="19.5" stroke="url(#eg)" stroke-width="3.6"/>
			<line x1="6" y1="5.5"  x2="19"   y2="5.5"  stroke="#f6b183" stroke-width="3.2"/>
			<line x1="6" y1="12"   x2="15.5" y2="12"   stroke="#f07f2e" stroke-width="3.2"/>
			<line x1="6" y1="18.5" x2="12.5" y2="18.5" stroke="#a4561e" stroke-width="3.2"/>
		</svg>
		<h1>404 — nothing here</h1>
		<p>This page never existed, or its time elapsed. There is only one page — the counter.</p>
		<a href="/">Back to Elapsum</a>
	</main>
</body>
</html>
```

- [ ] **Step 7: `_site/403.html`** — identical to 404.html with three text changes: `<title>403 — Elapsum</title>`, `<h1>403 — not for you</h1>`, `<p>This path is off limits. The counter, however, is all yours.</p>`.

- [ ] **Step 8: Commit** (`chrome: htaccess, robots, sitemap, humans, security.txt, error pages`).

---

### Task 14: Deploy prep — deploy.sh, .env.example, DEPLOY.md, README.md

**Files:**
- Create: `deploy.sh`, `.env.example`, `DEPLOY.md`, `README.md`

- [ ] **Step 1: Copy the deploy script verbatim** (it is project-agnostic — host/user/path all come from `.env`):

```bash
cp /e/www/sub/30days/deploy.sh deploy.sh
cp /e/www/sub/30days/.env.example .env.example
```

- [ ] **Step 2: Create `DEPLOY.md`:**

```markdown
# Deploying Elapsum

## Local dev (Laragon)

- Hosts line (already added): `127.0.0.1 elapsum.com`
- Apache vhost: `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf` → doc root `E:/www/dev/elapsum.com/_site`
- HTTPS cert: `E:\vlaragon\etc\ssl\elapsum.crt` + `.key` (SAN: elapsum.com, www.elapsum.com).
  Trust it ONCE from an admin PowerShell — without this Chrome silently
  refuses the service worker (the shared laragon.crt has no elapsum.com SAN):
  `certutil -addstore Root E:\vlaragon\etc\ssl\elapsum.crt`
  …then restart Apache from the Laragon UI.
- Quick loop without Apache: `npx http-server _site -p 8331 -c-1`
  (service workers also register on plain-http localhost).

## Version bump — EVERY deploy

1. `CACHE` in `_site/sw.js`  (e.g. `elapsum-v1.0.1`)
2. `APP_VERSION` in `_site/app.js` (same number — fills About + deck footer)
3. `lastmod` in `_site/sitemap.xml`

## Deploy (Domeneshop — PARKED until the domain is acquired)

1. Copy `.env.example` → `.env`, fill DEPLOY_HOST / DEPLOY_USER / DEPLOY_REMOTE / DEPLOY_KEY.
2. ALWAYS preview first: `DRY_RUN=1 ./deploy.sh _site`
3. Real deploy: `./deploy.sh _site` (mirror --delete: what's not local is removed remotely).

## Go-live checklist (once the domain exists)

- [ ] DNS at Domeneshop → webhotel; LE certificate for elapsum.com issued
- [ ] Create the GA4 property, paste the measurement id into `window.GA_ID` in `_site/index.html`
- [ ] Re-enable the launch cache block in `_site/.htaccess` (banner marks it), remove the global no-cache block
- [ ] Uncomment HSTS in `.htaccess` after HTTPS has been green a while
- [ ] Search Console: verify + submit sitemap
- [ ] Run /dd-website-launch against production
```

- [ ] **Step 3: Create `README.md`:**

```markdown
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
```

- [ ] **Step 4: Verify deploy.sh intact:** `bash -n deploy.sh` → no output (syntax OK).

- [ ] **Step 5: Commit** (`deploy prep: deploy.sh, .env.example, DEPLOY.md, README`).

---

### Task 15: Laragon vhost + local HTTPS cert

**Files:**
- Create: `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf` (outside the repo)
- Create: `E:\vlaragon\etc\ssl\elapsum.crt` + `elapsum.key` (outside the repo)

- [ ] **Step 1: Create `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf`** (kiande.conf clone):

```apache
define ROOT "E:/www/dev/elapsum.com/_site"
define SITE "elapsum.com"

<VirtualHost *:80>
    DocumentRoot "${ROOT}"
    ServerName ${SITE}
    <Directory "${ROOT}">
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>

<VirtualHost *:443>
    DocumentRoot "${ROOT}"
    ServerName ${SITE}
    <Directory "${ROOT}">
        AllowOverride All
        Require all granted
    </Directory>

    SSLEngine on
    SSLCertificateFile      E:/vlaragon/etc/ssl/elapsum.crt
    SSLCertificateKeyFile   E:/vlaragon/etc/ssl/elapsum.key

</VirtualHost>
```

- [ ] **Step 2: Generate the cert** (Git Bash — openssl ships with Git for Windows):

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout /e/vlaragon/etc/ssl/elapsum.key -out /e/vlaragon/etc/ssl/elapsum.crt \
  -subj "/CN=elapsum.com" -addext "subjectAltName=DNS:elapsum.com,DNS:www.elapsum.com"
```

Verify: `openssl x509 -in /e/vlaragon/etc/ssl/elapsum.crt -noout -ext subjectAltName` → shows both DNS entries.

- [ ] **Step 3: HAND TO DANIEL (admin required, one time):** in an **admin** PowerShell: `certutil -addstore Root E:\vlaragon\etc\ssl\elapsum.crt`, then restart Apache from the Laragon UI. This step blocks Step 4 — pause here until done.

- [ ] **Step 4: Verify local HTTPS + SW:** `curl.exe -sI https://elapsum.com/ | Select-Object -First 1` → `HTTP/1.1 200 OK`. Then in Chrome: `https://elapsum.com` → padlock, DevTools → Application → Service Workers shows sw.js activated for scope `https://elapsum.com/`. The clean-URL rule check: `curl.exe -sI https://elapsum.com/index.html | Select-String "301|Location"` → 301 to `/`.

- [ ] **Step 5: Commit** — nothing to commit in the repo for this task (both files live outside it); instead record both paths in HANDOFF.md (Task 16).

---

### Task 16: HANDOFF.md, acceptance run, version audit

**Files:**
- Create: `HANDOFF.md`, `_dev/acceptance-backup.mjs`

- [ ] **Step 1: Create `_dev/acceptance-backup.mjs`** (runs the import+merge acceptance against Daniel's real backup, if present):

```js
/* Acceptance: SPEC §10 / handoff §9 — needs _temp/backup.txt (Daniel's
   real Days Counter export, 30 events). Run: node _dev/acceptance-backup.mjs */
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
if (!existsSync('_temp/backup.txt')) {
	console.log('SKIP: _temp/backup.txt not present yet — drop it there and rerun.');
	process.exit(0);
}
const ctx = vm.createContext({ console, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
for (const f of ['_site/model.js', '_site/storage.js']) {
	vm.runInContext(readFileSync(f, 'utf8'), ctx, { filename: f });
}
const call = (expr) => vm.runInContext(expr, ctx);
ctx.__raw = readFileSync('_temp/backup.txt', 'utf8');
const r = call('parseImport(__raw, [])');
console.log('events imported:', r.imported.length, '(expected 30)');
const reta = r.imported.find(e => /reta/i.test(e.title));
console.log('Reta date:', reta && reta.date, '(expected 2026-02-02)');
ctx.__events = r.imported.map((e, i) => ({ ...e, id: i + 1 }));
const pairs = call('detectPairs(__events)');
console.log('merge pairs:', pairs.length, '(expected 9)');
console.log('pair bases:', pairs.map(p => p.base).sort().join(', '));
console.log('(expected: ANA, BPC, DD1, DD2, DD3, MIX, NPP, PB, TB — Carnivore Light Start must NOT appear)');
const dd3 = pairs.find(p => p.base === 'DD3');
if (dd3) {
	console.log('DD3 duration:', call(`daysBetween('${dd3.start.date}','${dd3.end.date}')`), '(expected 98)');
	console.log('DD3 since start on 2026-07-17:', call(`daysBetween('${dd3.start.date}','2026-07-17')`), '(expected 495)');
	console.log('DD3 since end on 2026-07-17:', call(`daysBetween('${dd3.end.date}','2026-07-17')`), '(expected 397)');
}
```

- [ ] **Step 2: Run it** — `node _dev/acceptance-backup.mjs`. If backup.txt is present: every "(expected …)" must match; any mismatch is a STOP-and-investigate (the numbers come from the handoff's acceptance section, they are not negotiable). If absent: `SKIP` — leave a note in HANDOFF.md that this must be run before go-live.

- [ ] **Step 3: Full test suite** — `node _dev/run-tests.mjs` → 0 failed.

- [ ] **Step 4: Walkthrough — HAND TO DANIEL** (the hosts entry is desktop-only, so this round is desktop-Chrome device-emulation; the real Pixel pass happens post-go-live). Checklist, each item SPEC §10-anchored:
	- Import `backup.txt` → 30 events, dates match the old app.
	- Import the SAME file again → the duplicates sheet opens listing all 30; **Skip duplicates** imports nothing ("Nothing new to import" toast).
	- Merge pairs → 9 pairs found, all checked → merge → exactly **21 cards** remain; DD3 shows Duration 98 / Since start 495 / Since end 397 (numbers valid on 2026-07-17; the script in Step 2 checks them date-independently) with the gradient spine visible.
	- Add a yearly event with a birth year in the past → card shows "turns N on ⟨date⟩" and the countdown; N is correct.
	- Type something in search, then long-press a card → it must NOT lift (drag is inert while filtering); clear search → drag works and the order survives reload.
	- Mid-screen swipe switches tabs; edge swipes open sort/settings panels.
	- Delete a card → Undo within 6s restores it in place.
	- Brutalist + light + custom format `D j. F Y` all survive reload; the format hint shows the backslash-escape rule.
	- DevTools offline → reload works, fonts included.
	- Deck renders at ≥992px with QR + motto + footer links; at 360×740 emulation the panels don't overlap the content column oddly.
	- Install prompt appears (desktop install is fine as smoke test).

- [ ] **Step 5: Create `HANDOFF.md`:**

```markdown
# HANDOFF — Elapsum (elapsum.com)

> Orientation for continuing work in a fresh Claude session.
> Read this + README.md; SPEC.md governs design decisions;
> `_temp/ELAPSUM-HANDOFF.md` + `_temp/days-counter-v3.html` are the
> original behavior spec this was built from.

## What this is

Single-user days-counter PWA (since/until/periods/yearly). Vanilla
HTML/CSS/JS, no build step — `_site/` is hand-authored source AND web
root, committed to git. Repo: https://github.com/dahlskebank/elapsum.com
(public). Domain elapsum.com NOT ACQUIRED yet — local dev only.

## Architecture

- `_site/model.js` — pure logic; `storage.js` — localStorage (key
  `days.slate.v1`) + import/export; `app.js` — DOM + state.
- `_site/sw.js` — cache-first shell. **Bump CACHE + APP_VERSION (app.js)
  + sitemap lastmod on every deploy.**
- Desktop ≥992px shows the deck (landing + QR), not the app.
- Tests: `node _dev/run-tests.mjs`. Acceptance vs the real backup:
  `node _dev/acceptance-backup.mjs` (needs `_temp/backup.txt`, gitignored).

## Local dev

- hosts: `127.0.0.1 elapsum.com` (done). Vhost:
  `E:\vlaragon\etc\apache2\sites-enabled\elapsum.conf` → `_site/`.
- Cert `E:\vlaragon\etc\ssl\elapsum.crt|key` (SAN elapsum.com +
  www) — must be certutil-trusted once (admin) or Chrome blocks the SW.
- Quick loop: `npx http-server _site -p 8331 -c-1`.

## Open items

1. Domain acquisition → then the DEPLOY.md go-live checklist (GA_ID,
   .htaccess cache re-enable, Search Console, LE cert).
2. On-device gesture tuning (thresholds ported untested from v3 —
   handoff §7 lists the risky ones).
3. `window.GA_ID` empty until the GA4 property exists.
4. Iteration 2 ideas live in SPEC §12 (flexible recurrence, etc.).

## Conventions

Tabs; educational comments; WTFPL; version in three places (see DEPLOY.md);
never add swipe-to-delete; never render letterforms in the E-mark's bars
grammar (wordmark = E-mark + Archivo Expanded type, decided 2026-07-17);
`_temp/` is read-only history.
```

- [ ] **Step 6: Version audit** — invoke the `dd-check-version` skill on the project and fix anything it flags (footer/about version presence + consistency).

- [ ] **Step 7: Final commit + push**

```bash
git add -A
git commit -m "$(cat <<'EOF'
HANDOFF.md + acceptance harness; iteration 1 complete

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
git push
```

---

## Post-plan notes for the executor

- Tasks 2–7 are pure TDD and safe to do in one sitting; Tasks 8–9 are the big port — after each, run the Task 9 Step 2 leftover-check.
- Task 15 Step 3 and Task 16 Step 4 need Daniel (admin cert trust; eyeballs). Everything else is autonomous.
- If `_temp/backup.txt` never arrives, iteration 1 still ships — the acceptance script self-skips — but say so loudly in the final report.
- The SPEC's "verify panel calc on narrow screens" (soft spot): check at 360×740 device emulation during Task 16 Step 4 — panels must not overlap the content column oddly.
