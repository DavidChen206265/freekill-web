#!/usr/bin/env bash
# vps-audio-forensics.sh — diagnose why card voices (过河拆桥/乐不思蜀) are silent
# on the VPS while they work locally (W1-1 #2g). Run from the deploy dir that holds
# docker-compose.yml (freekill-web/docker on the VPS), as the user who runs compose.
#
#   bash vps-audio-forensics.sh [PUBLIC_BASE_URL]
#
# PUBLIC_BASE_URL: how a browser reaches the site, e.g. https://play.example.com
# or http://1.2.3.4:8088 . If omitted, the public-URL probes are skipped.
#
# It ONLY reads state (ls / grep / curl / docker logs) — no changes. Paste the whole
# output back to the dev. Each section prints a verdict hint.
set -uo pipefail

BASE="${1:-}"
# Two card voices that reportedly have no sound on the VPS.
PROBES=(
  "audio/card/male/dismantlement.mp3"   # 过河拆桥
  "audio/card/male/indulgence.mp3"      # 乐不思蜀
  "audio/card/common/weapon.mp3"        # 装备通用音(本地确认能响,做对照)
  "audio/system/bgm.mp3"                # BGM
)

line() { printf '\n========== %s ==========\n' "$1"; }

# Pick the compose CLI (v2 plugin or legacy).
DC="docker compose"
if ! $DC version >/dev/null 2>&1; then DC="docker-compose"; fi
echo "[forensics] using: $DC"
echo "[forensics] cwd: $(pwd)"

line "1. caddy container: are the audio files in /srv/fk ?"
for p in "${PROBES[@]}"; do
  out=$($DC exec -T caddy sh -c "ls -la /srv/fk/$p 2>&1" 2>&1)
  echo "  $p -> $out"
done
echo "--- /srv/fk/audio/card/male sample (first 10) ---"
$DC exec -T caddy sh -c 'ls /srv/fk/audio/card/male/ 2>&1 | head' 2>&1 | sed 's/^/  /'
echo "--- /srv/fk/audio.json present + size ---"
$DC exec -T caddy sh -c 'ls -la /srv/fk/audio.json 2>&1' 2>&1 | sed 's/^/  /'

line "2. audio.json: do the probed paths appear?"
for p in "${PROBES[@]}"; do
  hit=$($DC exec -T caddy sh -c "grep -o '$p' /srv/fk/audio.json 2>/dev/null | head -1" 2>&1)
  echo "  $p -> ${hit:-<MISSING from audio.json>}"
done

line "3. public URL probe (what the BROWSER actually gets)"
if [ -z "$BASE" ]; then
  echo "  (skipped — pass the public base URL as arg 1, e.g. https://play.example.com)"
else
  BASE="${BASE%/}"
  for p in "${PROBES[@]}"; do
    # -k tolerate self-signed; -s silent; show status + content-type + length
    info=$(curl -skI "$BASE/fk/$p" 2>&1 | tr -d '\r' | grep -iE '^HTTP/|^content-type:|^content-length:' | paste -sd' | ' -)
    echo "  $BASE/fk/$p"
    echo "      -> ${info:-<no response>}"
  done
  echo "  NOTE: want 'HTTP/.. 200' + 'content-type: audio/mpeg'."
  echo "        '200 + content-type: text/html' = SPA fallback (Caddyfile bug);"
  echo "        '404' = file not deployed into /srv/fk."
fi

line "4. running image freshness (is the VPS on an OLD build?)"
$DC images 2>&1 | sed 's/^/  /'
echo "--- caddy image created / build time ---"
cid=$($DC ps -q caddy 2>/dev/null | head -1)
if [ -n "$cid" ]; then
  img=$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null)
  echo "  caddy container image: $img"
  docker inspect -f '  image created: {{.Created}}' "$img" 2>&1
  docker inspect -f '  container started: {{.State.StartedAt}}' "$cid" 2>&1
fi

line "5. asio: what sound path does the server broadcast?"
echo "--- recent PlaySound / broadcast in asio logs (if any) ---"
$DC logs asio --tail 400 2>&1 | grep -iE "playsound|broadcast|audio/card|md5" | tail -20 | sed 's/^/  /'
echo "  (empty = no card used yet this session, or logs rotated — use a card then re-run)"

line "6. git HEAD of the deployed source"
echo "  freekill-web HEAD:"
git -C ../.. rev-parse --short HEAD 2>&1 | sed 's/^/    /' || echo "    (not a git checkout?)"
echo "  freekill-web log -1:"
git -C ../.. log --oneline -1 2>&1 | sed 's/^/    /' || true

line "DONE — paste everything above back to the dev"
