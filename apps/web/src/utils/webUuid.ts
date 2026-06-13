function bytesToUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

function makeRandomBytes(): Uint8Array {
  const bytes = new Uint8Array(16)
  const crypto = globalThis.crypto
  const getRandomValues = crypto?.getRandomValues
  if (typeof getRandomValues === 'function') {
    getRandomValues.call(crypto, bytes)
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  return bytes
}

export function makeWebUuid(): string {
  const crypto = globalThis.crypto
  const randomUUID = crypto?.randomUUID
  if (typeof randomUUID === 'function') return `web-${randomUUID.call(crypto)}`
  return `web-${bytesToUuid(makeRandomBytes())}`
}
