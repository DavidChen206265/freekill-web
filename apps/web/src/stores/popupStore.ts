// popupStore.ts — "popup" requests that are NOT ui_emu (notify + direct reply):
// AskForGeneral (choose general — every game starts with this), AskForChoice
// (pick one option), AskForSkillInvoke (yes/no). The VM forwards these as raw
// notifyUI; the player picks in React and we reply via the gateway (requestId
// stamped by the gateway). See memory ui-emu-request-architecture (two request
// kinds). Distinct from interactionStore (UpdateRequestUI / ui_emu).

import { create } from 'zustand'

export type PopupKind = 'general' | 'choice' | 'skillInvoke'

export interface PopupRequest {
  kind: PopupKind
  prompt: string
  // general: list of general names, choose `count`
  generals?: string[]
  count?: number
  // choice: display options + the raw values to reply with (parallel arrays)
  options?: string[]
  values?: string[]
  // skillInvoke: the skill name
  skill?: string
}

interface PopupState {
  active: PopupRequest | null
  /** Sends a reply through the gateway; injected by connectionStore. */
  replySender?: (data: unknown) => void
  /** Handle an incoming notifyUI for a popup-style request. Returns true if handled. */
  handle: (command: string, data: unknown) => boolean
  /** Player resolved the popup → reply to server + close. */
  resolve: (value: unknown) => void
  clear: () => void
  setReplySender: (fn: (data: unknown) => void) => void
}

export const usePopupStore = create<PopupState>((set, get) => ({
  active: null,

  handle: (command, data) => {
    const arr = Array.isArray(data) ? data : null
    switch (command) {
      case 'AskForGeneral': {
        // [generals[], n, no_convert, heg, rule, extra_data]
        if (!arr) return false
        set({ active: { kind: 'general', prompt: '请选择武将', generals: arr[0] as string[], count: Number(arr[1]) || 1 } })
        return true
      }
      case 'AskForChoice': {
        // [choices(display)[], all_choices(values)[], skill, prompt, detailed]
        if (!arr) return false
        set({ active: { kind: 'choice', prompt: String(arr[3] || arr[2] || '请选择'), options: arr[0] as string[], values: arr[1] as string[] } })
        return true
      }
      case 'AskForSkillInvoke': {
        // [skill, prompt]
        if (!arr) return false
        set({ active: { kind: 'skillInvoke', prompt: String(arr[1] || ''), skill: String(arr[0] || '') } })
        return true
      }
      default:
        return false
    }
  },

  resolve: (value) => {
    get().replySender?.(value)
    set({ active: null })
  },

  clear: () => set({ active: null }),
  setReplySender: (fn) => set({ replySender: fn }),
}))
