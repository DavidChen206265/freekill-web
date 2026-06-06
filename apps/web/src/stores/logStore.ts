// logStore.ts — the battle log (GameLog) + transient toasts (ShowToast). The VM's
// notifyUI("GameLog", text) carries already-parsed HTML markup (<font><b>…),
// localized by parseMsg. We keep a capped ring buffer for the side panel.

import { create } from 'zustand'

const LOG_CAP = 200

interface LogState {
  lines: { id: number; html: string }[]
  toast?: { id: number; html: string }
  push: (html: string) => void
  showToast: (html: string) => void
  reset: () => void
}

let seq = 0

export const useLogStore = create<LogState>((set) => ({
  lines: [],
  push: (html) => set((s) => ({ lines: [...s.lines, { id: ++seq, html }].slice(-LOG_CAP) })),
  showToast: (html) => set({ toast: { id: ++seq, html } }),
  reset: () => set({ lines: [], toast: undefined }),
}))
