#!/bin/bash
# 在 WSL 内常驻运行 freekill-asio。
# 由 Windows 侧以 run_in_background 方式调用,该调用持续存活 => WSL 会话不被拆除。
# asio 需要一个不会立即 EOF 的 stdin(它是交互式 CLI),用 tail -f 喂一个空文件。
set -e
cd ~/freekill-asio

# 清掉旧实例
pkill -f "build/freekill-asio" 2>/dev/null || true
sleep 1

# 用一个持续打开的管道当 stdin:tail -f 永不结束 => asio 的 CLI 不会读到 EOF。
CMD_PIPE=/tmp/fk-asio.cmds
rm -f "$CMD_PIPE"
: > "$CMD_PIPE"

echo "[launcher] starting freekill-asio (log: /tmp/fk-asio.log)"
# tail -f 提供 stdin;asio 输出到日志。整条管线在前台,使本脚本(及 WSL 会话)持续存活。
tail -f "$CMD_PIPE" | ./freekill-asio 2>&1 | tee /tmp/fk-asio.log
