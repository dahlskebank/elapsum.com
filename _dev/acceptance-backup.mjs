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
