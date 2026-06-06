// convert.ts — translate between asio FkPacket and the browser-facing Envelope.
//
// asio packets carry `data` as raw inner CBOR bytes. The browser envelope carries
// `data` as an already-decoded JS value (the browser never touches CBOR). These
// helpers bridge the two directions, using the SAME cbor-x config as codec.ts
// (mapsAsObjects:false — asio maps have non-string keys).

import { Encoder, Decoder } from 'cbor-x'
import {
  type FkPacket,
  packetKind,
  TYPE_NOTIFICATION,
  TYPE_REPLY,
  SRC_CLIENT,
  DEST_SERVER,
  NOTIFY_REQUEST_ID,
} from './types.js'
import type { Envelope } from './envelope.js'

// tagUint8Array:false: emit PLAIN CBOR byte strings (asio rejects cbor-x's
// default tag-64 wrapping). See codec.ts.
const innerEncoder = new Encoder({ useRecords: false, mapsAsObjects: false, tagUint8Array: false })
// Inner data is browser-facing: prefer plain JS objects (mapsAsObjects:true) so
// the envelope carries clean JSON. A few asio payloads have non-string CBOR map
// keys and throw under object mode — for those we retry with Map mode and convert
// shallowly so the browser still gets something structured.
const innerDecoderObj = new Decoder({ useRecords: false, mapsAsObjects: true })
const innerDecoderMap = new Decoder({ useRecords: false, mapsAsObjects: false })

const EMPTY = new Uint8Array(0)
const te = new TextEncoder()

// Recursively turn cbor-x Maps into plain objects (string-coerced keys) so the
// envelope is JSON-serializable. Also normalize BigInt (cbor-x decodes large CBOR
// ints to BigInt, which JSON.stringify cannot serialize) to number when it fits
// in a safe integer, else to a decimal string. Applied to ALL decoded inner data.
function normalizeForJson(v: unknown): unknown {
  if (typeof v === 'bigint') {
    return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(v)
      : v.toString()
  }
  if (v instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of v) out[String(k)] = normalizeForJson(val)
    return out
  }
  if (Array.isArray(v)) return v.map(normalizeForJson)
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    const out: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(v)) out[k] = normalizeForJson(val)
    return out
  }
  return v
}

/**
 * Build the Setup login packet (see implementation plan §3.2 and asio auth.cpp).
 * data is a 5-element CBOR array of BYTE STRINGS: [name, password, md5, version,
 * uuid]. `password` is the RSA-encrypted ciphertext bytes (already prefixed with
 * the 32-byte placeholder + plaintext before encryption — see gateway rsa.ts).
 */
export function buildSetupPacket(opts: {
  name: string
  encryptedPassword: Uint8Array
  md5: string
  version: string
  uuid: string
}): FkPacket {
  const arr = [
    te.encode(opts.name),
    opts.encryptedPassword,
    te.encode(opts.md5),
    te.encode(opts.version),
    te.encode(opts.uuid),
  ]
  return {
    requestId: NOTIFY_REQUEST_ID,
    type: TYPE_NOTIFICATION | SRC_CLIENT | DEST_SERVER,
    command: 'Setup',
    data: Uint8Array.from(innerEncoder.encode(arr)),
  }
}

/** Decode a packet's inner CBOR `data` to a JSON-safe JS value (null-safe). */
export function decodeInnerData(data: Uint8Array): unknown {
  if (!data || data.length === 0) return null
  try {
    return normalizeForJson(innerDecoderObj.decode(data))
  } catch {
    // Non-string CBOR map keys throw under object mode — retry with Map mode.
    try {
      return normalizeForJson(innerDecoderMap.decode(data))
    } catch {
      // Not CBOR at all (plain text payload) — return the UTF-8 string.
      return new TextDecoder().decode(data)
    }
  }
}

/** Encode a JS value to inner CBOR bytes for an asio packet's `data` field. */
export function encodeInnerData(value: unknown): Uint8Array {
  if (value === null || value === undefined) return EMPTY
  return Uint8Array.from(innerEncoder.encode(value))
}

/**
 * Extract the RSA public-key PEM from a NetworkDelayTest packet. asio wraps the
 * PEM as json::binary → CBOR byte string, so the packet's inner `data` decodes to
 * a byte string whose UTF-8 contents are the PEM ("-----BEGIN RSA PUBLIC KEY...").
 */
export function extractPublicKeyPem(pkt: FkPacket): string {
  const inner = decodeInnerData(pkt.data)
  if (inner instanceof Uint8Array) return new TextDecoder().decode(inner)
  if (typeof inner === 'string') return inner
  throw new Error('NetworkDelayTest payload did not contain a PEM byte string')
}

/**
 * asio packet → browser envelope. The inner CBOR `data` is decoded to a JS value;
 * request packets carry timeout/timestamp.
 */
export function packetToEnvelope(pkt: FkPacket): Envelope {
  const data = decodeInnerData(pkt.data)
  const kind = packetKind(pkt)
  if (kind === 'request') {
    return {
      kind: 'request',
      requestId: pkt.requestId,
      command: pkt.command,
      data,
      timeout: pkt.timeout ?? 0,
      timestamp: pkt.timestamp ?? 0,
    }
  }
  if (kind === 'reply') {
    return { kind: 'reply', requestId: pkt.requestId, command: pkt.command, data }
  }
  return { kind: 'notify', command: pkt.command, data }
}

/**
 * browser envelope → asio packet. Browser only ever sends replies (to requests)
 * and notifies (e.g. chat, lobby actions). Both go to the server as SRC_CLIENT.
 */
export function envelopeToPacket(env: Envelope): FkPacket {
  const data = encodeInnerData(env.data)
  if (env.kind === 'reply') {
    return {
      requestId: env.requestId,
      type: TYPE_REPLY | SRC_CLIENT | DEST_SERVER,
      command: env.command,
      data,
    }
  }
  if (env.kind === 'notify') {
    return {
      requestId: NOTIFY_REQUEST_ID,
      type: TYPE_NOTIFICATION | SRC_CLIENT | DEST_SERVER,
      command: env.command,
      data,
    }
  }
  // A browser sending a 'request' is unusual but supported for completeness.
  return {
    requestId: env.requestId,
    type: TYPE_NOTIFICATION | SRC_CLIENT | DEST_SERVER,
    command: env.command,
    data,
  }
}
