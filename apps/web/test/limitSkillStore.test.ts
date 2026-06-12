// limitSkillStore tests — UpdateLimitSkill store + LimitSkillItem.qml render rules.
import { describe, it, expect, beforeEach } from 'vitest'
import { useLimitSkillStore, limitSkillRender, type LimitSkillEntry } from '../src/stores/limitSkillStore.js'

const E = (p: Partial<LimitSkillEntry>): LimitSkillEntry =>
  ({ skill: 's', label: 'S', skilltype: 'limit', times: 0, ...p })

beforeEach(() => { useLimitSkillStore.getState().reset() })

describe('limitSkillRender (LimitSkillItem.qml rules)', () => {
  it('limit: unused → limit bg, no X; used(>=1) → limit-used + X', () => {
    expect(limitSkillRender(E({ skilltype: 'limit', times: 0 }))).toEqual({ bg: 'limit', showX: false, visible: true })
    expect(limitSkillRender(E({ skilltype: 'limit', times: 1 }))).toEqual({ bg: 'limit-used', showX: true, visible: true })
  })
  it('wake: only visible once awakened (times>0)', () => {
    expect(limitSkillRender(E({ skilltype: 'wake', times: 0 })).visible).toBe(false)
    expect(limitSkillRender(E({ skilltype: 'wake', times: 1 }))).toEqual({ bg: 'wake', showX: false, visible: true })
  })
  it('switch: 阳态(<1)→switch, 阴态(>=1)→switch-yin', () => {
    expect(limitSkillRender(E({ skilltype: 'switch', times: 0 })).bg).toBe('switch')
    expect(limitSkillRender(E({ skilltype: 'switch', times: 1 })).bg).toBe('switch-yin')
  })
  it('quest: 未触发/进行 → limit bg no X; 失败(>1) → limit-used + X', () => {
    expect(limitSkillRender(E({ skilltype: 'quest', times: -1 }))).toEqual({ bg: 'limit', showX: false, visible: true })
    expect(limitSkillRender(E({ skilltype: 'quest', times: 1 }))).toEqual({ bg: 'limit', showX: false, visible: true })
    expect(limitSkillRender(E({ skilltype: 'quest', times: 2 }))).toEqual({ bg: 'limit-used', showX: true, visible: true })
  })
})

describe('limitSkillStore.update (LimitSkillArea.qml update)', () => {
  it('adds/updates an entry keyed by pid×skill', () => {
    useLimitSkillStore.getState().update(1, 'zhiheng', 0, 'switch', '制衡')
    expect(useLimitSkillStore.getState().byPlayer[1]!.zhiheng).toMatchObject({ skilltype: 'switch', times: 0, label: '制衡' })
    useLimitSkillStore.getState().update(1, 'zhiheng', 1, 'switch', '制衡')
    expect(useLimitSkillStore.getState().byPlayer[1]!.zhiheng!.times).toBe(1)
  })
  it('times === -1 removes a limit/wake entry, but a quest -1 stays (未触发)', () => {
    useLimitSkillStore.getState().update(2, 'limitA', 0, 'limit', 'A')
    useLimitSkillStore.getState().update(2, 'limitA', -1, 'limit', 'A')
    expect(useLimitSkillStore.getState().byPlayer[2]!.limitA).toBeUndefined()
    useLimitSkillStore.getState().update(2, 'questB', -1, 'quest', 'B')
    expect(useLimitSkillStore.getState().byPlayer[2]!.questB).toMatchObject({ skilltype: 'quest', times: -1 })
  })
  it('reset clears everything', () => {
    useLimitSkillStore.getState().update(1, 's', 0, 'limit', 'S')
    useLimitSkillStore.getState().reset()
    expect(useLimitSkillStore.getState().byPlayer).toEqual({})
  })
})
