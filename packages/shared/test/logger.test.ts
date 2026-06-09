// logger.test.ts — ring buffer truncation, level gating, counts, export shape.

import { describe, it, expect } from 'vitest'
import { Logger, type LogEntry } from '../src/logger.js'

describe('Logger', () => {
  it('captures into the ring buffer regardless of console level (silent default)', () => {
    const printed: string[] = []
    const log = new Logger({ sink: (_e, f) => printed.push(f) })
    log.info('net-in', 'hello')
    log.warn('vm-notify', 'world')
    // silent → nothing printed, but both captured.
    expect(printed).toEqual([])
    expect(log.recent().map((e) => e.msg)).toEqual(['hello', 'world'])
  })

  it('prints only entries at or above the console threshold', () => {
    const printed: LogEntry[] = []
    const log = new Logger({ level: 'warn', sink: (e) => printed.push(e) })
    log.debug('net-in', 'd')
    log.info('net-in', 'i')
    log.warn('net-in', 'w')
    log.error('error', 'e')
    expect(printed.map((e) => e.msg)).toEqual(['w', 'e'])
    // ring buffer still has all four.
    expect(log.recent()).toHaveLength(4)
  })

  it('truncates the ring buffer to capacity (keeps newest)', () => {
    const log = new Logger({ capacity: 3 })
    for (let i = 0; i < 10; i++) log.info('net-in', `m${i}`)
    const msgs = log.recent().map((e) => e.msg)
    expect(msgs).toEqual(['m7', 'm8', 'm9'])
  })

  it('counts per category', () => {
    const log = new Logger()
    log.info('net-in', 'a'); log.info('net-in', 'b'); log.warn('unhandled', 'c')
    expect(log.counts['net-in']).toBe(2)
    expect(log.counts['unhandled']).toBe(1)
  })

  it('recent(limit) returns the newest N', () => {
    const log = new Logger()
    for (let i = 0; i < 5; i++) log.info('net-in', `m${i}`)
    expect(log.recent(2).map((e) => e.msg)).toEqual(['m3', 'm4'])
  })

  it('assigns monotonic seq + a timestamp', () => {
    let clock = 1000
    const log = new Logger({ now: () => clock++ })
    log.info('net-in', 'a'); log.info('net-in', 'b')
    const [a, b] = log.recent()
    expect(a!.seq).toBe(1); expect(b!.seq).toBe(2)
    expect(a!.t).toBe(1000); expect(b!.t).toBe(1001)
  })

  it('export() is valid JSON with entries + counts, circular-safe', () => {
    const log = new Logger({ tag: 'web', now: () => 42 })
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic.self = cyclic
    log.info('vm-notify', 'MoveCards', cyclic)
    const parsed = JSON.parse(log.export()) as { tag: string; counts: Record<string, number>; entries: LogEntry[] }
    expect(parsed.tag).toBe('web')
    expect(parsed.counts['vm-notify']).toBe(1)
    expect(parsed.entries).toHaveLength(1)
    // circular ref replaced, BigInt-safe.
    expect(JSON.stringify(parsed.entries[0]!.data)).toContain('[Circular]')
  })

  it('export() coerces BigInt in data to number', () => {
    const log = new Logger()
    log.info('net-in', 'req', { requestId: BigInt(123) })
    const parsed = JSON.parse(log.export()) as { entries: { data: { requestId: number } }[] }
    expect(parsed.entries[0]!.data.requestId).toBe(123)
  })

  it('clear() empties the buffer and counts', () => {
    const log = new Logger()
    log.info('net-in', 'a')
    log.clear()
    expect(log.recent()).toEqual([])
    expect(log.counts['net-in']).toBeUndefined()
  })
})
