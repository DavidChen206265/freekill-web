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
  // Pre-compiled Lua function handles. CRITICAL: lua.doString compiles a fresh
  // chunk every call and leaks the WASM Lua heap — it corrupts (_ENV becomes nil /
  // "memory access out of bounds") after only ~44 calls. Since we feed a packet +
  // read players on EVERY server packet, that's hit within the first game turn.
  // Define the hot-path helpers ONCE as globals and invoke them via handles.
  private fnFeed: ((cmd: string, hex: string, isReq: boolean) => void) | null = null
  private fnReadPlayers: (() => string) | null = null
  private fnUpdateUI: ((t: string, id: string | number, action: string, dataJson: string) => void) | null = null

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

    // Define the hot-path helpers ONCE (see fnFeed comment — doString leaks).
    await lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      function __fkFeed(cmd, hex, isReq)
        pcall(ClientCallback, ClientInstance, cmd, fromHex(hex or ""), isReq == true)
      end
      function __fkUpdateUI(elemType, id, action, dataJson)
        local ok, err = pcall(function()
          UpdateRequestUI(elemType, id, action, json.decode(dataJson))
        end)
        if not ok then __natives.qWarning("UpdateRequestUI error: " .. tostring(err)) end
      end
      function __fkReadPlayers()
        local out = {}
        local ci = ClientInstance
        if ci and ci.players then
          for _, p in ipairs(ci.players) do
            local sp = p.player
            out[#out+1] = {
              id = p.id, name = sp and sp:getScreenName() or "", avatar = sp and sp:getAvatar() or "",
              seat = p.seat, general = p.general, deputyGeneral = p.deputyGeneral,
              hp = p.hp, maxHp = p.maxHp, role = p.role, kingdom = p.kingdom,
              dead = p.dead, ready = p.ready, owner = p.owner,
              isSelf = (Self ~= nil and p.id == Self.id),
            }
          end
        end
        return json.encode(out)
      end
    `)
    this.fnFeed = lua.global.get('__fkFeed') as typeof this.fnFeed
    this.fnReadPlayers = lua.global.get('__fkReadPlayers') as typeof this.fnReadPlayers
    this.fnUpdateUI = lua.global.get('__fkUpdateUI') as typeof this.fnUpdateUI

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
    if (!this.fnFeed) throw new Error('VM not booted')
    // Call the pre-compiled global (NOT doString — that leaks; see fnFeed comment).
    this.fnFeed(command, toHex(rawData), isRequest)
  }

  /**
   * Drive a UI interaction into the VM's request handler (ui_emu local loop). The
   * VM recomputes selectable/enabled state and pushes notifyUI("UpdateRequestUI",
   * change) — or notifyUI("ReplyToServer", reply) when the request finishes — back
   * through the same onNotifyUI sink. `data` is a plain JSON value (e.g. {selected}).
   */
  async updateRequestUI(elemType: string, id: string | number, action: string, data: unknown): Promise<void> {
    if (!this.fnUpdateUI) throw new Error('VM not booted')
    this.fnUpdateUI(elemType, id, action, JSON.stringify(data ?? {}))
  }

  close(): void {
    this.lua?.global.close()
    this.lua = null
  }

  /**
   * Read the authoritative player list from the VM's state mirror
   * (ClientInstance.players includes Self, which never arrives via AddPlayer).
   * Returns id/name/avatar/seat + game props. This is the reliable source of
   * truth — the VM owns state; deltas alone miss Self (see setup() in clientbase).
   */
  async readPlayers(): Promise<VmPlayer[]> {
    if (!this.fnReadPlayers) return []
    const json = this.fnReadPlayers()
    try { return JSON.parse(json) as VmPlayer[] } catch { return [] }
  }
}

export interface VmPlayer {
  id: number
  name: string
  avatar: string
  seat?: number
  general?: string
  deputyGeneral?: string
  hp?: number
  maxHp?: number
  role?: string
  kingdom?: string
  dead?: boolean
  ready?: boolean
  owner?: boolean
  isSelf?: boolean
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
