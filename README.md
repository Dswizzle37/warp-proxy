# Warp: a Scramjet web proxy

A browser-in-a-browser web proxy built on [Scramjet](https://github.com/MercuryWorkshop/scramjet),
with tabs, back/forward/reload, an address bar, a search-engine picker, tab-title cloaking and an about:blank pop-out.

## How it works
- **Scramjet** (service worker `public/sw.js`) intercepts every request from the proxied page and rewrites HTML/JS/CSS so the site thinks it's on its real origin.
- **bare-mux + libcurl.js** do the actual HTTP(S) requests *in the browser* (TLS is end-to-end, encrypted in the browser).
- **Wisp** (`/wisp/` WebSocket on the server) tunnels those TCP connections out to the internet.

## Run locally
```bash
npm install
npm start          # http://localhost:8080  (PORT env var overrides)
```

## Deploy (Render, Railway, Fly, any VPS)
- Build: `npm install`, Start: `npm start`, or use the included `Dockerfile`.
- **Must be served over HTTPS** (service workers require it, except on localhost). Render/Railway/Fly give you that automatically.
- The host must allow WebSockets and outbound TCP.

## Free mirrors (one server, unlimited domains)
See **[MIRRORS.md](MIRRORS.md)**: a free Oracle Cloud server + `docker compose up -d` + free FreeDNS/DuckDNS domains, each with automatic HTTPS.

## Config (env vars)
| Var | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listen port |
| `DNS_SERVERS` | `1.1.1.3,1.0.0.3` | Resolvers Wisp uses (Cloudflare family filter by default) |
| `PUBLIC_IP` | auto-detected | Server IP; domains resolving to it get auto-HTTPS (Docker Compose setup) |
| `MIRROR_DOMAINS` | unset | Comma-separated base domains always allowed a certificate |
| `WISP_ALLOW_LOCAL` | unset | `1` lets the proxy reach private/loopback IPs. **Testing only.** |

## Keyboard shortcuts
Alt+T new tab · Alt+W close tab · Alt+L focus address bar

License: AGPL-3.0 (inherits from Scramjet).
