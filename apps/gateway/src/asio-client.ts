// asio-client.ts — one TCP connection to freekill-asio with the login handshake.
//
// Wire: bare concatenated CBOR packets (no length prefix) — decoded incrementally
// by protocol's PacketStreamDecoder. Handshake (plan §3.2, asio auth.cpp):
//   1. asio sends NetworkDelayTest notify carrying its RSA public-key PEM.
//   2. we reply with a Setup notify: [name, RSA(32-prefix+password), md5, ver, uuid].
//   3. asio validates (version/uuid/md5/password); on success it sends lobby
//      packets (Setup ack / EnterLobby / EnterRoom). On failure it sends an
//      ErrorDlg/ErrorMsg and closes.

import net from 'node:net'
import { EventEmitter } from 'node:events'
import {
  PacketStreamDecoder,
  encodePacket,
  buildSetupPacket,
  extractPublicKeyPem,
  packetKind,
  type FkPacket,
} from '@freekill-web/protocol'
import { encryptPassword } from './rsa.js'
import type { GatewayConfig } from './config.js'

export interface HandshakeResult {
  ok: boolean
  /** The packet that signalled completion (success: a lobby packet; failure: ErrorDlg/Msg). */
  reason: string
  firstLobbyCommand?: string
}

// Commands that indicate the server accepted us (post-login). asio sends `Setup`
// first on success (auth.cpp updateUserLoginData → createNewPlayer → lobby), then
// EnterLobby/EnterRoom. See FreeKill server room.cpp/lobby.cpp.
const LOBBY_OK_COMMANDS = new Set(['Setup', 'EnterLobby', 'EnterRoom', 'UpdateAvatar', 'NetworkDelayTest2'])
// Commands that indicate a rejected login. asio sends ErrorDlg/ErrorMsg on
// version/uuid/password failure, and ErrorMsg + UpdatePackage on MD5 mismatch
// (auth.cpp checkMd5), then disconnects.
const LOGIN_FAIL_COMMANDS = new Set(['ErrorDlg', 'ErrorMsg', 'UpdatePackage'])

/**
 * A live connection to asio. Emits:
 *   'packet' (FkPacket)  — every decoded server packet AFTER handshake completes
 *   'close'  (reason)    — socket closed
 *   'error'  (Error)
 */
/** Per-connection login credentials; overrides config defaults. */
export interface Credentials {
  user: string
  password: string
  uuid?: string
}

export class AsioClient extends EventEmitter {
  private socket: net.Socket | null = null
  private decoder = new PacketStreamDecoder()
  private handshakeDone = false
  // Packets that arrived pre-handshake but weren't a known OK/fail marker; replayed
  // in order once login succeeds so nothing is lost.
  private preHandshakeBuffer: FkPacket[] = []
  // The requestId of the most recent REQUEST packet from asio. A client reply must
  // echo it (asio matches replies by requestId — router.cpp expectedReplyIds). The
  // QML router tracks the same value as `this->requestId`.
  private lastRequestId = 0
  // Session-keepalive (browser refresh): while the browser WS is gone but we keep
  // the asio TCP alive (parked), packets are dropped (detached) — a returning login
  // gets a full asio reconnect resync, so the gap content isn't needed.
  private detached = false
  private readonly creds: { user: string; password: string; uuid: string }

  constructor(private readonly config: GatewayConfig, creds?: Credentials) {
    super()
    this.creds = {
      user: creds?.user ?? config.user,
      password: creds?.password ?? config.password,
      uuid: creds?.uuid ?? config.uuid,
    }
  }

  /** Connect and run the login handshake. Resolves once the server accepts (or rejects). */
  connectAndLogin(timeoutMs = 10_000): Promise<HandshakeResult> {
    return new Promise((resolve, reject) => {
      const sock = net.connect(this.config.asioPort, this.config.asioHost)
      this.socket = sock
      let settled = false
      const timer = setTimeout(() => {
        if (!settled) { settled = true; sock.destroy(); reject(new Error('handshake timeout')) }
      }, timeoutMs)

      const finish = (res: HandshakeResult) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.handshakeDone = res.ok
        resolve(res)
      }

      sock.on('connect', () => { /* wait for NetworkDelayTest */ })

      sock.on('data', (chunk: Buffer) => {
        const pkts = this.decoder.feed(new Uint8Array(chunk))
        for (const pkt of pkts) this.onPacket(pkt, finish)
      })

      sock.on('error', (err) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(err) }
        else this.emit('error', err)
      })

      sock.on('close', () => {
        this.emit('close', sock.errored?.message ?? 'closed')
        if (!settled) { settled = true; clearTimeout(timer); resolve({ ok: false, reason: 'closed before handshake' }) }
      })
    })
  }

  private onPacket(pkt: FkPacket, finish: (r: HandshakeResult) => void): void {
    if (this.handshakeDone) {
      // Track the latest request id so client replies can echo it.
      if (packetKind(pkt) === 'request') this.lastRequestId = pkt.requestId
      // While detached (browser gone, session parked) drop packets — a returning
      // login triggers asio's native reconnect + full resync, so gap content isn't
      // needed and there's no live WS to forward to anyway.
      if (this.detached) return
      this.emit('packet', pkt)
      return
    }

    // Pre-handshake routing.
    if (pkt.command === 'NetworkDelayTest') {
      this.sendSetup(pkt)
      return
    }
    if (LOGIN_FAIL_COMMANDS.has(pkt.command)) {
      finish({ ok: false, reason: `${pkt.command}` })
      return
    }
    if (LOBBY_OK_COMMANDS.has(pkt.command)) {
      // Login accepted. Mark done, replay any buffered pre-handshake packets in
      // order, then re-emit this packet as the first real one.
      this.handshakeDone = true
      finish({ ok: true, reason: 'logged in', firstLobbyCommand: pkt.command })
      for (const buffered of this.preHandshakeBuffer) this.emit('packet', buffered)
      this.preHandshakeBuffer = []
      this.emit('packet', pkt)
      return
    }
    // Unknown packet before any success/fail marker: don't assume success (that
    // could mask a rejection arriving out of expected order). Buffer it to replay
    // once the handshake resolves; the connect timeout guards against a stall.
    this.preHandshakeBuffer.push(pkt)
  }

  private sendSetup(networkDelayTest: FkPacket): void {
    const pem = extractPublicKeyPem(networkDelayTest)
    const encryptedPassword = encryptPassword(pem, this.creds.password)
    const setup = buildSetupPacket({
      name: this.creds.user,
      encryptedPassword,
      md5: this.config.fkMd5,
      version: this.config.fkVersion,
      uuid: this.creds.uuid,
    })
    this.send(setup)
  }

  /** Send a packet to asio. */
  send(pkt: FkPacket): void {
    if (!this.socket || this.socket.destroyed) throw new Error('asio socket not connected')
    this.socket.write(Buffer.from(encodePacket(pkt)))
  }

  /** The requestId a client reply should echo (latest request from asio). */
  getLastRequestId(): number {
    return this.lastRequestId
  }

  /** The uuid this session logged in with — the session-reuse map key. */
  getUuid(): string {
    return this.creds.uuid
  }

  /** Detach from the browser WS (it dropped) but KEEP the asio TCP alive so the
   *  player stays Online in asio during the grace window → no premature AI takeover.
   *  Packets that arrive while detached are dropped (a returning login triggers
   *  asio's native reconnect + full resync, so the gap content isn't needed). */
  detach(): void {
    this.detached = true
  }

  /** True if the asio TCP is still connected (used to validate a park candidate). */
  isAlive(): boolean {
    return !!this.socket && !this.socket.destroyed
  }

  close(): void {
    const sock = this.socket
    this.socket = null
    if (!sock) return
    // end() then destroy() to ensure the FD is released even if the peer never
    // FIN-acks (avoids accumulating half-open sockets on browser churn — R-CONN).
    sock.end()
    sock.destroy()
    this.preHandshakeBuffer = []
    this.removeAllListeners()
  }
}
