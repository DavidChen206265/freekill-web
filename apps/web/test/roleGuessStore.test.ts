// roleGuessStore tests (IG-3) — local role-guess annotation: set/clear, picker
// open/close, and full reset (new game). Mirrors RoleComboBox.qml assumptionBox.

import { describe, it, expect, beforeEach } from 'vitest'
import { useRoleGuessStore } from '../src/stores/roleGuessStore.js'

beforeEach(() => { useRoleGuessStore.getState().reset() })

describe('roleGuessStore', () => {
  it('setGuess stores a role and closes the picker', () => {
    useRoleGuessStore.getState().openPicker(2)
    useRoleGuessStore.getState().setGuess(2, 'rebel')
    expect(useRoleGuessStore.getState().guesses[2]).toBe('rebel')
    expect(useRoleGuessStore.getState().pickerOpen).toBeNull()
  })

  it('guessing "unknown" clears the annotation (back to default icon)', () => {
    useRoleGuessStore.getState().setGuess(3, 'loyalist')
    expect(useRoleGuessStore.getState().guesses[3]).toBe('loyalist')
    useRoleGuessStore.getState().setGuess(3, 'unknown')
    expect(useRoleGuessStore.getState().guesses[3]).toBeUndefined()
  })

  it('openPicker/closePicker toggles only the popup, not guesses', () => {
    useRoleGuessStore.getState().setGuess(1, 'renegade')
    useRoleGuessStore.getState().openPicker(1)
    expect(useRoleGuessStore.getState().pickerOpen).toBe(1)
    useRoleGuessStore.getState().closePicker()
    expect(useRoleGuessStore.getState().pickerOpen).toBeNull()
    expect(useRoleGuessStore.getState().guesses[1]).toBe('renegade') // unaffected
  })

  it('reset clears all guesses + picker (new game)', () => {
    useRoleGuessStore.getState().setGuess(1, 'rebel')
    useRoleGuessStore.getState().setGuess(2, 'loyalist')
    useRoleGuessStore.getState().openPicker(2)
    useRoleGuessStore.getState().reset()
    expect(useRoleGuessStore.getState().guesses).toEqual({})
    expect(useRoleGuessStore.getState().pickerOpen).toBeNull()
  })

  it('persists guesses to sessionStorage so a refresh keeps them; reset wipes storage', () => {
    // Refresh-survival fix: setGuess writes sessionStorage; a fresh page (new store init)
    // reloads via loadGuesses(). The node test env has no sessionStorage, so install a
    // minimal stub to observe the side-effect (the store wraps access in try/catch, so
    // it no-ops safely in node without one — this test asserts the persistence path).
    const store: Record<string, string> = {}
    ;(globalThis as { sessionStorage?: unknown }).sessionStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => { store[k] = v },
      removeItem: (k: string) => { delete store[k] },
    }
    try {
      useRoleGuessStore.getState().setGuess(2, 'rebel')
      expect(JSON.parse(store['fk-role-guesses']!)).toEqual({ 2: 'rebel' })
      // "unknown" removes the entry from storage too
      useRoleGuessStore.getState().setGuess(2, 'unknown')
      expect(store['fk-role-guesses']).toBeUndefined()
      // reset (new game / leave) clears storage
      useRoleGuessStore.getState().setGuess(3, 'renegade')
      useRoleGuessStore.getState().reset()
      expect(store['fk-role-guesses']).toBeUndefined()
    } finally {
      delete (globalThis as { sessionStorage?: unknown }).sessionStorage
    }
  })
})
