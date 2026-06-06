// handshake.test.ts — integration test against a LIVE freekill-asio.
//
// Skipped unless FK_ASIO_HOST (or ASIO_HOST) is set, so CI without asio stays
// green. Run locally with the WSL NAT IP:
//   ASIO_HOST=172.29.119.214 pnpm --filter @freekill-web/gateway test
//
// Asserts the full login handshake (NetworkDelayTest -> RSA Setup -> lobby) and
// that asio auto-registers the unknown user, accepting us into the lobby.

import { describe, it, expect } from 'vitest'
import { AsioClient } from '../src/asio-client.js'
import type { GatewayConfig } from '../src/config.js'

const ASIO_HOST = process.env.ASIO_HOST ?? process.env.FK_ASIO_HOST

const cfg: GatewayConfig = {
  asioHost: ASIO_HOST ?? '',
  asioPort: Number(process.env.ASIO_PORT ?? '9527'),
  fkVersion: process.env.FK_VERSION ?? '0.5.20',
  fkMd5: process.env.FK_MD5 ?? 'e48d6db7c1ea5c6efddcc06fe3071eeb',
  wssPort: 9528,
  user: process.env.FK_USER ?? `m0test_${Date.now() % 100000}`,
  password: process.env.FK_PASS ?? 'm0-pass',
  uuid: process.env.FK_UUID ?? `m0-uuid-${Date.now() % 100000}`,
}

describe('asio login handshake (live)', () => {
  it.skipIf(!ASIO_HOST)('completes NetworkDelayTest -> Setup -> lobby', async () => {
    const client = new AsioClient(cfg)
    const result = await client.connectAndLogin(10_000)
    client.close()
    expect(result.ok).toBe(true)
    expect(result.firstLobbyCommand).toBeTruthy()
  }, 15_000)
})
