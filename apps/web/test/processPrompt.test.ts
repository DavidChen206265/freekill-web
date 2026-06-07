// processPrompt tests — 1:1 with RoomLogic.js processPrompt(): translate the key,
// substitute %src/%dest/%arg with player names / translated args.

import { describe, it, expect, beforeEach } from 'vitest'
import { processPrompt } from '../src/table/processPrompt.js'
import { registerTranslations } from '../src/i18n/zh.js'
import { useGameStore } from '../src/stores/gameStore.js'

beforeEach(() => {
  registerTranslations({
    '#slash_skill': '选择攻击范围内的一名角色，对其造成1点伤害',
    '#AskForUseCard': '请使用 %arg，目标为 %dest',
    slash: '杀',
    playerstr_self: '(你)',
    caocao: '曹操',
    liubei: '刘备',
  })
  useGameStore.setState({
    selfId: 1,
    players: {
      1: { id: 1, name: 'me', avatar: '', index: 0, marks: {}, general: 'caocao' },
      2: { id: 2, name: 'bot', avatar: '', index: 1, marks: {}, general: 'liubei' },
    } as never,
  })
})

describe('processPrompt', () => {
  it('translates a bare key (no colon)', () => {
    expect(processPrompt('#slash_skill')).toBe('选择攻击范围内的一名角色，对其造成1点伤害')
  })

  it('substitutes %dest with the target player name and %arg with a translated arg', () => {
    // "<key>:<src>:<dest>:<arg1>" → #AskForUseCard:1:2:slash
    expect(processPrompt('#AskForUseCard:1:2:slash')).toBe('请使用 杀，目标为 刘备')
  })

  it('appends (你) for self in %dest', () => {
    expect(processPrompt('#AskForUseCard:2:1:slash')).toBe('请使用 杀，目标为 曹操(你)')
  })

  it('passes through an unknown key unchanged (tr falls back to the key)', () => {
    expect(processPrompt('#nope_unknown')).toBe('#nope_unknown')
  })

  it('empty prompt → empty string', () => {
    expect(processPrompt('')).toBe('')
  })
})
