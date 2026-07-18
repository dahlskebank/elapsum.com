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
	test('breakdown: leading zero units are trimmed (0y 5m 9d → 5m 9d)', () => {
		eq(call(`breakdown('2026-01-01','2026-06-10',{y:true,m:true,w:false,d:true})`),
			[{ v: 5, u: 'm' }, { v: 9, u: 'd' }]);
	});
	test('evDuration: closed range counts both-ends span; non-range is 0', () => {
		eq(call(`evDuration({kind:'range',date:'2025-01-01',end:'2025-02-01'})`), 31);
		eq(call(`evDuration({kind:'single',date:'2025-01-01'})`), 0);
	});
	test('unitWord: only exactly 1 is singular (0 pluralizes)', () => {
		eq(call(`unitWord('d',1)`), 'day');
		eq(call(`unitWord('d',0)`), 'days');
		eq(call(`unitWord('w',2)`), 'weeks');
	});
}

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
	test('fmtTokens: double backslash yields one literal backslash', () => {
		eq(call(String.raw`fmtTokens('2026-01-31','\\\\Y')`), '\\2026');
	});
}

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
		eq(out.order, [1]);
		eq(out.settings, { theme: 'dark' });
	});
	/* The next two tests exercise failure paths on purpose — the
	   "save failed" / "load failed" console.error lines they print
	   are EXPECTED output, not real failures. */
	test('save: returns true on success, false (no throw) when storage throws', () => {
		eq(call('save(load())'), true);
		eq(call(`(function(){
			const orig = localStorage.setItem;
			localStorage.setItem = function(){ throw new Error('quota'); };
			const r = save(load());
			localStorage.setItem = orig;
			return r;
		})()`), false);
	});
	test('load: corrupt JSON falls back to default state, no throw', () => {
		call(`localStorage.setItem('days.slate.v1', 'not json')`);
		eq(call('load()'),
			{ events: [], sort: 'added_desc', order: [], settings: { theme: 'dark', brutal: false, gradient: true, dateFmt: 'd.m.Y', dateFmtCustom: '' } });
	});
}

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
