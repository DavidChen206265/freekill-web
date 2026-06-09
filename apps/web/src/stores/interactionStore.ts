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

// A dynamic SkillInteraction subpanel (Room.qml:781-836). Arrives as a _new item
// of type "Interaction" carrying { spec:{type,...}, skill_name }; removed via a
// _delete item of type "Interaction". The player's pick is reported back through
// the same ui_emu loop: updateRequestUI("Interaction","1","update",value).
//   combo    : pick one of all_choices (value = chosen string)
//   spin     : integer in [from,to]   (value = number)
//   checkbox : pick min_num..max_num  (value = string[])
//   cardname : pick a card name       (value = string)
export interface InteractionSpec {
  type: string
  skill: string
  // combo / checkbox
  choices?: string[]
  all_choices?: string[]
  default?: string
  detailed?: boolean
  min_num?: number
  max_num?: number
  cancelable?: boolean
  // spin
  from?: number
  to?: number
}

interface InteractionState {
  active: boolean
  prompt: string
  cards: Record<number, ItemState>
  photos: Record<number, ItemState>
  buttons: Record<string, ItemState> // "OK" | "Cancel" | "End"
  skills: Record<string, ItemState>
  specialSkills: string[]
  interaction: InteractionSpec | null
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
  interaction: null,

  applyChange: (change) => {
    const c = change as Record<string, unknown>
    if (!c) return
    set((s) => {
      const cards = { ...s.cards }
      const photos = { ...s.photos }
      const buttons = { ...s.buttons }
      const skills = { ...s.skills }
      let interaction = s.interaction
      // _new items seed initial state (each carries {type, data}).
      if (Array.isArray(c._new)) {
        for (const it of c._new as { type: string; data: ChangeItem & { spec?: InteractionSpec; skill_name?: string } }[]) {
          // Interaction subpanel (Room.qml:781): data = { spec, skill_name }.
          if (it?.type === 'Interaction' && it.data?.spec) {
            interaction = { ...it.data.spec, skill: it.data.skill_name ?? it.data.spec.skill ?? '' }
            continue
          }
          if (!it?.data || it.data.id === undefined) continue
          const target = (it.type === 'CardItem' ? cards : it.type === 'Photo' ? photos : it.type === 'SkillButton' ? skills : it.type === 'Button' ? buttons : null) as Record<string | number, ItemState> | null
          if (target) target[it.data.id] = { enabled: !!it.data.enabled, selected: it.data.selected, state: it.data.state }
        }
      }
      if (Array.isArray(c._delete)) {
        for (const it of c._delete as { type: string; id: number | string }[]) {
          // Interaction subpanel removed (Room.qml:774).
          if (it?.type === 'Interaction') { interaction = null; continue }
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
      const prompt = typeof c._prompt === 'string' && c._prompt ? c._prompt : s.prompt
      return { active: true, prompt, cards, photos, buttons, skills, specialSkills, interaction }
    })
  },

  setPrompt: (prompt) => set({ active: true, prompt }),

  clear: () => set({ active: false, prompt: '', cards: {}, photos: {}, buttons: {}, skills: {}, specialSkills: [], interaction: null }),
}))
