#!/bin/sh
# asio-entrypoint.sh — run freekill-asio as a daemon inside the container.
# asio is an interactive CLI that exits on stdin EOF, so we feed it a FIFO that
# never closes (a background `sleep infinity` holds the write end open). asio logs
# to stdout/stderr → captured by `docker logs`.
set -e
cd /app

# server/ (users.db, game.db, RSA keys) is a mounted volume; asio creates the DBs
# on first run from the init scripts, which must be present in server/. Seed them
# from the image's staging dir if the volume doesn't have them yet (they're static).
mkdir -p server
[ -f server/init.sql ] || cp server-init/init.sql server/init.sql
[ -f server/gamedb_init.sql ] || cp server-init/gamedb_init.sql server/gamedb_init.sql

PIPE=/tmp/fk-asio.cmds
rm -f "$PIPE"
mkfifo "$PIPE"
# Hold the FIFO open for writing so asio never sees EOF (you can also
# `docker exec ... sh -c 'echo pkgs > /tmp/fk-asio.cmds'` to send CLI commands).
sleep infinity > "$PIPE" &

echo "[asio-entrypoint] starting freekill-asio on :9527"
exec ./freekill-asio < "$PIPE"
