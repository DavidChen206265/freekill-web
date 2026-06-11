#!/usr/bin/env bash
# w0-3-scenario.sh — self-contained W0-3 verification inside one WSL session.
# Starts the fork, drives `disable sp` (triggers refreshMd5) on a timer via the
# server's own stdin, and records server log. A node lobby probe (Windows side)
# runs concurrently and reports whether it got kicked. This script just proves the
# server PROCESSES the refresh (so the probe's "not kicked" is meaningful).
#
# Arg $1: "webonly" (invalidateRoomsOnPackageChange=false) or "upstream" (true).
set -uo pipefail
DST=$HOME/freekill-web-asio
MODE="${1:-webonly}"
cd "$DST"
ln -sf build/freekill-asio freekill-asio

INVAL=false
[ "$MODE" = "upstream" ] && INVAL=true
cat > "$DST/freekill.server.config.json" <<JSON
{
  "description": "FreeKill W0-3 test ($MODE)",
  "tempBanTime": 0,
  "disabledFeatures": [],
  "webOnly": true,
  "checkClientMd5": false,
  "invalidateRoomsOnPackageChange": $INVAL,
  "tempBanByIp": false
}
JSON
echo "=== mode=$MODE invalidateRoomsOnPackageChange=$INVAL ==="

LOG=/tmp/fk-w03-$MODE.log
# Feed commands directly to the server's stdin (no fifo). Keep the server alive a
# long time so a separately-launched node probe has a wide window: wait 20s for the
# probe to connect + sit in lobby, fire `disable sp` (→ refreshMd5), then idle so
# the probe can observe whether it survived. The harness stops this background task.
{
  sleep 20
  echo "disable sp"
  sleep 120
} | ./freekill-asio > "$LOG" 2>&1 &
SRV=$!
echo "server pid=$SRV log=$LOG"
sleep 3
ss -tlnp 2>/dev/null | grep 9527 >/dev/null && echo "LISTENING" || echo "NOT-LISTENING"
echo "scenario armed: disable sp fires ~20s after server start; server idles 120s after"
wait $SRV
echo "=== server exited; log tail ==="
grep -iE "disable|enable|package|refresh|md5|kick|outdate" "$LOG" | tr -d '\r' | tail -20
