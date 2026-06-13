// bannerStore.ts — roomScene.banner MarkArea state (SetBanner command).
// Mirrors MarkArea.qml setMark/removeMark for the global top-left banner. Player
// mark areas are owned by the VM player mirror; this store is only for table-level
// banner marks sent through ClientBase:handleSetBanner.

import { create } from 'zustand'

export interface BannerMark {
  mark: string
  name: string
  value: string
}

interface BannerState {
  marks: Record<string, BannerMark>
  setMark: (mark: string, data: unknown, translate?: (key: string) => string) => void
  removeMark: (mark: string) => void
  reset: () => void
}

const fallbackTranslate = (key: string) => key

export const useBannerStore = create<BannerState>((set) => ({
  marks: {},
  setMark: (mark, data, translate = fallbackTranslate) => set((s) => {
    const name = translate(mark)
    let value = ''
    if (mark.startsWith('@$') || mark.startsWith('@&')) {
      value = String(Array.isArray(data) ? data.length : 0)
    } else if (Array.isArray(data)) {
      value = data.map((item) => translate(String(item))).join(' ')
    } else if (data !== undefined && data !== null) {
      value = translate(String(data))
    }
    return { marks: { ...s.marks, [mark]: { mark, name, value } } }
  }),
  removeMark: (mark) => set((s) => {
    const next = { ...s.marks }
    delete next[mark]
    return { marks: next }
  }),
  reset: () => set({ marks: {} }),
}))
