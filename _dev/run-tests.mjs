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
}
