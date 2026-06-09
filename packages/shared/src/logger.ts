// logger.ts — isomorphic structured logger for the FreeKill web stack (browser +
// gateway). Goals: zero overhead in normal play, full detail on demand, and an
// in-memory ring buffer that can be exported as JSON for bug reports.
//
// Every log entry is a structured record (category + level + message + optional
// data) rather than a free-form string, so the VM debug panel and the gateway can
// filter/colour by category and so the unhandled-notifyUI detector can live
// alongside the same plumbing. Console output is gated by a level threshold; the
// ring buffer always captures (cheap) so a problem that already happened is still
// inspectable after you raise the threshold.

/** Severity, ordered. `silent` disables console output entirely. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'

/** Coarse category for filtering. Kept open (string) but these are the canonical
 *  ones the wiring emits. */
export type LogCategory =
  | 'net-in' // server → client packet (envelope) arrived
  | 'net-out' // client → server notify/reply sent
  | 'vm-feed' // raw packet fed into the client VM
  | 'vm-notify' // VM emitted a notifyUI delta
  | 'reply' // a reply was produced for a request (VM ReplyToServer / popup resolve)
  | 'unhandled' // a VM notifyUI command no store consumed (五谷-class detector)
  | 'lifecycle' // boot/connect/reconnect/park/login etc.
  | 'error'

export interface LogEntry {
  seq: number
  t: number // epoch ms
  cat: LogCategory
  level: LogLevel
  msg: string
  data?: unknown
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 }

export interface LoggerOptions {
  /** Console threshold: entries at or above this level print. Default 'silent'. */
  level?: LogLevel
  /** Ring-buffer capacity. Default 500. */
  capacity?: number
  /** Tag prefixed to console lines (e.g. 'web' / 'gateway'). */
  tag?: string
  /** Console sink (injectable for tests). Default the platform console. */
  sink?: (entry: LogEntry, formatted: string) => void
  /** Clock (injectable for tests). Default Date.now. */
  now?: () => number
}

export class Logger {
  private level: LogLevel
  private readonly capacity: number
  private readonly tag: string
  private readonly sink: (entry: LogEntry, formatted: string) => void
  private readonly now: () => number
  private buf: LogEntry[] = []
  private seq = 0
  /** Per-category counters (e.g. how many `unhandled` so far). */
  readonly counts: Record<string, number> = {}

  constructor(opts: LoggerOptions = {}) {
    this.level = opts.level ?? 'silent'
    this.capacity = Math.max(1, opts.capacity ?? 500)
    this.tag = opts.tag ?? 'fk'
    this.now = opts.now ?? Date.now
    this.sink = opts.sink ?? defaultConsoleSink
  }

  setLevel(level: LogLevel): void { this.level = level }
  getLevel(): LogLevel { return this.level }

  log(cat: LogCategory, level: LogLevel, msg: string, data?: unknown): void {
    const entry: LogEntry = { seq: ++this.seq, t: this.now(), cat, level, msg, data }
    // Always capture into the ring buffer (cheap; survives a later level change).
    this.buf.push(entry)
    if (this.buf.length > this.capacity) this.buf.splice(0, this.buf.length - this.capacity)
    this.counts[cat] = (this.counts[cat] ?? 0) + 1
    // Console output only when the entry meets the threshold.
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[this.level] && this.level !== 'silent') {
      this.sink(entry, `[${this.tag}:${cat}] ${msg}`)
    }
  }

  debug(cat: LogCategory, msg: string, data?: unknown): void { this.log(cat, 'debug', msg, data) }
  info(cat: LogCategory, msg: string, data?: unknown): void { this.log(cat, 'info', msg, data) }
  warn(cat: LogCategory, msg: string, data?: unknown): void { this.log(cat, 'warn', msg, data) }
  error(cat: LogCategory, msg: string, data?: unknown): void { this.log(cat, 'error', msg, data) }

  /** Most-recent-last snapshot of the ring buffer. */
  recent(limit?: number): LogEntry[] {
    return limit ? this.buf.slice(-limit) : this.buf.slice()
  }

  /** JSON blob for a bug report (entries + counts + meta). */
  export(): string {
    return JSON.stringify({ tag: this.tag, exportedAt: this.now(), counts: this.counts, entries: this.buf }, replacer(), 2)
  }

  clear(): void {
    this.buf = []
    for (const k of Object.keys(this.counts)) delete this.counts[k]
  }
}

// Trim noisy/huge data for console; keep a short preview. The ring buffer keeps the
// real object (export uses a circular-safe replacer).
type ConsoleLike = { log: (...a: unknown[]) => void; warn: (...a: unknown[]) => void; error: (...a: unknown[]) => void }

function defaultConsoleSink(entry: LogEntry, formatted: string): void {
  // Both the browser and node provide a global `console`; the shared lib doesn't
  // declare DOM/node types, so reach it via globalThis with a minimal shape.
  const c = (globalThis as { console?: ConsoleLike }).console
  if (!c) return
  const fn = entry.level === 'error' ? c.error : entry.level === 'warn' ? c.warn : c.log
  if (entry.data === undefined) fn.call(c, formatted)
  else fn.call(c, formatted, preview(entry.data))
}

function preview(data: unknown): string {
  try {
    const s = JSON.stringify(data, replacer())
    return s.length > 200 ? s.slice(0, 200) + '…' : s
  } catch { return String(data) }
}

// Circular-safe + BigInt-safe JSON replacer (VM payloads can be cyclic / hold BigInt).
function replacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>()
  return (_key: string, value: unknown) => {
    if (typeof value === 'bigint') return Number(value)
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '[Circular]'
      seen.add(value)
    }
    return value
  }
}
