// convert.test.ts — packet ↔ envelope conversion + Setup builder + PEM extraction.

import { describe, it, expect } from 'vitest'
import { Encoder } from 'cbor-x'
import {
  packetToEnvelope,
  envelopeToPacket,
  buildSetupPacket,
  extractPublicKeyPem,
  decodeInnerData,
  encodeInnerData,
  decodePacket,
  encodePacket,
  type FkPacket,
  TYPE_NOTIFICATION,
  TYPE_REQUEST,
  SRC_SERVER,
  DEST_CLIENT,
  NOTIFY_REQUEST_ID,
} from '../src/index.js'

const enc = new Encoder({ useRecords: false, mapsAsObjects: false })

describe('inner data codec', () => {
  it('round-trips a JS object through inner CBOR', () => {
    const v = { capacity: 8, mode: 'aaa_role_mode', list: [1, 2, 3] }
    expect(decodeInnerData(encodeInnerData(v))).toEqual(v)
  })

  it('decodes empty data to null', () => {
    expect(decodeInnerData(new Uint8Array(0))).toBeNull()
  })
})

describe('packetToEnvelope', () => {
  it('maps a notify packet, decoding inner data', () => {
    const pkt: FkPacket = {
      requestId: NOTIFY_REQUEST_ID,
      type: TYPE_NOTIFICATION | SRC_SERVER | DEST_CLIENT,
      command: 'RefreshRoomList',
      data: Uint8Array.from(enc.encode([{ id: 1, name: 'room' }])),
    }
    const env = packetToEnvelope(pkt)
    expect(env.kind).toBe('notify')
    expect(env.command).toBe('RefreshRoomList')
    expect(env.data).toEqual([{ id: 1, name: 'room' }])
  })

  it('maps a request packet with timeout/timestamp', () => {
    const pkt: FkPacket = {
      requestId: 7,
      type: TYPE_REQUEST | SRC_SERVER | DEST_CLIENT,
      command: 'AskForUseCard',
      data: encodeInnerData({ prompt: 'x' }),
      timeout: 15,
      timestamp: 123,
    }
    const env = packetToEnvelope(pkt)
    expect(env).toMatchObject({ kind: 'request', requestId: 7, command: 'AskForUseCard', timeout: 15, timestamp: 123 })
  })
})

describe('envelopeToPacket', () => {
  it('reply envelope -> packet whose data re-decodes', () => {
    const pkt = envelopeToPacket({ kind: 'reply', requestId: 9, command: '', data: { cards: [1], targets: [2] } })
    // round-trip through the OUTER framing too
    const back = decodePacket(encodePacket(pkt))
    expect(back.requestId).toBe(9)
    expect(decodeInnerData(back.data)).toEqual({ cards: [1], targets: [2] })
  })
})

describe('buildSetupPacket', () => {
  it('produces a 5-byte-string Setup array with correct envelope shape', () => {
    const pkt = buildSetupPacket({
      name: 'tester',
      encryptedPassword: new Uint8Array([1, 2, 3, 4]),
      md5: 'e48d6db7c1ea5c6efddcc06fe3071eeb',
      version: '0.5.20',
      uuid: 'uuid-123',
    })
    expect(pkt.command).toBe('Setup')
    expect(pkt.requestId).toBe(NOTIFY_REQUEST_ID)
    // type must be NOTIFICATION|SRC_CLIENT|DEST_SERVER = 0x412
    expect(pkt.type).toBe(0x412)
    // inner data is a 5-element array of byte strings
    const arr = decodeInnerData(pkt.data) as unknown[]
    expect(arr).toHaveLength(5)
    expect(arr.every((x) => x instanceof Uint8Array)).toBe(true)
    expect(new TextDecoder().decode(arr[0] as Uint8Array)).toBe('tester')
    expect(arr[1]).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
})

describe('extractPublicKeyPem', () => {
  it('unwraps a PEM from a NetworkDelayTest-style packet', () => {
    const pem = '-----BEGIN RSA PUBLIC KEY-----\nMIIB...\n-----END RSA PUBLIC KEY-----\n'
    // asio wraps PEM as a CBOR byte string inside the data field.
    const inner = Uint8Array.from(enc.encode(new TextEncoder().encode(pem)))
    const pkt: FkPacket = {
      requestId: NOTIFY_REQUEST_ID,
      type: TYPE_NOTIFICATION | SRC_SERVER | DEST_CLIENT,
      command: 'NetworkDelayTest',
      data: inner,
    }
    expect(extractPublicKeyPem(pkt)).toBe(pem)
  })
})
