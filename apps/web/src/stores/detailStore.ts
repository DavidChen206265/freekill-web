// detailStore.ts — the right-click player/general detail panel (Photo.qml
// onRightClicked → showDetail → startCheat("PlayerDetail"), Photo.qml:281,521-527).
// Holds the player id whose detail is open (null = closed). The modal reads the
// player from gameStore and the skills from the VM (GetPlayerSkills).

import { create } from 'zustand'

interface DetailState {
  /** Player id whose detail panel is open, or null when closed. */
  pid: number | null
  open: (pid: number) => void
  close: () => void
}

export const useDetailStore = create<DetailState>((set) => ({
  pid: null,
  open: (pid) => set({ pid }),
  close: () => set({ pid: null }),
}))
