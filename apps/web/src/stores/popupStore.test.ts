import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePopupStore } from './popupStore.js'

afterEach(() => {
  usePopupStore.getState().clear()
  vi.restoreAllMocks()
})

describe('popupStore special UI requests', () => {
  it('preserves detailed choice metadata for DetailedChoiceBox rendering', () => {
    const handled = usePopupStore.getState().handle('AskForChoice', [
      ['opt_a'],
      ['opt_a', 'opt_b'],
      'skill_x',
      '#prompt',
      true,
    ])

    expect(handled).toBe(true)
    expect(usePopupStore.getState().active).toMatchObject({
      kind: 'choice',
      detailed: true,
      options: ['opt_a'],
      values: ['opt_a', 'opt_b'],
    })
  })

  it('dispatches utility ChooseGeneralsAndChoiceBox custom dialog', () => {
    const handled = usePopupStore.getState().handle('CustomDialog', {
      path: 'packages/utility/qml/ChooseGeneralsAndChoiceBox.qml',
      data: [['liubei', 'guanyu'], ['OK'], '#choose', ['Cancel'], 1, 1, ['guanyu']],
    })

    expect(handled).toBe(true)
    expect(usePopupStore.getState().active).toMatchObject({
      kind: 'chooseGeneralsAndChoice',
      gcGenerals: ['liubei', 'guanyu'],
      gcOkOptions: ['OK'],
      gcCancelOptions: ['Cancel'],
      min: 1,
      max: 1,
      gcDisabled: ['guanyu'],
    })
  })

  it('dispatches utility ChooseCardListBox custom dialog', () => {
    const handled = usePopupStore.getState().handle('CustomDialog', {
      path: 'packages/utility/qml/ChooseCardListBox.qml',
      data: [['pile_a'], [[1, 2, 3]], 1, 1, '#choose-pile', false, true],
    })

    expect(handled).toBe(true)
    expect(usePopupStore.getState().active).toMatchObject({
      kind: 'chooseCardList',
      clNames: ['pile_a'],
      clCards: [[1, 2, 3]],
      cancelable: true,
    })
  })

  it('reports unsupported package QML explicitly instead of failing silently', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const handled = usePopupStore.getState().handle('CustomDialog', {
      path: 'packages/mobile/qml/TaMoBox.qml',
      data: [],
    })

    expect(handled).toBe(true)
    expect(usePopupStore.getState().active?.kind).toBe('unsupported')
    expect(err).toHaveBeenCalledWith('[popup] unsupported special UI', expect.objectContaining({ command: 'CustomDialog' }))
  })
})
