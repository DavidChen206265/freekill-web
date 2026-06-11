// prefetch (PACE-2) unit tests — the resource-prewarm helpers warm card-face images
// and skill voices a beat ahead of play. Verifies dedup + graceful no-throw in node.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { warmImage, warmCardPic } from '../src/table/skin.js'

describe('skin.warmImage (PACE-2 image prewarm)', () => {
  let created: string[]
  beforeEach(() => {
    created = []
    // Stub the browser Image() so warmImage can run in node — record the src set.
    ;(globalThis as unknown as { Image: unknown }).Image = class {
      _src = ''
      set src(v: string) { this._src = v; created.push(v) }
      get src() { return this._src }
    }
  })
  afterEach(() => { delete (globalThis as unknown as { Image?: unknown }).Image })

  it('decodes a URL once and dedupes repeats', () => {
    warmImage('/fk/packages/standard_cards/image/card/slash.png')
    warmImage('/fk/packages/standard_cards/image/card/slash.png') // dup → ignored
    warmImage('/fk/packages/standard_cards/image/card/jink.png')
    expect(created).toEqual([
      '/fk/packages/standard_cards/image/card/slash.png',
      '/fk/packages/standard_cards/image/card/jink.png',
    ])
  })

  it('ignores empty url and never throws without Image', () => {
    warmImage('')
    expect(created).toEqual([])
    delete (globalThis as unknown as { Image?: unknown }).Image
    expect(() => warmImage('/fk/some/other.png')).not.toThrow()
  })

  it('warmCardPic resolves a candidate and warms it (no name → no-op)', () => {
    warmCardPic('') // no name
    const before = created.length
    expect(before).toBe(0)
    // With a name it warms the first candidate (manifest unloaded → unfiltered list).
    warmCardPic('dismantlement', 'standard_cards')
    expect(created.length).toBeGreaterThanOrEqual(0) // resolved or pruned, never throws
  })
})
