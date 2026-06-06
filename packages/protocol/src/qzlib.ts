// qzlib.ts — Qt-style zlib framing (qCompress/qUncompress compatible).
//
// Qt's qCompress prepends a 4-byte big-endian ORIGINAL length to the raw zlib
// (deflate) stream. asio's COMPRESSED packets use this exact framing (see
// util.cpp qCompress_std). This is GATEWAY-SIDE only (Node) — the browser never
// decompresses asio packets directly. To keep the protocol package bundleable for
// the browser, node:zlib is loaded LAZILY (only when these functions are actually
// called, which never happens in the browser bundle).

type ZlibFns = {
  inflateSync: (b: Uint8Array) => Uint8Array
  deflateSync: (b: Uint8Array, o?: { level?: number }) => Uint8Array
}
let _zlib: ZlibFns | null = null
function zlib(): ZlibFns {
  if (_zlib) return _zlib
  // node:zlib loaded lazily via process.getBuiltinModule (Node 22+) — synchronous,
  // NO import statement (so the browser bundle never pulls node:zlib/node:module),
  // and `process` is absent in the browser. Only the Node gateway reaches this;
  // the browser never decompresses asio packets (the gateway does).
  const proc = (globalThis as { process?: { getBuiltinModule?: (m: string) => unknown } }).process
  if (!proc?.getBuiltinModule) {
    throw new Error('qzlib: node:zlib unavailable (COMPRESSED packets are gateway-only, not browser)')
  }
  _zlib = proc.getBuiltinModule('node:zlib') as ZlibFns
  return _zlib
}

/** Decompress a Qt-style payload: 4-byte BE original length + zlib stream. */
export function qUncompress(data: Uint8Array): Uint8Array {
  if (data.length < 4) return new Uint8Array(0)
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const originalLen = view.getUint32(0, false) // big-endian
  if (originalLen === 0) return new Uint8Array(0)
  const out = zlib().inflateSync(data.subarray(4))
  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength)
}

/** Compress to Qt-style framing: 4-byte BE original length + zlib stream. */
export function qCompress(data: Uint8Array, level = 6): Uint8Array {
  const body = zlib().deflateSync(data, { level })
  const out = new Uint8Array(4 + body.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length, false) // big-endian original length
  out.set(body, 4)
  return out
}
