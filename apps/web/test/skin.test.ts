// skin path resolution tests — mirrors SkinBank.qml path shapes against /fk.

import { describe, it, expect } from 'vitest'
import {
  generalPic, generalAvatar, cardPic, cardPicCandidates, equipIcon, equipIconCandidates, delayedTrickPic,
  photoBack, rolePic, magatama, shieldPic, deathPic, generalCardBorder, kingdomIcon,
  chosenPic, delayedTrickSealedPic, setArtPacks, generalDualPicCandidates, saveMePic, faceTurnedPic, handcardPic,
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

  it('equipIconCandidates falls back ext → art packages → built-in unknown', () => {
    // A mount's "horse" icon only ships in standard_cards; a card from another
    // extension must still resolve via the scan, then unknown.png — never blank.
    expect(equipIconCandidates('horse', 'maneuvering')).toEqual([
      '/fk/packages/maneuvering/image/card/equipIcon/horse.png',
      '/fk/packages/standard/image/card/equipIcon/horse.png',
      '/fk/packages/standard_cards/image/card/equipIcon/horse.png',
      '/fk/image/card/equipIcon/unknown.png',
    ])
    // Unknown extension → scan only, then unknown.
    expect(equipIconCandidates('horse')).toEqual([
      '/fk/packages/standard/image/card/equipIcon/horse.png',
      '/fk/packages/standard_cards/image/card/equipIcon/horse.png',
      '/fk/packages/maneuvering/image/card/equipIcon/horse.png',
      '/fk/image/card/equipIcon/unknown.png',
    ])
    expect(equipIconCandidates('')).toEqual([])
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
    expect(saveMePic()).toBe('/fk/image/photo/death/saveme.png')
    expect(faceTurnedPic()).toBe('/fk/image/photo/faceturned.png')
    expect(faceTurnedPic(true)).toBe('/fk/image/photo/faceturned-heg.png')
    expect(handcardPic()).toBe('/fk/image/photo/handcard.png')
  })

  it('general-card chrome (border + kingdom icon) under /fk/image/card/general', () => {
    expect(generalCardBorder()).toBe('/fk/image/card/general/border.png')
    expect(kingdomIcon('wei')).toBe('/fk/image/card/general/wei.png')
    expect(kingdomIcon('shu')).toBe('/fk/image/card/general/shu.png')
    expect(kingdomIcon('nonsense')).toBe('') // unknown kingdom → no icon
    expect(kingdomIcon(undefined)).toBe('')
  })

  it('card-state chrome (chosen + judge-slot sealed)', () => {
    expect(chosenPic()).toBe('/fk/image/card/chosen.png')
    expect(delayedTrickSealedPic()).toBe('/fk/image/card/delayedTrick/sealed.png')
  })

  it('magatama clamps state 0..3 + heg variant', () => {
    expect(magatama(3)).toBe('/fk/image/photo/magatama/3.png')
    expect(magatama(0)).toBe('/fk/image/photo/magatama/0.png')
    expect(magatama(9)).toBe('/fk/image/photo/magatama/3.png')
    expect(magatama(-1)).toBe('/fk/image/photo/magatama/0.png')
    expect(magatama(2, true)).toBe('/fk/image/photo/magatama/2-heg.png')
  })

  it('setArtPacks (W0-2) extends the candidate scan to enabled extension packs (P7-032)', () => {
    // Before: extension-pack card art is never scanned (only the 3 builtins).
    expect(cardPicCandidates('dummy')).toEqual([
      '/fk/packages/standard/image/card/dummy.png',
      '/fk/packages/standard_cards/image/card/dummy.png',
      '/fk/packages/maneuvering/image/card/dummy.png',
    ])
    // Manifest arrives with the real enabled set → candidates now include utility/sp.
    setArtPacks(['standard', 'standard_cards', 'maneuvering', 'sp', 'standard_ex', 'utility'])
    expect(cardPicCandidates('dummy')).toEqual([
      '/fk/packages/standard/image/card/dummy.png',
      '/fk/packages/standard_cards/image/card/dummy.png',
      '/fk/packages/maneuvering/image/card/dummy.png',
      '/fk/packages/sp/image/card/dummy.png',
      '/fk/packages/standard_ex/image/card/dummy.png',
      '/fk/packages/utility/image/card/dummy.png',
    ])
    // Empty/invalid is ignored (keeps current set — never wipes to nothing).
    setArtPacks([])
    expect(cardPicCandidates('dummy').length).toBe(6)
    // Restore defaults so other tests are unaffected by this module-level mutation.
    setArtPacks(['standard', 'standard_cards', 'maneuvering'])
  })

  it('generalDualPicCandidates prefers dual/ split art, then falls back to the full portrait', () => {
    // PhotoBase.qml:76-78 — getGeneralExtraPic(name,"dual/") ?? getGeneralPicture(name).
    // Own ext dual/ first, then ART_PKGS dual/, then the normal generalPicCandidates chain.
    expect(generalDualPicCandidates('daqiao', 'standard')).toEqual([
      '/fk/packages/standard/image/generals/dual/daqiao.jpg',
      '/fk/packages/standard_cards/image/generals/dual/daqiao.jpg',
      '/fk/packages/maneuvering/image/generals/dual/daqiao.jpg',
      '/fk/packages/standard/image/generals/daqiao.jpg',
      '/fk/packages/standard_cards/image/generals/daqiao.jpg',
      '/fk/packages/maneuvering/image/generals/daqiao.jpg',
    ])
    // No name → empty (no portrait slot).
    expect(generalDualPicCandidates('')).toEqual([])
  })
})
