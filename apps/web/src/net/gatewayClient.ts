// gatewayClient.ts — browser WebSocket client for the FreeKill gateway.
//
// Speaks the gateway envelope protocol: sends a __gateway_login control message
// with credentials, then exchanges Envelopes. Incoming server commands are routed
// to a single onEnvelope handler (the store layer fans them out). The browser
// never touches CBOR — the gateway already decoded inner data to JSON.

import type { Envelope, NotifyEnvelope, ReplyEnvelope } from '@freekill-web/protocol'

export interface LoginCredentials {
  user: string
  password: string
  uuid?: string
  server?: string
}

export type GatewayStatus = 'idle' | 'connecting' | 'logging-in' | 'online' | 'failed' | 'closed'

export interface GatewayClientOptions {
  url: string
  onStatus?: (status: GatewayStatus, detail?: string) => void
  onEnvelope?: (env: Envelope) => void
}

export class GatewayClient {
  private ws: WebSocket | null = null
  private status: GatewayStatus = 'idle'

  constructor(private readonly opts: GatewayClientOptions) {}

  private setStatus(s: GatewayStatus, detail?: string) {
    this.status = s
    this.opts.onStatus?.(s, detail)
  }

  /** Connect and log in with the given credentials. */
  connect(creds: LoginCredentials): void {
    this.setStatus('connecting')
    const ws = new WebSocket(this.opts.url)
    this.ws = ws

    ws.onopen = () => {
      this.setStatus('logging-in')
      // Control message: hand credentials to the gateway, which runs the asio
      // handshake. Not an Envelope — a gateway-private control frame.
      ws.send(JSON.stringify({
        kind: 'notify',
        command: '__gateway_login',
        data: { user: creds.user, password: creds.password, uuid: creds.uuid },
      }))
    }

    ws.onmessage = (ev) => {
      let env: Envelope
      try { env = JSON.parse(ev.data as string) as Envelope } catch { return }
      const command = (env as NotifyEnvelope).command
      if (command === '__gateway_login_ok') { this.setStatus('online'); return }
      if (command === '__gateway_log_replay') {
        // War-report replay after a reconnect (gateway buffered GameLog lines; the
        // asio resync doesn't include them). Surface as a normal notify the store
        // layer handles (prepend to the log panel).
        this.opts.onEnvelope?.(env)
        return
      }
      if (command === '__gateway_login_failed') {
        const d = (env as NotifyEnvelope).data as { reason?: string } | null
        this.setStatus('failed', d?.reason)
        return
      }
      this.opts.onEnvelope?.(env)
    }

    ws.onclose = (ev) => this.setStatus('closed', ev.reason || `code ${ev.code}`)
    ws.onerror = () => this.setStatus('failed', 'websocket error')
  }

  /** Send a notify to the server (e.g. RefreshRoomList, Chat, CreateRoom). */
  notify(command: string, data: unknown): void {
    this.send({ kind: 'notify', command, data })
  }

  /** Send a reply to a server request. */
  reply(requestId: number, data: unknown, command = ''): void {
    this.send({ kind: 'reply', requestId, command, data } as ReplyEnvelope)
  }

  private send(env: Envelope): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(env))
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
  }

  getStatus(): GatewayStatus {
    return this.status
  }
}
