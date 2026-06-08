// interactionStore.ts — the active request UI state, fed by the VM's
// notifyUI("UpdateRequestUI", change). The VM (ui_emu) computes which cards are
// enabled/selected, which targets are selectable, and whether OK/Cancel/End are
// usable. React only renders this and routes clicks back via vmStore.interact()
// → VM UpdateRequestUI → VM recomputes → pushes a new change here. No rules here.
//
// change shape (ui_emu base.lua:144 + request_handler): {
//   _type, _prompt, _new[], _delete[],
//   CardItem[]{id,enabled,selected}, Photo[]{id,enabled,selected,state},
//   Button[]{id:"OK"|"Cancel"|"End",enabled}, SkillButton[]{id,enabled,selected},
//   SpecialSkills[]{id,skills}, Interaction
// }  — only changed items are present (diff). We merge into a full snapshot.

import { create } from 'zustand'

export interface ItemState { enabled: boolean; selected?: boolean; state?: string }

interface InteractionState {
  active: boolean
  prompt: string
  cards: Record<number, ItemState>
  photos: Record<number, ItemState>
  buttons: Record<string, ItemState> // "OK" | "Cancel" | "End"
  skills: Record<string, ItemState>
  specialSkills: string[]
  applyChange: (change: unknown) => void
  /** Set just the prompt (e.g. AskForSkillInvoke pushes its prompt separately). */
  setPrompt: (prompt: string) => void
  clear: () => void
}

type ChangeItem = { id: number | string; enabled?: boolean; selected?: boolean; state?: string }

function mergeItems(into: Record<string | number, ItemState>, arr: unknown): void {
  if (!Array.isArray(arr)) return
  for (const raw of arr as ChangeItem[]) {
    if (raw == null || raw.id === undefined) continue
    const prev = into[raw.id] ?? { enabled: false }
    into[raw.id] = {
      enabled: raw.enabled ?? prev.enabled,
      selected: raw.selected ?? prev.selected,
      state: raw.state ?? prev.state,
    }
  }
}

export const useInteractionStore = create<InteractionState>((set) => ({
  active: false,
  prompt: '',
  cards: {},
  photos: {},
  buttons: {},
  skills: {},
  specialSkills: [],

  applyChange: (change) => {
    const c = change as Record<string, unknown>
    if (!c) return
    set((s) => {
      const cards = { ...s.cards }
      const photos = { ...s.photos }
      const buttons = { ...s.buttons }
      const skills = { ...s.skills }
      // _new items seed initial state (each carries {type, data}).
      if (Array.isArray(c._new)) {
        for (const it of c._new as { type: string; data: ChangeItem }[]) {
          if (!it?.data || it.data.id === undefined) continue
          const target = (it.type === 'CardItem' ? cards : it.type === 'Photo' ? photos : it.type === 'SkillButton' ? skills : it.type === 'Button' ? buttons : null) as Record<string | number, ItemState> | null
          if (target) target[it.data.id] = { enabled: !!it.data.enabled, selected: it.data.selected, state: it.data.state }
        }
      }
      if (Array.isArray(c._delete)) {
        for (const it of c._delete as { type: string; id: number | string }[]) {
          const target = (it.type === 'CardItem' ? cards : it.type === 'Photo' ? photos : it.type === 'SkillButton' ? skills : null) as Record<string | number, ItemState> | null
          if (target) delete target[it.id]
        }
      }
      mergeItems(cards, c.CardItem)
      mergeItems(photos, c.Photo)
      mergeItems(buttons, c.Button)
      mergeItems(skills, c.SkillButton)
      let specialSkills = s.specialSkills
      if (Array.isArray(c.SpecialSkills) && c.SpecialSkills[0]) {
        const sk = (c.SpecialSkills[0] as { skills?: string[] }).skills
        specialSkills = Array.isArray(sk) ? sk : []
      }
      // Prompt: only a NON-EMPTY _prompt updates the bar (RoomLogic.js:1567
      // `if (uiUpdate["_prompt"]) …` — truthy guard). The ui_emu handler emits an
      // empty _prompt for the no-explicit-prompt case (response_card.lua
      // original_prompt = prompt or ""); dropping it lets the request command's
      // default prompt (vmStore defaultPrompt) stand, exactly as in QML.
      const prompt = typeof c._prompt === 'string' && c._prompt ? c._prompt : s.prompt
      return { active: true, prompt, cards, photos, buttons, skills, specialSkills }
    })
  },

  setPrompt: (prompt) => set({ active: true, prompt }),

  clear: () => set({ active: false, prompt: '', cards: {}, photos: {}, buttons: {}, skills: {}, specialSkills: [] }),
}))
