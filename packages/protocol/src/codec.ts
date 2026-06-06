// codec.ts — CBOR packet codec for the asio wire (see implementation plan §3.1).
//
// Wire = bare CBOR arrays concatenated with no length prefix / no separator.
// Each packet array is [requestId, type, command, data, ...]. `command` and
// `data` MUST be encoded as CBOR byte strings (major type 2, 0x40) — cbor-x emits
// text strings by default, which the asio server rejects. We pass Uint8Array
// values so cbor-x emits byte strings, and decode them back to JS by major type.
//
// Because the wire has no length framing AND cbor-x exposes no consumed-byte
// offset (nor is its re-encoding byte-identical to the server's), the streaming
// decoder uses a minimal CBOR item-length scanner (cborItemLength) to find packet
// boundaries, then hands each complete frame to cbor-x for value decoding.

import { Encoder, Decoder } from 'cbor-x'
import {
  type FkPacket,
  TYPE_REQUEST,
  COMPRESSED,
} from './types.js'
import { qUncompress, qCompress } from './qzlib.js'

// Pass Uint8Array values so cbor-x emits byte strings (major type 2).
const encoder = new Encoder({ useRecords: false, mapsAsObjects: false })
// Decoder MUST use mapsAsObjects:false — asio payloads contain CBOR maps whose
// keys are not always strings (and byte strings can't be JS object keys), so the
// default object-coercing decoder throws "Invalid property name type object".
const decoder = new Decoder({ useRecords: false, mapsAsObjects: false })
const cborDecode = (bytes: Uint8Array): unknown => decoder.decode(bytes)

const td = new TextDecoder()
const te = new TextEncoder()

function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (typeof v === 'string') return te.encode(v)
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength)
  throw new TypeError('expected byte string for command/data field')
}

/** Decode one already-decoded CBOR packet array into an FkPacket. */
export function decodePacketArray(arr: unknown[]): FkPacket {
  const requestId = arr[0] as number
  const type = arr[1] as number
  const command = td.decode(toBytes(arr[2]))
  let data = toBytes(arr[3])
  if (type & COMPRESSED) data = qUncompress(data)

  const pkt: FkPacket = { requestId, type, command, data }
  if (type & TYPE_REQUEST) {
    pkt.timeout = arr[4] as number
    pkt.timestamp = arr[5] as number
  }
  return pkt
}

/** Decode a single complete packet frame (one CBOR array) into an FkPacket. */
export function decodePacket(frame: Uint8Array): FkPacket {
  return decodePacketArray(cborDecode(frame) as unknown[])
}

/** Encode an FkPacket to a CBOR array (command/data as byte strings). */
export function encodePacket(pkt: FkPacket): Uint8Array {
  const cmdBytes = te.encode(pkt.command)
  const type = pkt.type
  let dataBytes = pkt.data
  if (type & COMPRESSED) dataBytes = qCompress(pkt.data)

  const arr =
    type & TYPE_REQUEST
      ? [pkt.requestId, type, cmdBytes, dataBytes, pkt.timeout ?? 0, pkt.timestamp ?? 0]
      : [pkt.requestId, type, cmdBytes, dataBytes] // reply or notify — 4 elements
  return Uint8Array.from(encoder.encode(arr))
}

/**
 * Incremental stream decoder for the asio TCP wire. Feed arbitrary byte chunks;
 * returns the packets that completed within the accumulated buffer and retains
 * any trailing partial bytes for the next feed. Required because the wire has no
 * length framing — packets are self-describing CBOR arrays back to back.
 */
export class PacketStreamDecoder {
  private leftover = new Uint8Array(0)

  feed(chunk: Uint8Array): FkPacket[] {
    let buf = this.leftover.length ? concat(this.leftover, chunk) : chunk
    const out: FkPacket[] = []
    let consumed = 0

    while (consumed < buf.length) {
      const len = cborItemLength(buf, consumed)
      if (len < 0) break // incomplete trailing packet — buffer it
      const frame = buf.subarray(consumed, consumed + len)
      out.push(decodePacket(frame))
      consumed += len
    }

    this.leftover = consumed < buf.length ? buf.slice(consumed) : EMPTY
    return out
  }

  /** Bytes currently buffered awaiting completion (diagnostics/tests). */
  get pending(): number {
    return this.leftover.length
  }
}

const EMPTY = new Uint8Array(0)

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

/**
 * Return the byte length of the single CBOR item starting at `offset` in `buf`,
 * or -1 if the buffer does not yet contain the whole item. This is a structural
 * length walk (not a value decode): it reads major type + argument and recurses
 * into the contents of strings/arrays/maps/tags so we can split a frame off a
 * no-framing stream. Indefinite-length items (ai 31) are walked to their break.
 */
export function cborItemLength(buf: Uint8Array, offset: number): number {
  const end = scanItem(buf, offset)
  return end < 0 ? -1 : end - offset
}

// Returns the absolute end offset of the item at `pos`, or -1 if truncated.
function scanItem(buf: Uint8Array, pos: number): number {
  if (pos >= buf.length) return -1
  const ib = buf[pos]!
  const major = ib >> 5
  const ai = ib & 0x1f
  let p = pos + 1

  // Resolve the argument and advance past its extra bytes.
  let arg = 0
  if (ai < 24) {
    arg = ai
  } else if (ai === 24) {
    if (p + 1 > buf.length) return -1
    arg = buf[p]!; p += 1
  } else if (ai === 25) {
    if (p + 2 > buf.length) return -1
    arg = (buf[p]! << 8) | buf[p + 1]!; p += 2
  } else if (ai === 26) {
    if (p + 4 > buf.length) return -1
    arg = buf[p]! * 0x1000000 + (buf[p + 1]! << 16) + (buf[p + 2]! << 8) + buf[p + 3]!; p += 4
  } else if (ai === 27) {
    if (p + 8 > buf.length) return -1
    // 64-bit length: lengths this large can't fit a packet frame in practice, but
    // walk the 8 bytes and use Number for the low 53 bits (sufficient here).
    let v = 0
    for (let i = 0; i < 8; i++) v = v * 256 + buf[p + i]!
    arg = v; p += 8
  } else if (ai === 31) {
    // Indefinite length — only valid for byte/text strings, arrays, maps.
    return scanIndefinite(buf, p, major)
  } else {
    return -1 // reserved ai (28,29,30) — malformed
  }

  switch (major) {
    case 0: // unsigned int
    case 1: // negative int
    case 7: // simple / float — argument already consumed (no content)
      return p
    case 2: // byte string — `arg` bytes of content
    case 3: // text string
      return p + arg <= buf.length ? p + arg : -1
    case 6: // tag — one content item follows
      return scanItem(buf, p)
    case 4: { // array — `arg` items follow
      for (let i = 0; i < arg; i++) {
        p = scanItem(buf, p)
        if (p < 0) return -1
      }
      return p
    }
    case 5: { // map — `arg` key/value pairs follow
      for (let i = 0; i < arg * 2; i++) {
        p = scanItem(buf, p)
        if (p < 0) return -1
      }
      return p
    }
    default:
      return -1
  }
}

// Walk an indefinite-length item from `pos` until the break byte (0xff).
function scanIndefinite(buf: Uint8Array, pos: number, major: number): number {
  let p = pos
  // For strings: chunks of definite-length strings until break.
  // For arrays/maps: items until break (maps consume pairs but break can occur
  // only at an item boundary, so counting parity is unnecessary for length walk).
  while (true) {
    if (p >= buf.length) return -1
    if (buf[p] === 0xff) return p + 1 // break
    p = scanItem(buf, p)
    if (p < 0) return -1
    void major
  }
}
