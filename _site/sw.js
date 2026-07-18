/* ============================================================
   sw.js — versioned cache-first app shell.
   Update strategy: bump CACHE (in lockstep with APP_VERSION in
   app.js) on every deploy — install caches the new shell, activate
   discards the old cache, skipWaiting + clients.claim switch running
   clients over immediately; app.js reloads once on controllerchange
   (gated so the very first install never reloads mid-use).
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
