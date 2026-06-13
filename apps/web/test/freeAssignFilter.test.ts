import { describe, expect, it } from 'vitest'
import { filterFreeAssignGenerals } from '../src/table/RequestPopup.js'

describe('free assign ban filtering', () => {
  it('filters disabled generals and disabled packs when the room option is enabled', () => {
    const generals = [
      { name: 'caocao', package: 'standard', extension: 'standard', kingdom: 'wei' },
      { name: 'liubei', package: 'standard', extension: 'standard', kingdom: 'shu' },
      { name: 're__xusheng', package: 'sp', extension: 'sp', kingdom: 'wu' },
    ]

    expect(filterFreeAssignGenerals(generals, '', {
      generals: new Set(['caocao']),
      packs: new Set(['sp']),
    }).map((g) => g.name)).toEqual(['liubei'])
  })

  it('keeps the existing kingdom filter', () => {
    const generals = [
      { name: 'caocao', package: 'standard', extension: 'standard', kingdom: 'wei' },
      { name: 'liubei', package: 'standard', extension: 'standard', kingdom: 'shu' },
    ]

    expect(filterFreeAssignGenerals(generals, 'shu', {
      generals: new Set(),
      packs: new Set(),
    }).map((g) => g.name)).toEqual(['liubei'])
  })

  it('filters by GeneralPack package name instead of top-level extension name', () => {
    const generals = [
      { name: 'test_general', package: 'test_p_0', extension: 'test', kingdom: 'wei' },
      { name: 'xiahouyuan', package: 'wind', extension: 'shzl', kingdom: 'wei' },
      { name: 'liubei', package: 'standard', extension: 'standard', kingdom: 'shu' },
    ]

    expect(filterFreeAssignGenerals(generals, '', {
      generals: new Set(),
      packs: new Set(['test_p_0', 'wind']),
    }).map((g) => g.name)).toEqual(['liubei'])
  })

  it('hides external generals not advertised by the server manifest', () => {
    const generals = [
      { name: 'xiahouyuan', package: 'wind', extension: 'shzl', kingdom: 'wei' },
      { name: 'test_general', package: 'test_p_0', extension: 'test', kingdom: 'wei' },
      { name: 'liubei', package: 'standard', extension: 'standard', kingdom: 'shu' },
    ]

    expect(filterFreeAssignGenerals(generals, '', {
      generals: new Set(),
      packs: new Set(),
      enabledPacks: new Set(['standard']),
    }).map((g) => g.name)).toEqual(['test_general', 'liubei'])
  })
})
