// i18n.test.ts — static-dict translations that must NOT fall through to the raw key.
import { describe, it, expect } from 'vitest'
import { tr } from '../src/i18n/zh.js'

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
    expect(tr('totally_unknown_key_xyz')).toBe('totally_unknown_key_xyz')
    expect(tr('')).toBe('')
  })
})
