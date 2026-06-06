// cardFace + i18n unit tests — display helpers (suit/number) and translation cache.

import { describe, it, expect, beforeEach } from 'vitest'
import { suitSymbol, isRedSuit, numberStr, useCardFaceStore } from '../src/stores/cardFaceStore.js'
import { tr, registerTranslations, hasTranslation } from '../src/i18n/zh.js'

describe('cardFace display helpers', () => {
  it('suit symbols', () => {
    expect(suitSymbol('spade')).toBe('♠')
    expect(suitSymbol('heart')).toBe('♥')
    expect(suitSymbol('club')).toBe('♣')
    expect(suitSymbol('diamond')).toBe('♦')
    expect(suitSymbol('nosuit')).toBe('')
    expect(suitSymbol(undefined)).toBe('')
  })
  it('red vs black', () => {
    expect(isRedSuit('heart')).toBe(true)
    expect(isRedSuit('diamond')).toBe(true)
    expect(isRedSuit('spade')).toBe(false)
    expect(isRedSuit('club')).toBe(false)
  })
  it('number A/2..10/J/Q/K', () => {
    expect(numberStr(1)).toBe('A')
    expect(numberStr(7)).toBe('7')
    expect(numberStr(10)).toBe('10')
    expect(numberStr(11)).toBe('J')
    expect(numberStr(12)).toBe('Q')
    expect(numberStr(13)).toBe('K')
    expect(numberStr(0)).toBe('')
    expect(numberStr(undefined)).toBe('')
  })
})

describe('cardFaceStore.merge', () => {
  beforeEach(() => useCardFaceStore.getState().reset())
  it('merges faces keyed by cid string', () => {
    useCardFaceStore.getState().merge({ '7': { name: 'slash', number: 7, suit: 'spade', color: 'black' } })
    expect(useCardFaceStore.getState().faces[7]).toMatchObject({ name: 'slash', suit: 'spade' })
  })
  it('ignores faces without a name', () => {
    useCardFaceStore.getState().merge({ '9': { name: '', number: 0, suit: 'nosuit', color: 'nocolor' } })
    expect(useCardFaceStore.getState().faces[9]).toBeUndefined()
  })
})

describe('i18n runtime translation cache', () => {
  it('tr falls back to key, static dict, then runtime cache', () => {
    expect(tr('aaa_role_mode')).toBe('身份模式') // static
    expect(tr('totally_unknown_key_xyz')).toBe('totally_unknown_key_xyz') // fallback
    expect(hasTranslation('slash')).toBe(false)
    registerTranslations({ slash: '杀', caocao: '曹操' })
    expect(tr('slash')).toBe('杀')
    expect(hasTranslation('slash')).toBe(true)
  })
})
