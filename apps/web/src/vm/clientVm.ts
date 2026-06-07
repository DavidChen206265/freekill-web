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
  private fnFinishUI: (() => void) | null = null
  private fnReadCards: ((cidsJson: string) => string) | null = null
  private fnTranslate: ((keysJson: string) => string) | null = null
  private fnReadSkills: (() => string) | null = null
  private fnReadGenerals: ((namesJson: string) => string) | null = null
  private fnChooseGeneral: ((kind: string, argsJson: string) => string) | null = null
  private fnPlayerSkills: ((id: number) => string) | null = null
  private fnGameSummary: (() => string) | null = null

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
      -- Operation-timeout / state-leaving UI cleanup (client_util.lua FinishRequestUI):
      -- runs the request handler's _finish (clears half-built UI objects). It does NOT
      -- send a reply — the SERVER owns the real timeout and picks the default answer.
      function __fkFinishRequestUI()
        pcall(FinishRequestUI)
      end
      function __fkReadPlayers()
        local out = {}
        local ci = ClientInstance
        if ci and ci.players then
          for _, p in ipairs(ci.players) do
            local sp = p.player
            -- Displayable marks: @-prefixed with a numeric/string value (MarkArea).
            local marks = {}
            if type(p.mark) == "table" then
              for k, v in pairs(p.mark) do
                if type(k) == "string" and k:startsWith("@") then
                  local n = (type(v) == "number") and v
                    or (type(v) == "table" and not Util.isCborObject(v)) and #v or nil
                  if n and n ~= 0 then marks[#marks+1] = { name = k, value = n } end
                end
              end
            end
            out[#out+1] = {
              id = p.id, name = sp and sp:getScreenName() or "", avatar = sp and sp:getAvatar() or "",
              seat = p.seat, general = p.general, deputyGeneral = p.deputyGeneral,
              hp = p.hp, maxHp = p.maxHp, shield = p.shield, role = p.role, kingdom = p.kingdom,
              dead = p.dead, ready = p.ready, owner = p.owner,
              chained = p.chained, dying = p.dying, role_shown = p.role_shown, faceup = p.faceup,
              -- roleVisible mirrors RoleVisibility(p.id) = Self:roleVisible(p) (player.lua:1699):
              -- whether THIS client may see p's role. Photo.qml computes the shown role as
              --   hidden -> hidden; role_shown -> role; else roleVisible ? role : "unknown".
              roleVisible = (Self ~= nil and Self.roleVisible and Self:roleVisible(p)) or false,
              sealedSlots = p.sealedSlots or {},
              equipCids = p.getCardIds and p:getCardIds("e") or {},
              judgeCids = p.getCardIds and p:getCardIds("j") or {},
              handcardNum = p.getHandcardNum and p:getHandcardNum() or 0,
              marks = marks,
              isSelf = (Self ~= nil and p.id == Self.id),
            }
          end
        end
        return json.encode(out)
      end
      -- Card faces: GetCardData(cid) -> {name,number,suit,color,type,subtype,extension,...}.
      function __fkReadCards(cidsJson)
        local out = {}
        local ok, cids = pcall(json.decode, cidsJson)
        if ok and type(cids) == "table" then
          for _, cid in ipairs(cids) do
            local d = GetCardData(cid)
            out[tostring(cid)] = { name = d.name, number = d.number, suit = d.suit,
              color = d.color, type = d.type, subtype = d.subtype, extension = d.extension,
              virt_name = d.virt_name, mark = d.mark or {} }
          end
        end
        return json.encode(out)
      end
      -- Batch translate keys via Fk:translate (slash->杀, spade->♠, skills, ...).
      function __fkTranslate(keysJson)
        local out = {}
        local ok, keys = pcall(json.decode, keysJson)
        if ok and type(keys) == "table" then
          for _, k in ipairs(keys) do out[k] = Translate(tostring(k)) end
        end
        return json.encode(out)
      end
      -- Self's visible skill names.
      function __fkReadSkills()
        local ok, sk = pcall(GetMySkills)
        return json.encode((ok and sk) or {})
      end
      -- General -> {extension, kingdom} for resolving portrait paths.
      function __fkReadGenerals(namesJson)
        local out = {}
        local ok, names = pcall(json.decode, namesJson)
        if ok and type(names) == "table" then
          for _, n in ipairs(names) do
            if type(n) == "string" and n ~= "" then
              local d = GetGeneralData(n)
              out[n] = { extension = d.extension, kingdom = d.kingdom }
            end
          end
        end
        return json.encode(out)
      end
      -- Choose-general rule helpers (ChooseGeneralBox.qml -> client_util.lua):
      -- prompt(rule,generals,extra), filter(rule,name,selected,generals,extra) per
      -- candidate's selectability, feasible(rule,selected,generals,extra) for OK.
      -- argsJson packs all params so we cross the bridge once per call.
      function __fkChooseGeneral(kind, argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local res
        if kind == "prompt" then
          res = ChooseGeneralPrompt(a.rule, a.generals or {}, a.extra)
        elseif kind == "filter" then
          res = ChooseGeneralFilter(a.rule, a.name, a.selected or {}, a.generals or {}, a.extra)
        elseif kind == "feasible" then
          res = ChooseGeneralFeasible(a.rule, a.selected or {}, a.generals or {}, a.extra)
        end
        return json.encode({ r = res })
      end
      -- Player detail (PlayerDetail.qml right-click): visible skills [{name,description}]
      -- via GetPlayerSkills(id) (client_util.lua:399). Self sees all visible skills;
      -- others hide equip/& skills. Returns [] when the player is unknown.
      function __fkPlayerSkills(id)
        local ok, sk = pcall(GetPlayerSkills, id)
        return json.encode((ok and sk) or {})
      end
      -- GameOver summary (GameOverBox.qml): the server's GameSummary banner joined
      -- with each player's general/deputy/role from the VM mirror. Per seat:
      -- {turn,recover,damage,damaged,kill,scname} + general/deputy/role/id.
      function __fkGameSummary()
        local out = {}
        local ci = ClientInstance
        local data = ci and ci.getBanner and ci:getBanner("GameSummary")
        if type(data) ~= "table" then return json.encode(out) end
        local bySeat = {}
        if ci.players then for _, p in ipairs(ci.players) do if p.seat then bySeat[p.seat] = p end end end
        for seat, s in ipairs(data) do
          local p = bySeat[seat]
          out[#out+1] = {
            seat = seat, scname = s.scname,
            turn = s.turn or 0, recover = s.recover or 0,
            damage = s.damage or 0, damaged = s.damaged or 0, kill = s.kill or 0,
            general = p and p.general or "", deputy = p and p.deputyGeneral or "",
            role = p and p.role or "", id = p and p.id or 0,
          }
        end
        return json.encode(out)
      end
    `)
    this.fnFeed = lua.global.get('__fkFeed') as typeof this.fnFeed
    this.fnReadPlayers = lua.global.get('__fkReadPlayers') as typeof this.fnReadPlayers
    this.fnUpdateUI = lua.global.get('__fkUpdateUI') as typeof this.fnUpdateUI
    this.fnFinishUI = lua.global.get('__fkFinishRequestUI') as typeof this.fnFinishUI
    this.fnReadCards = lua.global.get('__fkReadCards') as typeof this.fnReadCards
    this.fnTranslate = lua.global.get('__fkTranslate') as typeof this.fnTranslate
    this.fnReadSkills = lua.global.get('__fkReadSkills') as typeof this.fnReadSkills
    this.fnReadGenerals = lua.global.get('__fkReadGenerals') as typeof this.fnReadGenerals
    this.fnChooseGeneral = lua.global.get('__fkChooseGeneral') as typeof this.fnChooseGeneral
    this.fnPlayerSkills = lua.global.get('__fkPlayerSkills') as typeof this.fnPlayerSkills
    this.fnGameSummary = lua.global.get('__fkGameSummary') as typeof this.fnGameSummary

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

  /** UI cleanup when the operation times out / leaves the active state (does NOT
   *  reply — the server owns the real timeout). Mirrors FinishRequestUI. */
  finishRequestUI(): void {
    this.fnFinishUI?.()
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

  /** Batch-read card faces (cid -> {name,number,suit,color,type,...}). */
  readCards(cids: number[]): Record<string, CardFace> {
    if (!this.fnReadCards || cids.length === 0) return {}
    try { return JSON.parse(this.fnReadCards(JSON.stringify(cids))) as Record<string, CardFace> } catch { return {} }
  }

  /** Batch-translate keys via the VM's Fk:translate (key -> localized text). */
  translate(keys: string[]): Record<string, string> {
    if (!this.fnTranslate || keys.length === 0) return {}
    try { return JSON.parse(this.fnTranslate(JSON.stringify(keys))) as Record<string, string> } catch { return {} }
  }

  /** Self's visible skill names. */
  readSkills(): string[] {
    if (!this.fnReadSkills) return []
    try { return JSON.parse(this.fnReadSkills()) as string[] } catch { return [] }
  }

  /** General name -> {extension, kingdom} for resolving portrait paths. */
  readGenerals(names: string[]): Record<string, GeneralInfo> {
    if (!this.fnReadGenerals || names.length === 0) return {}
    try { return JSON.parse(this.fnReadGenerals(JSON.stringify(names))) as Record<string, GeneralInfo> } catch { return {} }
  }

  /** ChooseGeneralBox rule helpers. prompt → localized prompt string; filter →
   *  whether `name` is selectable given `selected`; feasible → whether OK is
   *  enabled for `selected`. (client_util.lua ChooseGeneral{Prompt,Filter,Feasible}.) */
  chooseGeneralPrompt(rule: string, generals: string[], extra: unknown): string {
    return String(this.callChooseGeneral('prompt', { rule, generals, extra }) ?? '')
  }
  chooseGeneralFilter(rule: string, name: string, selected: string[], generals: string[], extra: unknown): boolean {
    return !!this.callChooseGeneral('filter', { rule, name, selected, generals, extra })
  }
  chooseGeneralFeasible(rule: string, selected: string[], generals: string[], extra: unknown): boolean {
    return !!this.callChooseGeneral('feasible', { rule, selected, generals, extra })
  }
  private callChooseGeneral(kind: string, args: unknown): unknown {
    if (!this.fnChooseGeneral) return undefined
    try { return (JSON.parse(this.fnChooseGeneral(kind, JSON.stringify(args))) as { r: unknown }).r } catch { return undefined }
  }

  /** Visible skills [{name, description}] of a player, for the right-click detail
   *  panel (PlayerDetail.qml → GetPlayerSkills, client_util.lua:399). */
  playerSkills(id: number): { name: string; description: string }[] {
    if (!this.fnPlayerSkills) return []
    try { return JSON.parse(this.fnPlayerSkills(id)) as { name: string; description: string }[] } catch { return [] }
  }

  /** GameOver per-player summary rows (GameOverBox.qml getSummary): turn/recover/
   *  damage/damaged/kill joined with each seat's general/deputy/role. [] if absent. */
  gameSummary(): GameSummaryRow[] {
    if (!this.fnGameSummary) return []
    try { return JSON.parse(this.fnGameSummary()) as GameSummaryRow[] } catch { return [] }
  }
}

export interface GameSummaryRow {
  seat: number
  scname: string
  turn: number
  recover: number
  damage: number
  damaged: number
  kill: number
  general: string
  deputy: string
  role: string
  id: number
}

export interface GeneralInfo {
  extension: string
  kingdom: string
}

export interface CardFace {
  name: string
  number: number
  suit: string // "spade" | "heart" | "club" | "diamond" | "nosuit"
  color: string // "red" | "black" | "nocolor"
  type?: number
  subtype?: string // equip subtype: "weapon"/"armor"/"treasure"/"defensive_ride"/"offensive_ride"
  extension?: string // package name — needed to resolve card/equip/trick icon paths
  virt_name?: string
  /** Card marks (CardItem.qml): [{k:"@mark",v:count}], shown below the card art. */
  mark?: { k: string; v: number }[]
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
  shield?: number
  role?: string
  kingdom?: string
  dead?: boolean
  ready?: boolean
  owner?: boolean
  chained?: boolean
  dying?: boolean
  role_shown?: boolean
  /** Whether this client may see the player's role — Self:roleVisible(p). */
  roleVisible?: boolean
  faceup?: boolean
  sealedSlots?: string[]
  equipCids?: number[]
  judgeCids?: number[]
  handcardNum?: number
  marks?: { name: string; value: number }[]
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
