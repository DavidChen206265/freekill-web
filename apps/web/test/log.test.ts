// log.test.ts — the web unhandled-notifyUI detector (五谷-class guard). Verifies
// that known/mirror/deferred commands don't trip the warning, and a genuinely
// unconsumed command does (counted in the logger).

import { describe, it, expect, beforeEach } from 'vitest'
import { log, noteNotify, unhandledCommands, setLogLevel } from '../src/diag/log.js'

beforeEach(() => { log.clear(); setLogLevel('silent') })

describe('unhandled-notifyUI detector', () => {
  it('does NOT flag a command handled by an explicit branch', () => {
    noteNotify('MoveCards', { merged: [] }, false)
    expect(unhandledCommands()).not.toContain('MoveCards')
    expect(log.counts['unhandled']).toBeUndefined()
  })

  it('does NOT flag a popup command that handle() claimed', () => {
    noteNotify('AskForGeneral', [['caocao'], 1], true)
    expect(unhandledCommands()).not.toContain('AskForGeneral')
  })

  it('does NOT flag a VM-mirror-driven command (PropertyUpdate etc.)', () => {
    noteNotify('PropertyUpdate', [1, 'hp', 3], false)
    noteNotify('ArrangeSeats', [1, 2, 3], false)
    expect(log.counts['unhandled']).toBeUndefined()
  })

  it('flags a deferred (M4-V) visual command at info, not as unhandled', () => {
    noteNotify('LogEvent', { type: 'Damage' }, false)
    expect(unhandledCommands()).not.toContain('LogEvent') // not a 五谷-class gap
    expect(log.counts['unhandled']).toBeUndefined()
  })

  it('FLAGS a genuinely unconsumed unknown command (五谷-class gap), once', () => {
    noteNotify('TotallyNewCommand', { x: 1 }, false)
    noteNotify('TotallyNewCommand', { x: 2 }, false)
    expect(unhandledCommands()).toContain('TotallyNewCommand')
    // warned once (the second is a debug repeat) → exactly one warn-level entry.
    const warns = log.recent().filter((e) => e.cat === 'unhandled' && e.level === 'warn')
    expect(warns).toHaveLength(1)
  })
})
