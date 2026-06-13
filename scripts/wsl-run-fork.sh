#!/usr/bin/env bash
# Set up + run the freekill-web-asio fork runtime in WSL for behavioral verification.
# Web-only config: checkClientMd5=false. Run in background (feeds a fifo as stdin).
set -uo pipefail

DST=$HOME/freekill-web-asio
SRC_RT=$HOME/freekill-asio   # existing built upstream runtime (has packages + packages.db)
RELEASE=/mnt/e/Games/freekill/FreeKill-release/packages
ENABLED_PACKS=(freekill-core utility standard_ex sp shzl)

enable_packs() {
  local db="$DST/packages/packages.db"
  [ -f "$db" ] || return 0
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$db" "
      INSERT INTO packages(name,url,hash,enabled) SELECT 'utility','','',1 WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name='utility');
      INSERT INTO packages(name,url,hash,enabled) SELECT 'standard_ex','','',1 WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name='standard_ex');
      INSERT INTO packages(name,url,hash,enabled) SELECT 'sp','','',1 WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name='sp');
      INSERT INTO packages(name,url,hash,enabled) SELECT 'shzl','','',1 WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name='shzl');
      UPDATE packages SET enabled=1 WHERE name IN ('utility','standard_ex','sp','shzl');
    "
  elif command -v python3 >/dev/null 2>&1; then
    python3 - "$db" <<'PY'
import sqlite3
import sys
db = sys.argv[1]
con = sqlite3.connect(db)
for pack in ("utility", "standard_ex", "sp", "shzl"):
    con.execute("INSERT INTO packages(name,url,hash,enabled) SELECT ?, '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM packages WHERE name = ?)", (pack, pack))
con.execute("UPDATE packages SET enabled=1 WHERE name IN ('utility','standard_ex','sp','shzl')")
con.commit()
con.close()
PY
  else
    echo "WARN: sqlite3/python3 not found; cannot flip extension packs in packages.db"
  fi
}

cd "$DST"

# Clear stale upstream/fork instances before binding 9527. Otherwise this script
# can report the new runtime layout while the browser is still talking to an old
# ~/freekill-asio process that lacks newly synced extension directories.
pkill -f "$HOME/freekill-web-asio/freekill-asio" 2>/dev/null || true
pkill -f "$HOME/freekill-web-asio/build/freekill-asio" 2>/dev/null || true
pkill -f "$HOME/freekill-asio/freekill-asio" 2>/dev/null || true
pkill -f "$HOME/freekill-asio/build/freekill-asio" 2>/dev/null || true
pkill -f "tail -f /tmp/fk-fork.cmds" 2>/dev/null || true
sleep 1

# binary already at build/freekill-asio; symlink to run dir
ln -sf build/freekill-asio freekill-asio

# packages: copy from the existing asio runtime (freekill-core + utility/standard_ex/sp + packages.db)
if [ ! -d "$DST/packages/freekill-core" ]; then
  echo "=== copying packages from $SRC_RT ==="
  cp -r "$SRC_RT/packages/." "$DST/packages/"
fi
echo "=== ensure enabled packages from FreeKill-release ==="
mkdir -p "$DST/packages"
for p in "${ENABLED_PACKS[@]}"; do
  if [ -d "$RELEASE/$p" ]; then
    rm -rf "$DST/packages/$p"
    cp -r "$RELEASE/$p" "$DST/packages/$p"
  fi
done
[ -f "$RELEASE/packages.db" ] && cp "$RELEASE/packages.db" "$DST/packages/packages.db"
[ -f "$RELEASE/init.sql" ] && cp "$RELEASE/init.sql" "$DST/packages/init.sql"
enable_packs

# Web-only config with WRONG md5 path irrelevant; key is checkClientMd5:false
cat > "$DST/freekill.server.config.json" <<'JSON'
{
  "banwords": [],
  "description": "FreeKill Web-only fork",
  "iconUrl": "default",
  "capacity": 100,
  "tempBanTime": 0,
  "motd": "Welcome!",
  "hiddenPacks": [],
  "disabledFeatures": [],
  "enableWhitelist": false,
  "roomCountPerThread": 2000,
  "maxPlayersPerDevice": 50,
  "webOnly": true,
  "checkClientMd5": false,
  "invalidateRoomsOnPackageChange": false,
  "tempBanByIp": false
}
JSON

echo "=== config ==="
grep -E "checkClientMd5|webOnly" "$DST/freekill.server.config.json"

# run with fifo stdin so it stays alive (see asio-wsl-runtime memory)
FIFO=/tmp/fk-fork.cmds
rm -f "$FIFO"; mkfifo "$FIFO"
nohup bash -c 'tail -f "$1" | "$2"' _ "$FIFO" "$DST/freekill-asio" >/tmp/fk-fork.log 2>&1 &
echo "started pid via subshell; log /tmp/fk-fork.log"
sleep 3
echo "=== startup log ==="
tail -15 /tmp/fk-fork.log
echo "=== md5 the server computed ==="
grep -i "md5" /tmp/fk-fork.log | head
echo "=== listening? ==="
ss -tlnp 2>/dev/null | grep 9527 || echo "NOT listening on 9527"
echo "=== eth0 IP ==="
hostname -I
