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

// Commands that indicate the server accepted us into the lobby/room (success).
const LOBBY_OK_COMMANDS = new Set(['Setup', 'EnterLobby', 'EnterRoom', 'UpdateAvatar', 'NetworkDelayTest2'])
// Commands that indicate a rejected login.
const LOGIN_FAIL_COMMANDS = new Set(['ErrorDlg', 'ErrorMsg'])

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
      // Login accepted. Mark done, then re-emit this packet as the first real one.
      this.handshakeDone = true
      finish({ ok: true, reason: 'logged in', firstLobbyCommand: pkt.command })
      this.emit('packet', pkt)
      return
    }
    // Any other server packet after Setup also implies acceptance.
    this.handshakeDone = true
    finish({ ok: true, reason: 'logged in (implicit)', firstLobbyCommand: pkt.command })
    this.emit('packet', pkt)
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

  close(): void {
    this.socket?.end()
  }
}
