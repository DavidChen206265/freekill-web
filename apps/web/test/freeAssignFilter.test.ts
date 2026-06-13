import { describe, expect, it } from 'vitest'
import { filterFreeAssignGenerals } from '../src/table/RequestPopup.js'

describe('free assign ban filtering', () => {
  it('filters disabled generals and disabled packs when the room option is enabled', () => {
    const generals = [
      { name: 'caocao', extension: 'standard', kingdom: 'wei' },
      { name: 'liubei', extension: 'standard', kingdom: 'shu' },
      { name: 're__xusheng', extension: 'sp', kingdom: 'wu' },
    ]

    expect(filterFreeAssignGenerals(generals, '', {
      generals: new Set(['caocao']),
      packs: new Set(['sp']),
    }).map((g) => g.name)).toEqual(['liubei'])
  })

  it('keeps the existing kingdom filter', () => {
    const generals = [
      { name: 'caocao', extension: 'standard', kingdom: 'wei' },
      { name: 'liubei', extension: 'standard', kingdom: 'shu' },
    ]

    expect(filterFreeAssignGenerals(generals, 'shu', {
      generals: new Set(),
      packs: new Set(),
    }).map((g) => g.name)).toEqual(['liubei'])
  })
})
