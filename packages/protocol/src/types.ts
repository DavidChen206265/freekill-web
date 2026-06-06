// types.ts — FreeKill wire packet semantics (see implementation plan §3).
//
// asio's TCP wire carries bare CBOR arrays concatenated with NO length prefix and
// NO separator — each packet is a self-describing CBOR array. The `command` and
// `data` fields are CBOR BYTE strings (major type 2, 0x40), not text strings.

/** Packet type bit flags (asio Packet::Type). */
export const TYPE_REQUEST = 0x100
export const TYPE_REPLY = 0x200
export const TYPE_NOTIFICATION = 0x400

export const SRC_CLIENT = 0x010
export const SRC_SERVER = 0x020
export const SRC_LOBBY = 0x040

export const DEST_CLIENT = 0x001
export const DEST_SERVER = 0x002
export const DEST_LOBBY = 0x004

/** When set, `data` is Qt-style zlib: 4-byte big-endian original length + zlib stream. */
export const COMPRESSED = 0x1000

/** Special requestId used for notifications. */
export const NOTIFY_REQUEST_ID = -2

/**
 * A decoded packet. The wire form is a CBOR array whose length distinguishes the
 * kind:
 *   Request: [requestId, type, command, data, timeout, timestamp]  (6 elements)
 *   Reply:   [requestId, type, command, data]                      (4 elements)
 *   Notify:  [-2,        type, command, data]                      (4 elements)
 *
 * `command` is decoded to a JS string; `data` is kept as the raw inner CBOR bytes
 * (Uint8Array) — callers decode it with their own CBOR pass, matching how the VM
 * is handed the exact byte string the server emitted.
 */
export interface FkPacket {
  requestId: number
  type: number
  command: string
  /** Raw inner CBOR payload (the byte-string contents, decompressed if COMPRESSED). */
  data: Uint8Array
  /** Present only for requests. */
  timeout?: number
  timestamp?: number
}

export type PacketKind = 'request' | 'reply' | 'notify'

export function packetKind(p: FkPacket): PacketKind {
  if (p.type & TYPE_REQUEST) return 'request'
  if (p.type & TYPE_REPLY) return 'reply'
  return 'notify'
}
