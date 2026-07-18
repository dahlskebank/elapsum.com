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
- **Testing on the Pixel against this PC:** Android can't edit its hosts
  file, so use Chrome's USB port forwarding instead — Pixel: enable USB
  debugging (Developer options), connect by cable; desktop Chrome:
  `chrome://inspect/#devices` → Port forwarding → `8331` →
  `localhost:8331`; then open `http://localhost:8331` ON THE PHONE.
  localhost is a secure context on Android, so the service worker,
  install prompt and offline mode all work — no certs, no DNS.

## Version bump — EVERY deploy

1. `CACHE` in `_site/sw.js`  (e.g. `elapsum-v1.0.1`)
2. `APP_VERSION` in `_site/app.js` (same number — fills About + deck footer)
3. `lastmod` in `_site/sitemap.xml`

## Deploy (Domeneshop — domain acquired 2026-07-18)

1. Copy `.env.example` → `.env`, fill DEPLOY_HOST / DEPLOY_USER / DEPLOY_REMOTE / DEPLOY_KEY.
2. ALWAYS preview first: `DRY_RUN=1 ./deploy.sh _site`
3. Real deploy: `./deploy.sh _site` (mirror --delete: what's not local is removed remotely).

## Go-live checklist (domain owned — work through when ready)

- [ ] DNS at Domeneshop → webhotel; LE certificate for elapsum.com issued
- [ ] Create the GA4 property, paste the measurement id into `window.GA_ID` in `_site/index.html`
- [ ] Re-enable the launch cache block in `_site/.htaccess` (banner marks it), remove the global no-cache block
- [ ] Uncomment HSTS in `.htaccess` after HTTPS has been green a while
- [ ] Search Console: verify + submit sitemap
- [ ] Run /dd-website-launch against production
