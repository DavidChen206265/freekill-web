// log.ts — the gateway's shared structured Logger instance (see
// @freekill-web/shared Logger). Mirrors the web's diag/log.ts so a session can be
// traced end-to-end (browser ⇄ gateway ⇄ asio).
//
// Console verbosity is set by the FK_LOG env var, OFF-ish by default:
//   FK_LOG=debug | info | warn | error | silent
//   (unset → 'warn': only warnings/errors print; the ring buffer still captures
//    everything so a recent problem is inspectable.)
// Packet-level tracing (every browser/asio packet) is at 'debug', so normal runs
// stay quiet and `FK_LOG=debug` turns on the firehose.

import { Logger, type LogLevel } from '@freekill-web/shared'

function envLevel(): LogLevel {
  const v = (process.env.FK_LOG ?? '').toLowerCase()
  if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' || v === 'silent') return v
  return 'warn'
}

export const log = new Logger({ tag: 'gateway', level: envLevel(), capacity: 1000 })
