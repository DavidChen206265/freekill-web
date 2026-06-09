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
  type FkPacket,
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

  // Simple per-IP login rate limit (R-LOGIN): max attempts in a sliding window.
  // Prevents password-guessing / connection floods from one source. A SUCCESSFUL
  // login is forgiven (its timestamp removed) so legit connect→refresh→reconnect
  // cycles — which all succeed — don't accumulate toward the limit; only failed /
  // abandoned attempts count. This keeps guessing protection while letting a user
  // refresh freely.
  const LOGIN_MAX = 10
  const LOGIN_WINDOW_MS = 60_000
  const loginAttempts = new Map<string, number[]>()
  const rateLimited = (ip: string): number | false => {
    const now = Date.now()
    const hits = (loginAttempts.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS)
    const stamp = now
    hits.push(stamp)
    loginAttempts.set(ip, hits)
    return hits.length > LOGIN_MAX ? false : stamp
  }
  const forgiveAttempt = (ip: string, stamp: number) => {
    const hits = loginAttempts.get(ip)
    if (hits) loginAttempts.set(ip, hits.filter((t) => t !== stamp))
  }

  // Session keepalive (browser refresh): when a browser WS drops we DON'T close the
  // asio TCP immediately — that would make asio mark the player offline and hand
  // their turn to AI instantly (serverplayer.cpp onDisconnected→setRunned). Instead
  // we detach the AsioClient and park it here for a grace window, keyed by uuid. A
  // reconnect with the same uuid re-attaches the SAME live asio session (player
  // stays Online → no AI takeover, no state loss). Buffered packets flush on
  // reattach. The window is well under asio's ~3min heartbeat ttl.
  const SESSION_GRACE_MS = 25_000
  const parked = new Map<string, { asio: AsioClient; timer: ReturnType<typeof setTimeout> }>()

  wss.on('connection', (ws: WebSocket, req) => {
    const peer = req.socket.remoteAddress ?? '?'
    log(`browser connected from ${peer}`)
    let asio: AsioClient | null = null
    let alive = true
    let loginStarted = false

    const startLogin = (creds?: { user?: string; password?: string; uuid?: string }) => {
      if (loginStarted) return
      loginStarted = true

      // Build the live asio→browser forwarder once (reused for both new + reattached
      // sessions). Closes the browser WS if asio itself dies.
      const forward = (pkt: FkPacket) => {
        if (!alive || ws.readyState !== ws.OPEN) return
        try { ws.send(JSON.stringify(packetToEnvelope(pkt))) }
        catch (e) { log('failed to forward packet', (e as Error).message) }
      }

      // Session reuse: a reconnect with a known uuid means the browser came back
      // within the grace window. The parked asio TCP kept the player ONLINE in asio
      // during the gap, so no premature AI takeover. Now do a FRESH login for this
      // new WS — asio sees the player still online+in-game and runs its native
      // reconnect path (auth.cpp:467 kicks the old/parked conn, then reconnect()
      // rebinds + pushes a full state resync), which is exactly what a blank
      // (hard-refreshed) browser VM needs to rebuild. We just retire the parked
      // entry; asio's emitKicked on the stale conn handles the rest.
      const uuid = creds?.uuid
      if (uuid && parked.has(uuid)) {
        const entry = parked.get(uuid)!
        clearTimeout(entry.timer)
        parked.delete(uuid)
        // Don't close() immediately — asio will kick it when the fresh login lands.
        // But detach our listeners so its imminent close doesn't touch this new ws.
        entry.asio.removeAllListeners()
        log(`returning login for parked uuid=${uuid.slice(0, 8)}… → fresh reconnect (asio resync)`)
        // fall through to a normal fresh login below
      }

      const attemptStamp = rateLimited(peer)
      if (attemptStamp === false) {
        log(`rate-limited login from ${peer}`)
        if (alive) ws.close(4029, 'too many login attempts')
        return
      }
      // Credentials: browser-supplied (preferred) else config defaults. Never log.
      asio = new AsioClient(config, creds && creds.user && creds.password
        ? { user: creds.user, password: creds.password, uuid: creds.uuid }
        : undefined)

      // asio -> browser
      asio.on('packet', forward)
      asio.on('close', (reason) => {
        log(`asio closed: ${reason}`)
        if (alive) ws.close(1011, 'asio connection closed')
      })
      asio.on('error', (err) => log('asio error', err.message))

      asio
        .connectAndLogin()
        .then((res) => {
          log(`handshake: ok=${res.ok} reason=${res.reason} first=${res.firstLobbyCommand ?? '-'}`)
          // Forgive this attempt on success so legit refresh/reconnect cycles don't
          // accumulate toward the per-IP limit (only failures count).
          if (res.ok) forgiveAttempt(peer, attemptStamp)
          if (ws.readyState === ws.OPEN) {
            // Don't leak asio's internal reason to the browser on failure — send a
            // generic message (full detail stays in the server log above).
            ws.send(JSON.stringify({
              kind: 'notify',
              command: res.ok ? '__gateway_login_ok' : '__gateway_login_failed',
              data: res.ok
                ? { firstLobbyCommand: res.firstLobbyCommand ?? null }
                : { reason: '登录失败' },
            }))
          }
          if (!res.ok && alive) ws.close(4001, 'login failed')
        })
        .catch((err) => {
          log('handshake error', err.message)
          if (alive) ws.close(4000, 'handshake error')
        })
    }

    // browser -> asio (plus the __gateway_login control message)
    ws.on('message', (raw) => {
      let parsed: unknown
      try { parsed = JSON.parse(raw.toString()) }
      catch { log('dropping non-JSON ws message'); return }

      // Control message: browser-supplied login. Triggers the asio handshake.
      if (
        parsed && typeof parsed === 'object' &&
        (parsed as { command?: string }).command === '__gateway_login'
      ) {
        const data = (parsed as { data?: { user?: string; password?: string; uuid?: string } }).data ?? {}
        log('received __gateway_login (credentials redacted)')
        startLogin(data)
        return
      }

      // Regular envelope -> asio (only valid after login).
      const result = envelopeSchema.safeParse(parsed)
      if (!result.success) {
        log('dropping invalid envelope:', result.error.issues[0]?.message)
        return
      }
      if (!asio) { log('dropping envelope before login'); return }
      try {
        const env = result.data as Envelope
        // A reply must echo the requestId of asio's pending request (asio matches
        // by id). Prefer the id the BROWSER supplies (it captured the exact request
        // that opened the prompt — robust when several requests are in flight, e.g.
        // the multi-human game-start AskForGeneral). Only fall back to the gateway's
        // own lastRequestId guess when the browser sends 0 (legacy / unknown).
        const stamped: Envelope = env.kind === 'reply'
          ? { ...env, requestId: env.requestId || asio.getLastRequestId() }
          : env
        asio.send(envelopeToPacket(stamped))
      } catch (e) {
        log('failed to send to asio', (e as Error).message)
      }
    })

    ws.on('close', () => {
      alive = false
      // Park the asio session for a grace window instead of closing it, so a quick
      // refresh re-attaches the SAME live session (player stays Online in asio → no
      // AI takeover, no state loss). Only park a fully-logged-in session with a uuid;
      // otherwise close normally. A second drop within the window resets the timer.
      const a = asio
      if (a && a.isAlive() && a.getUuid()) {
        const uuid = a.getUuid()
        // If an older parked entry exists for this uuid, close it (superseded).
        const prev = parked.get(uuid)
        if (prev && prev.asio !== a) { clearTimeout(prev.timer); prev.asio.close() }
        a.detach()
        a.removeAllListeners('close')
        a.removeAllListeners('error')
        a.on('close', () => { const e = parked.get(uuid); if (e && e.asio === a) { clearTimeout(e.timer); parked.delete(uuid) } })
        a.on('error', () => {})
        const timer = setTimeout(() => { if (parked.get(uuid)?.asio === a) { parked.delete(uuid); a.close() } }, SESSION_GRACE_MS)
        parked.set(uuid, { asio: a, timer })
        log(`parked asio session uuid=${uuid.slice(0, 8)}… (grace ${SESSION_GRACE_MS}ms)`)
      } else {
        a?.close()
      }
      log('browser disconnected')
    })
    ws.on('error', (err) => log('ws error', err.message))

    // If the browser doesn't send __gateway_login within a grace period, fall
    // back to config credentials (keeps the old browser-connect.html test working).
    setTimeout(() => { if (alive && !loginStarted) startLogin() }, 1500)
  })

  log(`listening on ws://localhost:${config.wssPort} -> asio ${config.asioHost}:${config.asioPort}`)
  return {
    wss,
    close: () =>
      new Promise<void>((resolve) => {
        for (const { timer, asio } of parked.values()) { clearTimeout(timer); asio.close() }
        parked.clear()
        for (const c of wss.clients) c.terminate()
        wss.close(() => resolve())
      }),
  }
}
