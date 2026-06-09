// cardNoteStore.ts — footnotes / virtual names on TABLE cards (M4 slice V). The VM
// emits SetCardFootnote {ids[], log, virtual} (room.lua sendFootnote:494) and
// SetCardVirtName {ids[], name, virtual} (sendCardVirtName:502) to annotate cards in
// the processing / discard / void area (e.g. "X 使用" footnote, or a transformed
// virtual name). RoomLogic.js sets card.footnote / card.virt_name on the table card.
// Keyed by cid; CardLayer renders these on the matching table card.

import { create } from 'zustand'

interface CardNote {
  footnote?: string
  virtName?: string
}

interface CardNoteState {
  notes: Record<number, CardNote>
  setFootnote: (ids: number[], log: string) => void
  setVirtName: (ids: number[], name: string) => void
  reset: () => void
}

export const useCardNoteStore = create<CardNoteState>((set) => ({
  notes: {},
  setFootnote: (ids, log) => set((s) => {
    const notes = { ...s.notes }
    for (const id of ids) notes[id] = { ...notes[id], footnote: log }
    return { notes }
  }),
  setVirtName: (ids, name) => set((s) => {
    const notes = { ...s.notes }
    for (const id of ids) notes[id] = { ...notes[id], virtName: name }
    return { notes }
  }),
  reset: () => set({ notes: {} }),
}))
