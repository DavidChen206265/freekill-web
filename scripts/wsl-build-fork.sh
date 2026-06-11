#!/usr/bin/env bash
# Build the freekill-web-asio fork in WSL native fs to verify it compiles.
# Run via: wsl -d Ubuntu -- bash /mnt/e/Games/freekill/freekill-web/scripts/wsl-build-fork.sh
set -euo pipefail

SRC=/mnt/e/Games/freekill/freekill-web-asio
DST=$HOME/freekill-web-asio

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

echo "=== configure ==="
cd "$DST"
mkdir -p build
cd build
cmake .. >/tmp/fork-cmake.log 2>&1 && echo "cmake OK" || { echo "cmake FAILED"; tail -20 /tmp/fork-cmake.log; exit 1; }

echo "=== build ==="
make -j"$(nproc)" >/tmp/fork-make.log 2>&1 && echo "make OK" || { echo "make FAILED"; tail -40 /tmp/fork-make.log; exit 1; }

echo "=== binary ==="
ls -la "$DST/build/freekill-asio" && echo "BUILD SUCCESS"
