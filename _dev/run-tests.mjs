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
