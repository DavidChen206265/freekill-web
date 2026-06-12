#!/usr/bin/env bash
# vps-cache-forensics.sh — diagnose "browser keeps serving stale JS even after hard
# refresh" by pinpointing WHICH layer holds the stale bytes (source files / Caddy
# headers / Cloudflare edge / Service Worker). READ-ONLY except the optional CF purge
# at the end (guarded). Run on the VPS (or anywhere with curl to the public URL).
#
# Usage:
#   bash vps-cache-forensics.sh https://sgs.davidchen.me
#   bash vps-cache-forensics.sh https://sgs.davidchen.me /srv   # also check on-disk files
set -uo pipefail
URL="${1:-https://sgs.davidchen.me}"
SRV="${2:-}"                       # optional: path to served root (e.g. /srv) for on-disk check
URL="${URL%/}"

hr() { printf '\n=== %s ===\n' "$1"; }

hr "1) index.html — served headers + which bundle it references"
# -sS quiet, -D - dump headers, -L follow. We want Cache-Control + CF-Cache-Status.
hdr=$(curl -sS -D - -o /tmp/_idx.html "$URL/?cb=$(date +%s)" 2>&1)
echo "$hdr" | grep -iE "^HTTP/|cache-control|cf-cache-status|age:|etag|last-modified|cf-ray" || echo "(no notable headers)"
echo "--- index.html references this JS bundle: ---"
bundle=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /tmp/_idx.html | head -1)
echo "  ${bundle:-<none found>}"

hr "2) Is that bundle reachable + how is it cached?"
if [ -n "$bundle" ]; then
  curl -sS -D - -o /dev/null "$URL/$bundle" 2>&1 | grep -iE "^HTTP/|cache-control|cf-cache-status|age:|content-length" || true
else
  echo "  (skip — no bundle parsed from index.html)"
fi

hr "3) sw.js — the Service Worker control file (MUST revalidate, not be CDN-cached)"
curl -sS -D - -o /tmp/_sw.js "$URL/sw.js?cb=$(date +%s)" 2>&1 | grep -iE "^HTTP/|cache-control|cf-cache-status|age:|etag" || true
echo "--- sw.js precaches this index.html revision: ---"
grep -oE '"revision":"[a-f0-9]+","url":"index.html"' /tmp/_sw.js 2>/dev/null | head -1 || echo "  (revision not found — different workbox layout)"
echo "--- sw.js references bundle: ---"
grep -oE 'index-[A-Za-z0-9_-]+\.js' /tmp/_sw.js 2>/dev/null | head -1 || echo "  (none)"

hr "4) Consistency check"
swbundle=$(grep -oE 'index-[A-Za-z0-9_-]+\.js' /tmp/_sw.js 2>/dev/null | head -1)
idxbundle=$(echo "${bundle:-}" | grep -oE 'index-[A-Za-z0-9_-]+\.js')
echo "  index.html bundle : ${idxbundle:-<none>}"
echo "  sw.js     bundle : ${swbundle:-<none>}"
if [ -n "$idxbundle" ] && [ -n "$swbundle" ]; then
  [ "$idxbundle" = "$swbundle" ] && echo "  ✓ index.html and sw.js agree (server side is self-consistent → staleness is in the CLIENT or CDN)" \
                                 || echo "  ✗ MISMATCH — server is serving an inconsistent index.html vs sw.js (a CDN/edge is caching one but not the other → PURGE the CDN)"
fi

if [ -n "$SRV" ]; then
  hr "5) On-disk vs served (is the deploy even on disk?)"
  echo "--- $SRV/index.html references: ---"
  grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$SRV/index.html" 2>/dev/null | head -1 || echo "  (cannot read $SRV/index.html)"
  echo "--- newest built bundle on disk: ---"
  ls -1t "$SRV/assets/"index-*.js 2>/dev/null | head -1 | xargs -r basename || echo "  (none)"
fi

hr "VERDICT GUIDE"
cat <<'TXT'
- index.html Cache-Control shows NO "no-cache" / has long max-age  → browser/CDN pins old HTML → it keeps loading the old bundle. FIX: the Caddyfile @html no-cache (this commit) + redeploy.
- cf-cache-status: HIT on index.html or sw.js                      → Cloudflare is serving stale. FIX: CF dashboard → Purge Everything; add a Cache Rule to BYPASS cache for /, /index.html, /sw.js, /manifest.webmanifest.
- index.html vs sw.js bundle MISMATCH                              → a CDN/edge cached one layer. Purge CF.
- on-disk index.html bundle != newest dist bundle                  → the DEPLOY didn't actually update the files (build/rsync issue, like the 2g stale-image trap). Rebuild + redeploy.
- everything consistent + no-cache + CF MISS, but a user STILL sees old → that user's Service Worker is stuck. Have them: DevTools → Application → Service Workers → Unregister, then reload. (autoUpdate normally handles this once sw.js is fetchable fresh.)
TXT
