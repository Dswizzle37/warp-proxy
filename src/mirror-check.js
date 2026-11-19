// Decides which domains Caddy may get HTTPS certificates for (on-demand TLS "ask" hook).
// A domain is allowed if:
//   - it matches a suffix in MIRROR_DOMAINS (e.g. "mooo.com,example.org"), or
//   - its DNS A record points at this server's public IP (PUBLIC_IP, auto-detected if unset).
// This stops strangers from making Caddy request certificates for random names
// and burning through Let's Encrypt rate limits.
import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

const suffixes = (process.env.MIRROR_DOMAINS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase().replace(/^\*?\./, ""))
  .filter(Boolean);

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

let publicIp = process.env.PUBLIC_IP || null;

async function detectPublicIp() {
  for (const url of ["https://api.ipify.org", "https://icanhazip.com"]) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const ip = (await res.text()).trim();
      if (isIP(ip) === 4) return ip;
    } catch {}
  }
  return null;
}

async function getPublicIp() {
  if (!publicIp) publicIp = await detectPublicIp();
  return publicIp;
}

async function isAllowed(domain) {
  if (!HOSTNAME_RE.test(domain)) return false;
  if (suffixes.some((s) => domain === s || domain.endsWith("." + s))) return true;

  const ip = await getPublicIp();
  if (!ip) return false;
  try {
    const records = await resolver.resolve4(domain);
    return records.includes(ip);
  } catch {
    return false;
  }
}

export function registerMirrorCheck(fastify) {
  fastify.get("/__caddy/ask", async (req, reply) => {
    const domain = String(req.query.domain || "").toLowerCase();
    const hit = cache.get(domain);
    let ok;
    if (hit && Date.now() - hit.at < CACHE_MS) ok = hit.ok;
    else {
      ok = await isAllowed(domain);
      cache.set(domain, { ok, at: Date.now() });
      if (cache.size > 10000) cache.clear();
    }
    if (ok) console.log(`[mirror] approved certificate for ${domain}`);
    return reply.code(ok ? 200 : 403).send(ok ? "ok" : "no");
  });
}
