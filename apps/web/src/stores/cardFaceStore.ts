// cardFaceStore.ts — cache of card faces (cid -> {name,number,suit,color}) read
// from the VM via GetCardData. Faces are essentially static per cid, so we fetch
// missing ones once and cache. Display helpers (suit symbol, number A/J/Q/K) live
// here too. The VM is the source of truth (we never invent card data).

import { create } from 'zustand'
import type { CardFace, GeneralInfo } from '../vm/clientVm.js'

interface CardFaceState {
  faces: Record<number, CardFace>
  /** general name -> {extension,kingdom} (for portrait path resolution). */
  generals: Record<string, GeneralInfo>
  /** Merge freshly-read faces into the cache. */
  merge: (faces: Record<string, CardFace>) => void
  /** Merge general info into the cache. */
  mergeGenerals: (gens: Record<string, GeneralInfo>) => void
  reset: () => void
}

export const useCardFaceStore = create<CardFaceState>((set) => ({
  faces: {},
  generals: {},
  merge: (incoming) => set((s) => {
    const faces = { ...s.faces }
    for (const [cid, face] of Object.entries(incoming)) {
      if (face && face.name) faces[Number(cid)] = face
    }
    return { faces }
  }),
  mergeGenerals: (gens) => set((s) => {
    const generals = { ...s.generals }
    for (const [name, info] of Object.entries(gens)) {
      if (info && info.extension) generals[name] = info
    }
    return { generals }
  }),
  reset: () => set({ faces: {}, generals: {} }),
}))

// Suit string -> symbol (matches QML ♠♥♣♦); red/black for color.
const SUIT_SYMBOL: Record<string, string> = {
  spade: '♠', heart: '♥', club: '♣', diamond: '♦', nosuit: '',
}
export function suitSymbol(suit?: string): string {
  return suit ? (SUIT_SYMBOL[suit] ?? '') : ''
}
export function isRedSuit(suit?: string): boolean {
  return suit === 'heart' || suit === 'diamond'
}

// Card number 1..13 -> A/2..10/J/Q/K (0 or missing -> '').
export function numberStr(n?: number): string {
  if (!n || n < 1) return ''
  if (n === 1) return 'A'
  if (n === 11) return 'J'
  if (n === 12) return 'Q'
  if (n === 13) return 'K'
  return String(n)
}
