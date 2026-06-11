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
})
