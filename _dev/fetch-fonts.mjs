/* One-off: download the latin woff2 subsets for the app's five faces
   from Google Fonts and print the @font-face CSS to paste into
   style.css. Self-hosted because the previous Days Counter attempt
   precached the Google Fonts CSS but not the font files — offline
   had no fonts. Run:  node _dev/fetch-fonts.mjs

   NOTE: "Archivo Expanded" is NOT a Google Fonts family — the v3
   prototype requested it and Google silently dropped it, so v3's
   headers were rendering in fallback sans-serif all along (verified
   live 2026-07-18). The expanded face is really Archivo with its
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
