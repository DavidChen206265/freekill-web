// processPrompt tests — 1:1 with RoomLogic.js processPrompt(): translate the key,
// substitute %src/%dest/%arg with player names / translated args.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { processPrompt } from '../src/table/processPrompt.js'
import { registerTranslations, resetMissingTranslationWarningsForTests, tr } from '../src/i18n/zh.js'
import { useGameStore } from '../src/stores/gameStore.js'

beforeEach(() => {
  registerTranslations({
    '#slash_skill': '选择攻击范围内的一名角色，对其造成1点伤害',
    '#AskForUseCard': '请使用 %arg，目标为 %dest',
    '#AskForSkillInvoke': '你想发动〖%1〗吗？',
    '#AskForLuckCard': '你想使用手气卡吗？还可以使用 %arg 次，剩余手气卡∞张',
    slash: '杀',
    luoyi: '洛神',
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

afterEach(() => {
  vi.restoreAllMocks()
  resetMissingTranslationWarningsForTests()
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

  it('luck card prompt: #AskForLuckCard:::N → %arg = remaining count (IG-2)', () => {
    // Server sends "#AskForLuckCard:::N" (empty src/dest, arg = remaining times).
    // split → ["#AskForLuckCard","","","2"]; %arg = tr("2") = "2".
    expect(processPrompt('#AskForLuckCard:::2')).toBe('你想使用手气卡吗？还可以使用 2 次，剩余手气卡∞张')
  })

  it('passes through an unknown key unchanged (tr falls back to the key)', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(processPrompt('#nope_unknown')).toBe('#nope_unknown')
    expect(err).toHaveBeenCalledWith('[i18n] missing translation', { key: '#nope_unknown' })
  })

  it('empty prompt → empty string', () => {
    expect(processPrompt('')).toBe('')
  })
})

// Default request prompt (vmStore defaultPrompt): when the server sends an empty
// prompt, QML shows Lua.tr("#AskFor…").arg(Lua.tr(arg)) — Qt .arg() replaces %1.
// This mirrors that substitution. Verified packet: AskForSkillInvoke data = ["luoyi"]
// (skill name only, no prompt) → falls back to #AskForSkillInvoke with the name.
describe('defaultPrompt substitution (%1 ← translated arg)', () => {
  const defaultPrompt = (key: string, arg: string) => tr(key).replace(/%1/g, tr(arg))

  it('#AskForSkillInvoke with only a skill name (洛神/倾国 triggers)', () => {
    expect(defaultPrompt('#AskForSkillInvoke', 'luoyi')).toBe('你想发动〖洛神〗吗？')
  })
})
