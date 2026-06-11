// enumerate unit tests — lock the manifest→path expansion, especially the tricky
// anim key disambiguation (package sprite vs builtin nested vs chat-anim).

import { describe, it, expect } from 'vitest'
import { enumerateAssets, animFramePaths, fileListPaths, FIXED_ASSETS } from '../src/enumerate.js'

describe('animFramePaths', () => {
  const packs = ['standard', 'standard_cards', 'maneuvering', 'utility']

  it('builtin flat sprite → image/anim/<key>/<i>.png', () => {
    expect(animFramePaths({ damage: 3 }, packs)).toEqual([
      'image/anim/damage/0.png', 'image/anim/damage/1.png', 'image/anim/damage/2.png',
    ])
  })

  it('package sprite (first seg is a pack) → packages/<pkg>/image/anim/<emotion>', () => {
    expect(animFramePaths({ 'standard_cards/axe': 2 }, packs)).toEqual([
      'packages/standard_cards/image/anim/axe/0.png',
      'packages/standard_cards/image/anim/axe/1.png',
    ])
  })

  it('builtin NESTED sprite (first seg NOT a pack) → image/anim/<key>', () => {
    // skillInvoke is a builtin category, not a package — must NOT become packages/skillInvoke/...
    expect(animFramePaths({ 'skillInvoke/control': 2 }, packs)).toEqual([
      'image/anim/skillInvoke/control/0.png',
      'image/anim/skillInvoke/control/1.png',
    ])
  })

  it('skips chat-anim keys (egg/flower/shoe/wine/fly — named frames, not 0..n-1)', () => {
    expect(animFramePaths({ wine: 22, egg: 4, shoe: 21, flower: 5, fly: 2 }, packs)).toEqual([])
  })

  it('skips non-positive counts', () => {
    expect(animFramePaths({ x: 0, y: -1 }, packs)).toEqual([])
  })
})

describe('fileListPaths', () => {
  it('expands base + extra packs to packages/<base>/<file>', () => {
    expect(fileListPaths({ base: 'freekill-core', files: ['lua/a.lua'], extra: [{ base: 'utility', files: ['init.lua'] }] }))
      .toEqual(['packages/freekill-core/lua/a.lua', 'packages/utility/init.lua'])
  })
})

describe('enumerateAssets', () => {
  it('always includes FIXED_ASSETS (gamebg) — the no-manifest asset that 404d on VPS', () => {
    expect(enumerateAssets({})).toEqual(FIXED_ASSETS)
    expect(FIXED_ASSETS).toContain('image/gamebg.jpg')
  })

  it('merges + dedups all manifests and derives anim packs from fileList.extra', () => {
    const out = enumerateAssets({
      audio: ['audio/system/bgm.mp3'],
      images: ['packages/standard/image/card/slash.png'],
      anim: { damage: 1, 'sp/foo': 1 },           // sp comes from fileList.extra below
      fileList: { base: 'freekill-core', files: ['init.lua'], extra: [{ base: 'sp', files: ['init.lua'] }] },
    })
    expect(out).toContain('audio/system/bgm.mp3')
    expect(out).toContain('packages/standard/image/card/slash.png')
    expect(out).toContain('image/anim/damage/0.png')
    expect(out).toContain('packages/sp/image/anim/foo/0.png') // sp recognized as a pack via fileList.extra
    expect(out).toContain('packages/freekill-core/init.lua')
    expect(out).toContain('image/gamebg.jpg')
  })
})
