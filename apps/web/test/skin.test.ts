// skin path resolution tests — mirrors SkinBank.qml path shapes against /fk.

import { describe, it, expect } from 'vitest'
import {
  generalPic, generalAvatar, cardPic, cardPicCandidates, equipIcon, delayedTrickPic,
  photoBack, rolePic, magatama, shieldPic, deathPic, generalCardBorder, kingdomIcon,
} from '../src/table/skin.js'

describe('skin path resolution', () => {
  it('per-package art uses the extension (package) name', () => {
    expect(generalPic('caocao', 'standard')).toBe('/fk/packages/standard/image/generals/caocao.jpg')
    expect(generalAvatar('caocao', 'standard')).toBe('/fk/packages/standard/image/generals/avatar/caocao.jpg')
    expect(cardPic('slash', 'standard_cards')).toBe('/fk/packages/standard_cards/image/card/slash.png')
    expect(equipIcon('axe', 'standard_cards')).toBe('/fk/packages/standard_cards/image/card/equipIcon/axe.png')
    expect(delayedTrickPic('indulgence', 'standard_cards')).toBe('/fk/packages/standard_cards/image/card/delayedTrick/indulgence.png')
  })

  it('returns empty when extension unknown (caller falls back to placeholder)', () => {
    expect(generalPic('caocao')).toBe('')
    expect(cardPic('slash')).toBe('')
  })

  it('cardPicCandidates tries the extension first, then scans art packages', () => {
    // Known extension leads, then the bundled art packages (dedup'd).
    expect(cardPicCandidates('jink', 'standard_cards')).toEqual([
      '/fk/packages/standard_cards/image/card/jink.png',
      '/fk/packages/standard/image/card/jink.png',
      '/fk/packages/maneuvering/image/card/jink.png',
    ])
    // Unknown extension → just the package scan (so art still resolves on error).
    expect(cardPicCandidates('jink')).toEqual([
      '/fk/packages/standard/image/card/jink.png',
      '/fk/packages/standard_cards/image/card/jink.png',
      '/fk/packages/maneuvering/image/card/jink.png',
    ])
    expect(cardPicCandidates('')).toEqual([])
  })

  it('built-in chrome lives under /fk/image/photo', () => {
    expect(photoBack('wei')).toBe('/fk/image/photo/back/wei.png')
    expect(photoBack('nonsense')).toBe('/fk/image/photo/back/unknown.png')
    expect(rolePic('lord')).toBe('/fk/image/photo/role/lord.png')
    expect(rolePic(undefined)).toBe('/fk/image/photo/role/unknown.png')
    expect(rolePic('hidden')).toBe('/fk/image/photo/role/unknown.png') // hidden not a file
    expect(shieldPic()).toBe('/fk/image/photo/magatama/shield.png')
    expect(deathPic('rebel')).toBe('/fk/image/photo/death/rebel.png')
    expect(deathPic('weird')).toBe('/fk/image/photo/death/hidden.png')
  })

  it('general-card chrome (border + kingdom icon) under /fk/image/card/general', () => {
    expect(generalCardBorder()).toBe('/fk/image/card/general/border.png')
    expect(kingdomIcon('wei')).toBe('/fk/image/card/general/wei.png')
    expect(kingdomIcon('shu')).toBe('/fk/image/card/general/shu.png')
    expect(kingdomIcon('nonsense')).toBe('') // unknown kingdom → no icon
    expect(kingdomIcon(undefined)).toBe('')
  })

  it('magatama clamps state 0..3 + heg variant', () => {
    expect(magatama(3)).toBe('/fk/image/photo/magatama/3.png')
    expect(magatama(0)).toBe('/fk/image/photo/magatama/0.png')
    expect(magatama(9)).toBe('/fk/image/photo/magatama/3.png')
    expect(magatama(-1)).toBe('/fk/image/photo/magatama/0.png')
    expect(magatama(2, true)).toBe('/fk/image/photo/magatama/2-heg.png')
  })
})
