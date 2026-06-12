// roleGuessStore.ts — IG-3 client-only role-guess annotation, a 1:1 port of
// RoleComboBox.qml's assumptionBox (Components/LunarLTK/Photo/RoleComboBox.qml:7-52).
// When a player's role shows as "unknown", clicking the role icon lets YOU tag a
// guess (rebel/loyalist/renegade). This is PURELY local: never sent to the server.
// Cleared on new game / leave (vmStore.resetForNewGame / reset).
//
// Persistence (refresh-survival): unlike VM-backed state (roster/cards/marks), which
// the server re-sends on reconnect, this annotation is client-only — a hard refresh
// would lose it. Persist to sessionStorage (same-tab, dropped when the tab closes),
// mirroring miscStore's game-clock anchor, so a refresh mid-game keeps your guesses.
// reset() clears the store; clearPersist() (new game / leave) also wipes storage.

import { create } from 'zustand'

// The guessable roles (RoleComboBox.qml:9 options). "unknown" clears the guess back
// to the default icon. NB: no "lord" — the lord's role is always public, never unknown.
export const GUESS_ROLES = ['unknown', 'loyalist', 'rebel', 'renegade'] as const
export type GuessRole = (typeof GUESS_ROLES)[number]

const GUESS_KEY = 'fk-role-guesses'
function loadGuesses(): Record<number, GuessRole> {
  try {
    const raw = sessionStorage.getItem(GUESS_KEY)
    if (!raw) return {}
    const obj = JSON.parse(raw) as Record<string, GuessRole>
    const out: Record<number, GuessRole> = {}
    for (const [k, v] of Object.entries(obj)) if (GUESS_ROLES.includes(v)) out[Number(k)] = v
    return out
  } catch { return {} }
}
function saveGuesses(g: Record<number, GuessRole>): void {
  try {
    if (Object.keys(g).length === 0) sessionStorage.removeItem(GUESS_KEY)
    else sessionStorage.setItem(GUESS_KEY, JSON.stringify(g))
  } catch { /* ignore */ }
}

interface RoleGuessState {
  /** player id -> guessed role (absent = no guess; shows the plain "unknown" icon). */
  guesses: Record<number, GuessRole>
  /** Which player's picker popup is open (null = none). */
  pickerOpen: number | null
  setGuess: (pid: number, role: GuessRole) => void
  openPicker: (pid: number) => void
  closePicker: () => void
  /** Clear all guesses (in-memory + persisted). Used on new game / leave room. The
   *  refresh-survival comes from loadGuesses() at store init + saveGuesses on setGuess,
   *  NOT from keeping state here — a reconnect (same JS context) never calls reset, so
   *  in-memory guesses already survive it; a hard refresh reloads them from storage. */
  reset: () => void
}

export const useRoleGuessStore = create<RoleGuessState>((set) => ({
  // Restore on store init so a hard refresh mid-game keeps the annotations.
  guesses: loadGuesses(),
  pickerOpen: null,
  // "unknown" removes the annotation (back to the default unknown icon); else store it.
  setGuess: (pid, role) => set((s) => {
    const guesses = { ...s.guesses }
    if (role === 'unknown') delete guesses[pid]
    else guesses[pid] = role
    saveGuesses(guesses)
    return { guesses, pickerOpen: null }
  }),
  openPicker: (pid) => set({ pickerOpen: pid }),
  closePicker: () => set({ pickerOpen: null }),
  reset: () => { saveGuesses({}); set({ guesses: {}, pickerOpen: null }) },
}))
