#!/usr/bin/env bash
# Run the fork in the FOREGROUND (this invocation stays alive via run_in_background).
# stdin is fed by a fifo so the CLI doesn't EOF-exit.
set -uo pipefail
DST=$HOME/freekill-web-asio
cd "$DST"
ln -sf build/freekill-asio freekill-asio
# rsync --delete (build script) wipes the runtime config (not in source tree);
# (re)write the Web-only config each start so checkClientMd5=false etc. persist.
cat > "$DST/freekill.server.config.json" <<'JSON'
{
  "description": "FreeKill Web-only fork",
  "tempBanTime": 0,
  "motd": "Welcome!",
  "disabledFeatures": [],
  "webOnly": true,
  "checkClientMd5": false,
  "invalidateRoomsOnPackageChange": false,
  "tempBanByIp": false
}
JSON
FIFO=/tmp/fk-fork.cmds
rm -f "$FIFO"; mkfifo "$FIFO"
echo "starting fork on 9527 (foreground, fifo stdin)"
# keep fifo open for writing so tail never sees EOF
exec 3<>"$FIFO"
tail -f "$FIFO" | ./freekill-asio
