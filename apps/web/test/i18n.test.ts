// i18n.test.ts — static-dict translations that must NOT fall through to the raw key.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { tr, registerTranslations, hasTranslation, resetMissingTranslationWarningsForTests } from '../src/i18n/zh.js'

afterEach(() => {
  vi.restoreAllMocks()
  resetMissingTranslationWarningsForTests()
})

describe('i18n static dict', () => {
  it('card-choose box area labels translate (client.lua $Hand/$Equip/$Judge)', () => {
    // Bug: the card-selection box headers showed raw "$Hand"/"$Equip" because these
    // keys were missing from zh.ts → tr() returned the key. They are fixed client-UI
    // strings (lua/client/i18n/zh_CN.lua:373-375).
    expect(tr('$Hand')).toBe('手牌区')
    expect(tr('$Equip')).toBe('装备区')
    expect(tr('$Judge')).toBe('判定区')
  })

  it('unknown key falls back to itself', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(tr('totally_unknown_key_xyz')).toBe('totally_unknown_key_xyz')
    expect(tr('')).toBe('')
  })

  it('reports missing key-like translations to console once', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(tr('gongxin_discard')).toBe('gongxin_discard')
    expect(tr('gongxin_discard')).toBe('gongxin_discard')
    expect(err).toHaveBeenCalledTimes(1)
    expect(err.mock.calls[0]?.[0]).toBe('[i18n] missing translation')
    expect(err.mock.calls[0]?.[1]).toEqual({ key: 'gongxin_discard' })
  })

  it('does not cache VM identity translations as translated', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    registerTranslations({ raw_skill_field: 'raw_skill_field' })
    expect(hasTranslation('raw_skill_field')).toBe(false)
    expect(tr('raw_skill_field')).toBe('raw_skill_field')
    expect(err).toHaveBeenCalledWith('[i18n] missing translation', { key: 'raw_skill_field' })
  })
})
