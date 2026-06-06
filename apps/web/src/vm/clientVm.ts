// clientVm.ts — the browser-side FreeKill client VM (wasmoon).
//
// Creates a wasmoon engine, mounts the freekill-core resource tree (fetched from
// Vite static /fk), runs the verified boot sequence, and exposes feedPacket() to
// drive ClientCallback with raw CBOR from gateway envelopes. notifyUI deltas are
// surfaced via the onNotifyUI callback. This is the first time the client logic
// layer runs in a real browser (M2).

import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient, mountFromFetch, type FileListManifest } from '@freekill-web/lua-native'
// wasmoon ships a single glue.wasm; Vite's ?url gives a correctly-served asset URL
// so the emscripten module can fetch it (custom wasm URI to LuaFactory).
import glueWasmUrl from 'wasmoon/dist/glue.wasm?url'

export interface NotifyEvent {
  command: string
  data: unknown
}

export interface ClientVmStats {
  mountFiles: number
  mountMs: number
  bootMs: number
  engine: { generals: number; cards: number; skills: number; packages: number; modes: number }
}

const FK_BASE_URL = '/fk/packages/freekill-core'
const FILE_LIST_URL = '/fk/file-list.json'
const PRELUDE_URL = '/fk/fkprelude.lua'
const VFS_CORE = '/fk/packages/freekill-core'

export interface ServerMessage {
  command: string
  data: string
}

export class ClientVm {
  private lua: Awaited<ReturnType<LuaFactory['createEngine']>> | null = null
  private notifyFeed: (e: NotifyEvent) => void
  private onServer?: (m: ServerMessage) => void

  constructor(onNotifyUI: (e: NotifyEvent) => void, onNotifyServer?: (m: ServerMessage) => void) {
    this.notifyFeed = onNotifyUI
    this.onServer = onNotifyServer
  }

  /** Mount resources + boot the client engine. Returns perf stats. */
  async boot(): Promise<ClientVmStats> {
    const factory = new LuaFactory(glueWasmUrl)
    const luaModule = await factory.getLuaModule()
    const FS = (luaModule as { module: { FS: EmFS } }).module.FS

    // 1) mount resources via fetch (Vite static).
    const manifest = (await fetchJson(FILE_LIST_URL)) as FileListManifest
    const mount = await mountFromFetch(factory, luaModule, FK_BASE_URL, manifest)

    // 2) natives + engine.
    const natives = createNatives({
      emfs: FS as unknown as Parameters<typeof createNatives>[0]['emfs'],
      onNotifyUI: (e) => this.notifyFeed(e),
      onNotifyServer: (m) => this.onServer?.(m),
      log: () => {},
    })
    const lua = await factory.createEngine({ injectObjects: true })
    this.lua = lua
    FS.chdir(VFS_CORE)

    // 3) boot (prelude -> freekill.lua -> client.lua -> CreateLuaClient).
    const preludeLua = await fetchText(PRELUDE_URL)
    const tb = performance.now()
    const res = await bootClient({ lua: lua as never, natives, preludeLua })
    const bootMs = Math.round(performance.now() - tb)

    return {
      mountFiles: mount.files,
      mountMs: mount.ms,
      bootMs,
      engine: res.engine,
    }
  }

  /**
   * Feed a server packet into the client VM. `rawData` is the ORIGINAL inner CBOR
   * (from the envelope's base64 `raw`), which ClientCallback decodes itself.
   */
  async feedPacket(command: string, rawData: Uint8Array, isRequest: boolean): Promise<void> {
    if (!this.lua) throw new Error('VM not booted')
    // Hand the raw bytes to Lua as a latin1 string (byte-preserving) and call
    // ClientCallback exactly like the native client does.
    this.lua.global.set('__pktCmd', command)
    this.lua.global.set('__pktHex', toHex(rawData))
    this.lua.global.set('__pktReq', isRequest)
    await this.lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      pcall(ClientCallback, ClientInstance, __pktCmd, fromHex(__pktHex or ""), __pktReq == true)
    `)
  }

  close(): void {
    this.lua?.global.close()
    this.lua = null
  }
}

interface EmFS { chdir(p: string): void }

// Fetch helpers that FAIL LOUDLY. Without the res.ok check, a Vite 404 returns
// its HTML fallback page ("<!doctype html>...") with status 200-looking content,
// which then gets fed to Lua and dies with "unexpected symbol near '<'". Guard it.
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  const text = await res.text()
  if (text.startsWith('<!doctype') || text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
    throw new Error(`fetch ${url} returned HTML (missing asset? run \`pnpm --filter web sync-assets\`)`)
  }
  return text
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`)
  return res.json()
}

function toHex(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i]!.toString(16).padStart(2, '0')
  return s
}
