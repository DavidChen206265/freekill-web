// qzlib.ts — Qt-style zlib framing (qCompress/qUncompress compatible).
//
// Qt's qCompress prepends a 4-byte big-endian ORIGINAL length to the raw zlib
// (deflate) stream. asio's COMPRESSED packets use this exact framing (see
// util.cpp qCompress_std). We mirror it so the gateway can round-trip compressed
// payloads. Uses Node's zlib in node; in the browser a host-provided inflate can
// be injected later (most client-bound traffic is uncompressed).

import { inflateSync, deflateSync } from 'node:zlib'

/** Decompress a Qt-style payload: 4-byte BE original length + zlib stream. */
export function qUncompress(data: Uint8Array): Uint8Array {
  if (data.length < 4) return new Uint8Array(0)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const originalLen = view.getUint32(0, false) // big-endian
  if (originalLen === 0) return new Uint8Array(0)
  const stream = data.subarray(4)
  const out = inflateSync(stream)
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}

/** Compress to Qt-style framing: 4-byte BE original length + zlib stream. */
export function qCompress(data: Uint8Array, level = 6): Uint8Array {
  const body = deflateSync(data, { level })
  const out = new Uint8Array(4 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length, false) // big-endian original length
  out.set(body, 4)
  return out
}
