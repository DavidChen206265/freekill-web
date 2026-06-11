// detailStore.ts — the right-click player/general detail panel (Photo.qml
// onRightClicked → showDetail → startCheat("PlayerDetail"), Photo.qml:281,521-527).
// Holds EITHER a player id (in-game player detail) OR a general name (IG-6: the
// general-pick box, where there is no player yet — right-click/long-press a candidate
// to view its skills via GetGeneralDetail). Only one is set at a time.

import { create } from 'zustand'

interface DetailState {
  /** Player id whose detail panel is open, or null when closed. */
  pid: number | null
  /** General name whose detail panel is open (IG-6 general-pick), or null. */
  generalName: string | null
  /** Open the in-game player detail (by player id). Clears any general-name detail. */
  open: (pid: number) => void
  /** Open the general detail by name (general-pick skill view). Clears pid. */
  openGeneral: (name: string) => void
  close: () => void
}

export const useDetailStore = create<DetailState>((set) => ({
  pid: null,
  generalName: null,
  open: (pid) => set({ pid, generalName: null }),
  openGeneral: (name) => set({ generalName: name, pid: null }),
  close: () => set({ pid: null, generalName: null }),
}))
