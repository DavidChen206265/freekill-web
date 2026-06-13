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
})
