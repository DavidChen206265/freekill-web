#!/bin/bash
# asio 依赖探测 — 由 WSL 执行,避免跨 MSYS 边界的引号问题
echo "=== distro ==="
lsb_release -d
echo "=== tools ==="
for t in git g++ cmake pkg-config make lua5.4; do
  if command -v "$t" >/dev/null 2>&1; then
    echo "OK   $t -> $(command -v "$t")"
  else
    echo "MISS $t"
  fi
done
echo "=== versions ==="
g++ --version | head -1
cmake --version | head -1
lua5.4 -v 2>&1 | head -1
echo "=== dev libs ==="
for p in libasio-dev libssl-dev libcbor-dev nlohmann-json3-dev libsqlite3-dev libgit2-dev libreadline-dev libspdlog-dev lua-socket lua-filesystem; do
  v=$(dpkg-query -W -f='${Version}' "$p" 2>/dev/null)
  if [ -n "$v" ]; then echo "OK   $p $v"; else echo "MISS $p"; fi
done
