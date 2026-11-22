#!/usr/bin/env bash
# Free throwaway mirrors via Cloudflare quick tunnels (*.trycloudflare.com).
#
#   ./mirrors.sh          start the proxy if needed + make 1 new link
#   ./mirrors.sh 5        make 5 new links
#   ./mirrors.sh list     show the links that are still running
#   ./mirrors.sh stop     stop all links (and the proxy, if this script started it)
#
# Needs: node, npm, cloudflared (Mac: brew install node cloudflared)
set -u
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
STATE=".mirrors"
TUNNELS="$STATE/tunnels"     # lines: "<pid> <url>"
PROXY_PID="$STATE/proxy.pid"
mkdir -p "$STATE"
touch "$TUNNELS"

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
proxy_up() { curl -s -o /dev/null --max-time 2 "http://localhost:$PORT/"; }

prune() {
  local tmp="$TUNNELS.tmp" pid url
  : > "$tmp"
  while read -r pid url; do
    alive "$pid" && echo "$pid $url" >> "$tmp"
  done < "$TUNNELS"
  mv "$tmp" "$TUNNELS"
}

start_proxy() {
  if proxy_up; then return 0; fi
  [ -d node_modules ] || { echo "Installing dependencies..."; npm install --silent || exit 1; }
  echo "Starting proxy on port $PORT..."
  PORT="$PORT" nohup node src/index.js > "$STATE/proxy.log" 2>&1 &
  echo $! > "$PROXY_PID"
  # Keep the Mac awake while the proxy runs.
  if command -v caffeinate >/dev/null; then
    nohup caffeinate -i -w "$(cat "$PROXY_PID")" >/dev/null 2>&1 &
  fi
  for _ in $(seq 1 20); do proxy_up && return 0; sleep 0.5; done
  echo "Proxy didn't start. Log:"; tail -20 "$STATE/proxy.log"; exit 1
}

new_link() {
  local log="$STATE/tunnel-$(date +%s)-$RANDOM.log" pid url=""
  nohup cloudflared tunnel --no-autoupdate --url "http://localhost:$PORT" > "$log" 2>&1 &
  pid=$!
  for _ in $(seq 1 60); do
    url=$(grep -Eo 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' "$log" | head -1)
    [ -n "$url" ] && break
    alive "$pid" || break
    sleep 0.5
  done
  if [ -z "$url" ]; then
    echo "Couldn't create a link. cloudflared said:"; tail -5 "$log"
    kill "$pid" 2>/dev/null
    return 1
  fi
  echo "$pid $url" >> "$TUNNELS"
  echo "$url"
}

list_links() {
  prune
  if [ -s "$TUNNELS" ]; then
    echo "Running links:"; awk '{print "  " $2}' "$TUNNELS"
  else
    echo "No links running. Make one with: ./mirrors.sh"
  fi
}

stop_all() {
  local pid url
  while read -r pid url; do kill "$pid" 2>/dev/null; done < "$TUNNELS"
  : > "$TUNNELS"
  if [ -f "$PROXY_PID" ]; then kill "$(cat "$PROXY_PID")" 2>/dev/null; rm -f "$PROXY_PID"; fi
  rm -f "$STATE"/tunnel-*.log
  echo "Stopped all links and the proxy."
}

case "${1:-1}" in
  list) list_links ;;
  stop) stop_all ;;
  ''|*[!0-9]*) echo "Usage: ./mirrors.sh [count|list|stop]"; exit 1 ;;
  *)
    command -v cloudflared >/dev/null || { echo "cloudflared not found. Mac: brew install cloudflared"; exit 1; }
    start_proxy
    prune
    echo "New links (may take ~30s to start working):"
    for _ in $(seq 1 "$1"); do new_link | sed 's/^/  /'; done
    echo
    list_links
    echo
    echo "Links stay up while this Mac is on. Stop them with: ./mirrors.sh stop"
    ;;
esac
