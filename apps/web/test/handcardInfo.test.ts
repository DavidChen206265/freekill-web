import { describe, expect, it } from 'vitest'
import { handcardFontSize, handcardText, previewLines } from '../src/table/handcardInfo.js'

describe('N1-4 handcard info helpers', () => {
  it('renders FreeKill handcard count text with max-card and infinity rules', () => {
    expect(handcardText({ handcardNum: 2, maxCard: 4, hp: 4 })).toBe('2')
    expect(handcardFontSize({ handcardNum: 2, maxCard: 4, hp: 4 })).toBe(24)
    expect(handcardText({ handcardNum: 5, maxCard: 3, hp: 4 })).toBe('5/3')
    expect(handcardFontSize({ handcardNum: 5, maxCard: 3, hp: 4 })).toBe(20)
    expect(handcardText({ handcardNum: 999, maxCard: 900, hp: 4 })).toBe('999/∞')
    expect(handcardText({ handcardNum: 1, maxCard: 2, hp: -1 })).toBe('1')
  })

  it('mirrors HandcardViewer visible-name, unknown, and ellipsis rules', () => {
    const tr = (key: string) => ({ slash: '杀', jink: '闪', peach: '桃', analeptic: '酒', duel: '决斗' }[key] ?? key)
    expect(previewLines([
      { visible: true, name: 'slash' },
      { visible: false, name: '' },
      { visible: true, name: 'duel' },
    ], tr)).toEqual(['杀', '决斗', '?'])
    expect(previewLines([
      { visible: true, name: 'slash' },
      { visible: true, name: 'jink' },
      { visible: true, name: 'peach' },
      { visible: true, name: 'analeptic' },
      { visible: true, name: 'duel' },
    ], tr)).toEqual(['杀', '闪', '桃', '酒', '...'])
  })
})
