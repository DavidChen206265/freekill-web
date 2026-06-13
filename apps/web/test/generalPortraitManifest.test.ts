import { describe, it, expect, vi, afterEach } from 'vitest'

describe('general portrait manifest pruning', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses images.json as the authority for general portrait candidates', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ['packages/test/image/generals/mouxusheng.jpg'],
    })))

    const skin = await import('../src/table/skin.js')
    await skin.loadImageManifest()
    skin.setArtPacks(['standard_ex', 'test'])

    expect(skin.generalPicCandidates('mouxusheng', 'standard_ex')).toEqual([
      '/fk/packages/test/image/generals/mouxusheng.jpg',
    ])
    expect(skin.generalPicCandidates('blank_shibing', 'maneuvering')).toEqual([])
  })

  it('falls back to probing portraits when images.json is an old card-only manifest', async () => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ['packages/standard_cards/image/card/jink.png'],
    })))

    const skin = await import('../src/table/skin.js')
    await skin.loadImageManifest()
    skin.setArtPacks(['standard', 'sp'])

    expect(skin.generalPicCandidates('caocao', 'standard')).toEqual([
      '/fk/packages/standard/image/generals/caocao.jpg',
      '/fk/packages/sp/image/generals/caocao.jpg',
    ])
  })
})
