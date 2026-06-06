// ws-bridge.ts — WSS server bridging each browser to a dedicated asio connection.
//
// MVP is 1:1 (one asio TCP connection per browser WS). On WS connect we open an
// AsioClient, run the login handshake, then forward both directions as envelopes:
//   asio packet  -> packetToEnvelope -> JSON over WS
//   WS message   -> validate envelope -> envelopeToPacket -> asio
//
// The browser never sees raw CBOR. Game logic stays in asio; this only adapts
// transport + protocol.

import { WebSocketServer, WebSocket } from 'ws'
import {
  packetToEnvelope,
  envelopeToPacket,
  envelopeSchema,
  type Envelope,
} from '@freekill-web/protocol'
import { AsioClient } from './asio-client.js'
import type { GatewayConfig } from './config.js'

export interface BridgeHandle {
  wss: WebSocketServer
  close(): Promise<void>
}

export function startWsBridge(config: GatewayConfig): BridgeHandle {
  const wss = new WebSocketServer({ port: config.wssPort })
  const log = (...a: unknown[]) => console.log('[ws-bridge]', ...a)

  wss.on('connection', (ws: WebSocket, req) => {
    const peer = req.socket.remoteAddress ?? '?'
    log(`browser connected from ${peer}`)
    const asio = new AsioClient(config)
    let alive = true

    // asio -> browser
    asio.on('packet', (pkt) => {
      if (!alive || ws.readyState !== ws.OPEN) return
      try {
        ws.send(JSON.stringify(packetToEnvelope(pkt)))
      } catch (e) {
        log('failed to forward packet', (e as Error).message)
      }
    })
    asio.on('close', (reason) => {
      log(`asio closed: ${reason}`)
      if (alive) ws.close(1011, 'asio connection closed')
    })
    asio.on('error', (err) => log('asio error', err.message))

    // browser -> asio
    ws.on('message', (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw.toString())
      } catch {
        log('dropping non-JSON ws message')
        return
      }
      const result = envelopeSchema.safeParse(parsed)
      if (!result.success) {
        log('dropping invalid envelope:', result.error.issues[0]?.message)
        return
      }
      try {
        // safeParse validated the structure; data is unknown by design. The zod
        // output types `data` as optional (z.unknown()), so narrow to Envelope.
        asio.send(envelopeToPacket(result.data as Envelope))
      } catch (e) {
        log('failed to send to asio', (e as Error).message)
      }
    })

    ws.on('close', () => {
      alive = false
      asio.close()
      log('browser disconnected')
    })
    ws.on('error', (err) => log('ws error', err.message))

    // Kick off the login handshake; tell the browser the outcome.
    asio
      .connectAndLogin()
      .then((res) => {
        log(`handshake: ok=${res.ok} reason=${res.reason} first=${res.firstLobbyCommand ?? '-'}`)
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            kind: 'notify',
            command: res.ok ? '__gateway_login_ok' : '__gateway_login_failed',
            data: { reason: res.reason, firstLobbyCommand: res.firstLobbyCommand ?? null },
          }))
        }
        if (!res.ok && alive) ws.close(4001, `login failed: ${res.reason}`)
      })
      .catch((err) => {
        log('handshake error', err.message)
        if (alive) ws.close(4000, 'handshake error')
      })
  })

  log(`listening on ws://localhost:${config.wssPort} -> asio ${config.asioHost}:${config.asioPort}`)
  return {
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of wss.clients) c.terminate()
        wss.close(() => resolve())
      }),
  }
}
