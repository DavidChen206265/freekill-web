// @freekill-web/gateway — WSS ↔ asio TCP protocol adapter.
//
// PLACEHOLDER (milestone M0). Responsibilities (plan §3.3):
//   - accept browser WSS; open one asio TCP connection per browser (MVP 1:1)
//   - proxy login: NetworkDelayTest -> RSA-encrypt password (PKCS#1 v1.5, with the
//     32-byte AES-key prefix) -> send Setup notify; version/md5 from manifest
//   - CBOR packet codec via @freekill-web/protocol (PacketStreamDecoder: bare-frame
//     incremental decode; command/data as byte strings 0x40; Qt-zlib for COMPRESSED)
//   - manage requestId / timeout / heartbeat / disconnect; rate-limit
//   - NEVER do game logic; NEVER log plaintext password or login payloads
//
// SECURITY: the login proxy handles credentials — WSS only, no plaintext password
// persisted, no login-payload logging, login-failure rate limiting, asio on
// 127.0.0.1 same-host (risk R-LOGIN).

import { PacketStreamDecoder } from '@freekill-web/protocol'

export function createGateway(): { decoder: PacketStreamDecoder } {
  // Wiring (net.Socket to asio, ws server to browser) lands in M0.
  return { decoder: new PacketStreamDecoder() }
}

// Entry point is a no-op until M0 implements the asio/WSS bridge.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[gateway] placeholder — M0 not yet implemented')
}
