import { describe, expect, it } from 'vitest'
import { canConfirmSurrender, canKickPlayer, isSelfTrusting, isTrustState, playerStateLabel, surrenderPayload } from '../src/table/roomActions.js'

describe('N1-3 room action helpers', () => {
  it('uses the original PushRequest surrender payload', () => {
    expect(surrenderPayload()).toBe('surrender,true')
  })

  it('only confirms surrender when the mode returns at least one passing check and all pass', () => {
    expect(canConfirmSurrender([])).toBe(false)
    expect(canConfirmSurrender([{ text: 'A', passed: true }])).toBe(true)
    expect(canConfirmSurrender([{ text: 'A', passed: true }, { text: 'B', passed: false }])).toBe(false)
  })

  it('allows KickPlayer only for room owner against another seated player', () => {
    expect(canKickPlayer(1, { id: 2 }, true)).toBe(true)
    expect(canKickPlayer(1, { id: 1 }, true)).toBe(false)
    expect(canKickPlayer(1, { id: 2 }, false)).toBe(false)
    expect(canKickPlayer(1, undefined, true)).toBe(false)
  })

  it('labels trust state surfaced through NetStateChanged/readPlayers', () => {
    expect(playerStateLabel(2)).toBe('托管')
    expect(playerStateLabel(1)).toBe('在线')
    expect(playerStateLabel(undefined)).toBe('')
    expect(isTrustState(2)).toBe(true)
    expect(isTrustState(1)).toBe(false)
  })

  it('merges server trust state with optimistic enter/exit and game-over clearing', () => {
    expect(isSelfTrusting(1, 'enter')).toBe(true)
    expect(isSelfTrusting(2, null)).toBe(true)
    expect(isSelfTrusting(2, 'exit')).toBe(false)
    expect(isSelfTrusting(2, null, true)).toBe(false)
  })
})
