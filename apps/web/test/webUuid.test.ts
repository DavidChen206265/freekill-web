import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeWebUuid } from '../src/utils/webUuid.js'

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto')

function setCrypto(value: Partial<Crypto> | undefined): void {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, 'crypto', originalCryptoDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'crypto')
  }
})

describe('makeWebUuid', () => {
  it('uses native crypto.randomUUID when available', () => {
    setCrypto({ randomUUID: () => '11111111-2222-4333-8444-555555555555' })

    expect(makeWebUuid()).toBe('web-11111111-2222-4333-8444-555555555555')
  })

  it('falls back to crypto.getRandomValues without randomUUID', () => {
    setCrypto({
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set([
          0x00, 0x11, 0x22, 0x33,
          0x44, 0x55,
          0x66, 0x77,
          0x88, 0x99,
          0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
        ])
        return array
      },
    })

    expect(makeWebUuid()).toBe('web-00112233-4455-4677-8899-aabbccddeeff')
  })

  it('falls back to Math.random when Web Crypto is unavailable', () => {
    setCrypto(undefined)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(makeWebUuid()).toBe('web-00000000-0000-4000-8000-000000000000')
  })
})
