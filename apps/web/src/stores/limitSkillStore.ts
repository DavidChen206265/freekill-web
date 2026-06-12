// limitSkillStore.ts — Photo LimitSkillArea state (UpdateLimitSkill command).
// Ports LimitSkillArea.qml update(skill,times) + LimitSkillItem.qml render rules.
//
// The VM emits notifyUI("UpdateLimitSkill", { pid, skill_name, times }) (client.lua
// updateLimitSkill). `times` encodes state per skilltype:
//   switch/rhyme : 0 = 阳态, 1 = 阴态
//   limit/wake   : usedSkillTimes (0 = unused, >=1 = used)
//   quest        : -1 = 未触发, 1 = 进行中, 2 = 失败
//   times === -1 also means "remove" for limit/wake (lost the skill); LimitSkillArea
//   .update removes the entry when times == -1.
// We resolve the skilltype (limit/wake/switch/quest) + localized name ONCE at update
// time via vm.skillData, so the Photo render stays a pure lookup.

import { create } from 'zustand'

export interface LimitSkillEntry {
  skill: string          // internal skill name
  label: string          // localized display name
  skilltype: string      // 'limit' | 'wake' | 'switch' | 'quest'
  times: number          // raw times value (see header)
}

interface LimitSkillState {
  /** pid -> (skill name -> entry). Rendered as a column on each Photo's top-right. */
  byPlayer: Record<number, Record<string, LimitSkillEntry>>
  /** Apply UpdateLimitSkill. skilltype/label resolved by the caller (needs the VM). */
  update: (pid: number, skill: string, times: number, skilltype: string, label: string) => void
  reset: () => void
}

export const useLimitSkillStore = create<LimitSkillState>((set) => ({
  byPlayer: {},
  update: (pid, skill, times, skilltype, label) => set((s) => {
    const cur = { ...(s.byPlayer[pid] ?? {}) }
    // LimitSkillArea.update: times === -1 removes the entry (for limit/wake = skill
    // lost / not present). For quest, -1 is a valid "未触发" state that should SHOW,
    // so only treat -1 as removal when the type isn't quest.
    if (times === -1 && skilltype !== 'quest') {
      delete cur[skill]
    } else {
      cur[skill] = { skill, label, skilltype, times }
    }
    return { byPlayer: { ...s.byPlayer, [pid]: cur } }
  }),
  reset: () => set({ byPlayer: {} }),
}))

// LimitSkillItem.qml render rules → { bg image key, showX, visible }. Pure so it's
// unit-testable. bg key maps to skin.limitSkillBg(key).
export function limitSkillRender(e: LimitSkillEntry): { bg: string; showX: boolean; visible: boolean } {
  const { skilltype, times } = e
  switch (skilltype) {
    case 'wake':
      // wake: only visible once awakened (usedtimes > 0).
      return { bg: 'wake', showX: false, visible: times > 0 }
    case 'limit':
      // limit: used (>=1) → "X" + limit-used bg; else plain limit bg.
      return times >= 1 ? { bg: 'limit-used', showX: true, visible: true } : { bg: 'limit', showX: false, visible: true }
    case 'switch':
      // switch (转换技): 阳态(<1) → switch; 阴态(>=1) → switch-yin.
      return { bg: times < 1 ? 'switch' : 'switch-yin', showX: false, visible: true }
    case 'quest':
      // quest: >1 (failed) → "X" + limit-used; else the limit bg, always shown.
      return times > 1 ? { bg: 'limit-used', showX: true, visible: true } : { bg: 'limit', showX: false, visible: true }
    default:
      return { bg: 'limit', showX: false, visible: false }
  }
}
