// log.ts — the web app's shared Logger instance + the unhandled-notifyUI detector.
//
// Console output is OFF by default (so normal play has zero console noise); the
// ring buffer always captures so a problem that already happened is inspectable.
// Toggle console verbosity at runtime without a rebuild:
//   localStorage.fk_log = 'debug' | 'info' | 'warn' | 'error' | 'silent'
//   (then reload, or call setLogLevel(...) from the console / VM debug panel)
//
// The detector (noteNotify) is the durable guard against 五谷-class bugs: it flags
// any notifyUI command that no store consumed AND that isn't a known VM-mirror-
// driven command. See KNOWN_CONSUMED below — that list doubles as living
// documentation of how every command reaches the UI.

import { Logger, type LogLevel } from '@freekill-web/shared'
import { classifyNotify } from './notifyCommands.js'

function initialLevel(): LogLevel {
  try {
    const v = localStorage.getItem('fk_log')
    if (v === 'debug' || v === 'info' || v === 'warn' || v === 'error' || v === 'silent') return v
  } catch { /* no localStorage (SSR / private mode) */ }
  return 'silent'
}

export const log = new Logger({ tag: 'web', level: initialLevel(), capacity: 800 })

/** Change console verbosity at runtime (also persisted for next load). */
export function setLogLevel(level: LogLevel): void {
  log.setLevel(level)
  try { localStorage.setItem('fk_log', level) } catch { /* ignore */ }
}

// Commands the web consumes via an EXPLICIT branch, the VM mirror, or that are
// deferred to M4 slice V — all enumerated in ./notifyCommands.ts (the living
// documentation of how each command reaches the UI). classifyNotify() decides.

const seenUnhandled = new Set<string>()

/**
 * Record a notifyUI emission and detect 五谷-class gaps. `handled` = whether a store
 * actually consumed it (popupStore.handle return value OR an explicit branch ran).
 * Returns nothing; logs at the right level.
 */
export function noteNotify(command: string, data: unknown, handled: boolean): void {
  log.debug('vm-notify', command, data)
  const disposition = classifyNotify(command, handled)
  if (disposition === 'deferred') {
    log.info('vm-notify', `deferred (M4-V) command not yet rendered: ${command}`, data)
    return
  }
  if (disposition !== 'unhandled') return
  // Genuinely unconsumed + unknown → the 五谷 bug class. Warn once per command so the
  // log isn't flooded, but always bump the counter (visible in the debug panel).
  if (!seenUnhandled.has(command)) {
    seenUnhandled.add(command)
    log.warn('unhandled', `notifyUI "${command}" has NO consumer (五谷-class gap)`, data)
  } else {
    log.log('unhandled', 'debug', `unhandled "${command}" (repeat)`, data)
  }
}

/** For tests + the debug panel: how many distinct unhandled commands were seen. */
export function unhandledCommands(): string[] {
  return [...seenUnhandled]
}
