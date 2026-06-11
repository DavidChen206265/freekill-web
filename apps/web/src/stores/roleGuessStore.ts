// roleGuessStore.ts — IG-3 client-only role-guess annotation, a 1:1 port of
// RoleComboBox.qml's assumptionBox (Components/LunarLTK/Photo/RoleComboBox.qml:7-52).
// When a player's role shows as "unknown", clicking the role icon lets YOU tag a
// guess (rebel/loyalist/renegade). This is PURELY local: never sent to the server,
// not persisted — it mirrors the QML `assumptionBox.value` which is component-local.
// Cleared on new game / leave (vmStore.resetForNewGame).

import { create } from 'zustand'

// The guessable roles (RoleComboBox.qml:9 options). "unknown" clears the guess back
// to the default icon. NB: no "lord" — the lord's role is always public, never unknown.
export const GUESS_ROLES = ['unknown', 'loyalist', 'rebel', 'renegade'] as const
export type GuessRole = (typeof GUESS_ROLES)[number]

interface RoleGuessState {
  /** player id -> guessed role (absent = no guess; shows the plain "unknown" icon). */
  guesses: Record<number, GuessRole>
  /** Which player's picker popup is open (null = none). */
  pickerOpen: number | null
  setGuess: (pid: number, role: GuessRole) => void
  openPicker: (pid: number) => void
  closePicker: () => void
  reset: () => void
}

export const useRoleGuessStore = create<RoleGuessState>((set) => ({
  guesses: {},
  pickerOpen: null,
  // "unknown" removes the annotation (back to the default unknown icon); else store it.
  setGuess: (pid, role) => set((s) => {
    const guesses = { ...s.guesses }
    if (role === 'unknown') delete guesses[pid]
    else guesses[pid] = role
    return { guesses, pickerOpen: null }
  }),
  openPicker: (pid) => set({ pickerOpen: pid }),
  closePicker: () => set({ pickerOpen: null }),
  reset: () => set({ guesses: {}, pickerOpen: null }),
}))
