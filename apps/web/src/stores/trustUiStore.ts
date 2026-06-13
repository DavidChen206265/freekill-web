import { create } from 'zustand'

export type TrustPending = 'enter' | 'exit' | null

interface TrustUiState {
  pending: TrustPending
  setPending: (pending: TrustPending) => void
}

export const useTrustUiStore = create<TrustUiState>((set) => ({
  pending: null,
  setPending: (pending) => set({ pending }),
}))
