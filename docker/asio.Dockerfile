# freekill-web-asio — build the Web-only C++ game server fork and run it with the
# freekill-core package. Build context = repo root (E:/Games/freekill) so we can COPY
# the freekill-web-asio source AND the FreeKill-release packages (siblings of
# freekill-web). The fork (vs upstream freekill-asio) adds the Web-only config
# switches (webOnly / checkClientMd5 / invalidateRoomsOnPackageChange / tempBanByIp)
# + the SetServerSettings Web manifest. See freekill-web/analysis/WEB_ONLY_ROADMAP.md.
#
#   docker compose build asio   (context: repo root, see docker-compose.yml)

# ---- build stage ----
FROM ubuntu:24.04 AS build
ENV DEBIAN_FRONTEND=noninteractive
# Deps per memory asio-wsl-runtime: all find_package()'d, no network pulls at build.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git g++ cmake pkg-config make \
      libboost-dev libboost-system-dev \
      libasio-dev libssl-dev libcbor-dev nlohmann-json3-dev libsqlite3-dev \
      libgit2-dev libreadline-dev libspdlog-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY freekill-web-asio/ ./
RUN rm -rf build && mkdir build && cd build && cmake .. && make -j"$(nproc)"

# ---- runtime stage ----
FROM ubuntu:24.04 AS runtime
ENV DEBIAN_FRONTEND=noninteractive
# Install runtime libs by pulling the same -dev packages that built it: avoids
# guessing versioned .so package names (libgit2-1.7 etc.) that drift across Ubuntu
# point releases. Slightly larger image, but reliable. Plus lua5.4 + rocks (asio
# forks `lua5.4` to run the game logic).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libssl-dev libsqlite3-dev libgit2-dev libreadline-dev libspdlog-dev libcbor-dev \
      libboost-system-dev \
      lua5.4 lua-socket lua-filesystem \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /src/build/freekill-asio ./freekill-asio
# The freekill-core package set (game rules/cards/generals) + db init.
COPY FreeKill-release/packages/freekill-core ./packages/freekill-core
# Extension packs the server must ALSO load (generals/cards/skills the web VM expects).
# asio discovers a pack when packages/<name>/init.lua exists AND it's not db-disabled
# (core/util.cpp listEnabledPacks + freekill-core mod_manager.lua loadPackages). The
# client side already ships these (sync-fk-assets EXTENSION_PACKS + .dockerignore +
# deploy.sh WEB_UPSTREAM_PACKS) — keep this set in sync with those. Web-only fork skips
# the client MD5 check, so no FK_MD5 recompute is needed when changing this set.
COPY FreeKill-release/packages/utility ./packages/utility
COPY FreeKill-release/packages/standard_ex ./packages/standard_ex
COPY FreeKill-release/packages/sp ./packages/sp
COPY FreeKill-release/packages/shzl ./packages/shzl
# packages.db / init.sql live alongside packages in the release tree.
COPY FreeKill-release/packages/packages.db ./packages/packages.db
COPY FreeKill-release/packages/init.sql ./packages/init.sql
# Ensure the extension packs are ENABLED in the registry (the upstream release db
# ships some disabled, e.g. sp). asio skips any pack with enabled=0 (PackMan loads
# it into disabled_packs → mod_manager.lua filters it out), even if its files are
# present. Flip them on at build time so the baked image is self-consistent and
# reproducible regardless of the (git-untracked) release db's enabled flags.
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 \
    && sqlite3 ./packages/packages.db \
         "UPDATE packages SET enabled=1 WHERE name IN ('utility','standard_ex','sp','shzl');" \
    && apt-get purge -y sqlite3 && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
COPY freekill-web/docker/freekill.server.config.json ./freekill.server.config.json
# DB init scripts asio needs in server/ to create users.db (server/init.sql,
# c-wrapper.h:13) and game.db (server/gamedb_init.sql, server.cpp:109). server/ is
# a VOLUME (an empty mount would shadow image content), so stage these in a
# non-volume dir; the entrypoint seeds them into server/ on first run.
COPY FreeKill-release/server/init.sql ./server-init/init.sql
COPY FreeKill-release/server/gamedb_init.sql ./server-init/gamedb_init.sql

# server/ holds users.db, game.db and the RSA keypair — asio creates them on first
# run and they MUST persist across restarts (accounts, stats, identity). Mount a
# volume here (see docker-compose.yml). Declared so it's never baked into the image.
VOLUME ["/app/server"]

# asio is an interactive CLI: it reads stdin and exits on EOF. Feed it a never-ending
# stdin so it stays up as a daemon (the FIFO trick from wsl-run-asio.sh, inlined).
EXPOSE 9527/tcp 9527/udp
COPY freekill-web/docker/asio-entrypoint.sh /usr/local/bin/asio-entrypoint.sh
RUN chmod +x /usr/local/bin/asio-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/asio-entrypoint.sh"]
