// codec.test.ts — protocol codec against real captured packets + framing logic.
//
// Valid assertions only: cbor-x's re-encoding is NOT byte-identical to asio's
// encoder (different map ordering / int sizing), so we do NOT assert
// inner-payload byte equality. We assert:
//   1. real captured inner payloads decode without error,
//   2. our OWN outer framing round-trips (we control both encode + decode),
//   3. the stream decoder splits concatenated and arbitrarily-chunked frames.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { decode as cborDecode, Decoder } from 'cbor-x'
import {
  encodePacket,
  decodePacket,
  PacketStreamDecoder,
  cborItemLength,
  type FkPacket,
  TYPE_NOTIFICATION,
  TYPE_REQUEST,
  SRC_SERVER,
  DEST_CLIENT,
  COMPRESSED,
  NOTIFY_REQUEST_ID,
} from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CAPTURED = path.resolve(__dirname, '..', '..', '..', '..', 'freekill-web-spike', 'captured-packets.json')

const te = new TextEncoder()
const td = new TextDecoder()

function notify(command: string, data: Uint8Array): FkPacket {
  return { requestId: NOTIFY_REQUEST_ID, type: TYPE_NOTIFICATION | SRC_SERVER | DEST_CLIENT, command, data }
}

describe('packet framing round-trip (our own encode/decode)', () => {
  it('round-trips a notify packet', () => {
    const pkt = notify('StartGame', te.encode('hello'))
    const wire = encodePacket(pkt)
    const back = decodePacket(wire)
    expect(back.command).toBe('StartGame')
    expect(back.requestId).toBe(NOTIFY_REQUEST_ID)
    expect(td.decode(back.data)).toBe('hello')
  })

  it('round-trips a request packet with timeout/timestamp', () => {
    const pkt: FkPacket = {
      requestId: 42, type: TYPE_REQUEST | SRC_SERVER | DEST_CLIENT,
      command: 'AskForUseCard', data: te.encode('{}'), timeout: 15, timestamp: 1710000000000,
    }
    const back = decodePacket(encodePacket(pkt))
    expect(back.command).toBe('AskForUseCard')
    expect(back.timeout).toBe(15)
    expect(back.timestamp).toBe(1710000000000)
  })

  it('encodes command + data as CBOR byte strings (major type 2)', () => {
    const wire = encodePacket(notify('X', te.encode('y')))
    const arr = cborDecode(wire) as unknown[]
    // elements [2] (command) and [3] (data) must be byte strings, not text.
    expect(arr[2]).toBeInstanceOf(Uint8Array)
    expect(arr[3]).toBeInstanceOf(Uint8Array)
  })
})

describe('cborItemLength boundary scanner', () => {
  it('measures a complete frame and reports -1 for truncated', () => {
    const wire = encodePacket(notify('Cmd', te.encode('payload')))
    expect(cborItemLength(wire, 0)).toBe(wire.length)
    expect(cborItemLength(wire.subarray(0, wire.length - 2), 0)).toBe(-1)
  })
})

describe('PacketStreamDecoder', () => {
  it('splits two concatenated frames', () => {
    const a = encodePacket(notify('First', te.encode('1')))
    const b = encodePacket(notify('Second', te.encode('22')))
    const dec = new PacketStreamDecoder()
    const out = dec.feed(concat(a, b))
    expect(out.map((p) => p.command)).toEqual(['First', 'Second'])
    expect(dec.pending).toBe(0)
  })

  it('reassembles a frame delivered one byte at a time', () => {
    const wire = encodePacket(notify('Dripfeed', te.encode('chunked')))
    const dec = new PacketStreamDecoder()
    const collected: FkPacket[] = []
    for (let i = 0; i < wire.length; i++) {
      collected.push(...dec.feed(wire.subarray(i, i + 1)))
    }
    expect(collected).toHaveLength(1)
    expect(collected[0]!.command).toBe('Dripfeed')
  })

  it('buffers a partial trailing frame across feeds', () => {
    const a = encodePacket(notify('Whole', te.encode('a')))
    const b = encodePacket(notify('Partial', te.encode('bb')))
    const dec = new PacketStreamDecoder()
    const split = Math.floor(b.length / 2)
    const first = dec.feed(concat(a, b.subarray(0, split)))
    expect(first.map((p) => p.command)).toEqual(['Whole'])
    expect(dec.pending).toBeGreaterThan(0)
    const second = dec.feed(b.subarray(split))
    expect(second.map((p) => p.command)).toEqual(['Partial'])
    expect(dec.pending).toBe(0)
  })
})

const capturedAvailable = fs.existsSync(CAPTURED)

describe('real captured inner payloads', () => {
  it.skipIf(!capturedAvailable)('decode without error (cbor-x reads asio byte strings)', () => {
    const packets: Array<{ command: string; dataHex: string }> = JSON.parse(fs.readFileSync(CAPTURED, 'utf8'))
    // Match the codec's decoder config: asio maps need mapsAsObjects:false.
    const decoder = new Decoder({ useRecords: false, mapsAsObjects: false })
    let decoded = 0
    for (const p of packets) {
      if (!p.dataHex) continue
      const bytes = Uint8Array.from(Buffer.from(p.dataHex, 'hex'))
      // Inner data is itself a CBOR value; it must decode without throwing.
      expect(() => decoder.decode(bytes)).not.toThrow()
      decoded++
    }
    expect(decoded).toBeGreaterThan(1000)
  })
})

describe('COMPRESSED packets (Qt-zlib round-trip)', () => {
  it('round-trips a COMPRESSED notify through encode/decode', () => {
    const big = te.encode('x'.repeat(2000)) // compressible payload
    const pkt: FkPacket = {
      requestId: NOTIFY_REQUEST_ID,
      type: TYPE_NOTIFICATION | SRC_SERVER | DEST_CLIENT | COMPRESSED,
      command: 'BigNotify',
      data: big,
    }
    const wire = encodePacket(pkt)
    const back = decodePacket(wire)
    expect(back.command).toBe('BigNotify')
    // data must come back decompressed and byte-identical.
    expect(Array.from(back.data)).toEqual(Array.from(big))
  })
})

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0); out.set(b, a.length)
  return out
}
