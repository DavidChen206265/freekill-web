#!/usr/bin/env bash
# Build the freekill-web-asio fork in WSL native fs to verify it compiles.
# Run via: wsl -d Ubuntu -- bash /mnt/e/Games/freekill/freekill-web/scripts/wsl-build-fork.sh
set -euo pipefail

SRC=/mnt/e/Games/freekill/freekill-web-asio
DST=$HOME/freekill-web-asio
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

echo "=== sync source (exclude .git/build/packages) ==="
mkdir -p "$DST"
# NOTE: exclude packages — they are runtime data copied separately (large, and not
# in the source tree). --delete must not wipe them.
rsync -a --delete --exclude=.git --exclude=build --exclude=packages --exclude=freekill.server.config.json "$SRC/" "$DST/"
echo "synced files: $(find "$DST" -type f | wc -l)"

# ensure packages present (copy from the existing upstream runtime if missing)
if [ ! -d "$DST/packages/freekill-core" ]; then
  echo "=== packages missing — copying from \$HOME/freekill-asio ==="
  mkdir -p "$DST/packages"
  cp -r "$HOME/freekill-asio/packages/." "$DST/packages/"
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

echo "=== configure ==="
cd "$DST"
mkdir -p build
cd build
cmake .. >/tmp/fork-cmake.log 2>&1 && echo "cmake OK" || { echo "cmake FAILED"; tail -20 /tmp/fork-cmake.log; exit 1; }

echo "=== build ==="
make -j"$(nproc)" >/tmp/fork-make.log 2>&1 && echo "make OK" || { echo "make FAILED"; tail -40 /tmp/fork-make.log; exit 1; }

echo "=== binary ==="
ls -la "$DST/build/freekill-asio" && echo "BUILD SUCCESS"
