# Running free mirrors

One free server runs the proxy. Every domain you point at it becomes a mirror with automatic HTTPS.
Adding a mirror = adding one DNS record. No config changes, no restarts.

```
 a.mooo.com ─┐
 b.crabdance.com ─┼──► your server IP ──► Caddy (auto HTTPS) ──► proxy
 c.duckdns.org ─┘
```

## Step 1: Get a free server (Oracle Cloud Always Free)

1. Sign up at https://www.oracle.com/cloud/free/. A card is needed for verification; Always Free resources are not charged.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 22.04 or 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, e.g. 2 OCPU / 12 GB (Always Free covers up to 4 OCPU / 24 GB total).
     If it says "out of capacity", try another availability domain or try again later.
   - Download the SSH key it generates.
3. Copy the instance's **Public IP**.
4. Open ports 80 and 443 in Oracle's firewall:
   **Networking → Virtual cloud networks → your VCN → Security Lists → Default → Add Ingress Rules**
   - Source CIDR `0.0.0.0/0`, TCP, destination port `80`
   - Source CIDR `0.0.0.0/0`, TCP, destination port `443`
   - Source CIDR `0.0.0.0/0`, UDP, destination port `443` (optional, HTTP/3)

## Step 2: Install and start the proxy

SSH in (`ssh -i your-key ubuntu@YOUR_IP`), then:

```bash
# Oracle's Ubuntu images also block ports in iptables. Open them:
sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker

# Get the proxy and start it
git clone https://github.com/dswizzle37/warp-proxy
cd warp-proxy
cp .env.example .env        # optional: edit it
docker compose up -d
```

Check it's running: `docker compose ps` (both `proxy` and `caddy` should be "running").

## Step 3: Make mirrors (free domains)

Each mirror just needs an **A record → your server's public IP**.

### FreeDNS (afraid.org): the main source, thousands of domains
1. Sign up at https://freedns.afraid.org.
2. Go to **Subdomains → Add**.
3. Type: `A`, Subdomain: anything (e.g. `mathhelp`), Domain: pick any from the list
   (click "Many many more available" to browse thousands of public domains), Destination: **your IP**.
4. Repeat for as many as you like. Spreading across *different* base domains is the point:
   if one base domain gets blocked, the others keep working.

### DuckDNS
https://www.duckdns.org: log in, add a subdomain, set the IP. Gives `yourname.duckdns.org`.

### Others
- **is-a.dev**: free `you.is-a.dev`, requested via a GitHub pull request.
- **eu.org**: a free *real* domain (slow approval). You can then make unlimited subdomains of it.

### Then visit it
Open `https://your-new-mirror.example` in a browser. The first visit takes a few seconds
while the certificate is issued. After that it's instant. Watch it happen with:

```bash
docker compose logs -f proxy | grep mirror
```

## Step 4 (optional): Throwaway mirrors with no domain at all

```bash
docker compose --profile tunnel up -d
docker compose logs tunnel | grep trycloudflare.com
```

This gives you a random `https://something.trycloudflare.com` URL for free. It changes whenever
the tunnel restarts (`docker compose restart tunnel` = new URL).

## Updating

```bash
cd warp-proxy && git pull && docker compose up -d --build
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Domain doesn't load at all | DNS can take a few minutes. Check with `nslookup your.domain`. It must show your server IP. Check both firewalls (Oracle security list **and** iptables). |
| Certificate error | Check `docker compose logs caddy`. Let's Encrypt allows ~50 certificates per base domain per week; spreading across many FreeDNS base domains avoids this. |
| Domain is behind Cloudflare's orange cloud | Its DNS shows Cloudflare's IP, so the auto-check rejects it. Add its base domain to `MIRROR_DOMAINS` in `.env`, then `docker compose up -d`. |
| Page loads but sites don't | WebSockets must reach the server (they do by default with this setup). If behind Cloudflare, make sure WebSockets are enabled. |
| Auto-detected IP is wrong | Set `PUBLIC_IP=` in `.env`. |

## Keep it healthy
- Leave `DNS_SERVERS` at its filtered default and never set `WISP_ALLOW_LOCAL` on a public server.
  Open relays get abused, and abuse gets your free server terminated.
- Oracle can reclaim Always Free instances that sit idle for long periods. A server with real traffic is fine.
- AGPL-3.0: if you run a modified version publicly, link to its source.
