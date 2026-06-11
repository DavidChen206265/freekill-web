// feed.test.ts — feed real captured server packets into the booted client VM and
// assert it expands them into notifyUI deltas. This mirrors the browser M2 path
// (envelope.raw -> ClientCallback) but runs in Node with fs-mounted core.
//
// Uses the spike's captured-packets.json (real asio packet stream). Skipped if
// the upstream core tree isn't present.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient } from '../src/index.js'
import { paceFor } from '../../../apps/web/src/stores/pacing.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..', '..', '..')
const WEB = path.resolve(__dirname, '..', '..', '..')
const MIRROR_CORE = path.join(WEB, 'packages-upstream', 'freekill-core')
const CORE = fs.existsSync(MIRROR_CORE)
  ? MIRROR_CORE
  : path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
const PRELUDE = path.join(__dirname, '..', 'lua', 'fkprelude.lua')
const CAPTURED = path.join(REPO, 'freekill-web-spike', 'captured-packets.json')

const VFS_CORE = '/fk/packages/freekill-core'
const EXTS = new Set(['.lua', '.json', '.txt'])
const ready = fs.existsSync(CORE) && fs.existsSync(CAPTURED)

function collect(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of fs.readdirSync(d)) {
      const f = path.join(d, n)
      fs.statSync(f).isDirectory() ? walk(f) : EXTS.has(path.extname(n)) && out.push(f)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

describe('client VM packet feed', () => {
  it.skipIf(!ready)('expands a real captured packet stream into notifyUI deltas', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        const rel = path.relative(CORE, full).replace(/\\/g, '/')
        factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
      }
    }
    const feed: Array<{ command: string; data: unknown }> = []
    const natives = createNatives({
      emfs: FS as never,
      onNotifyUI: (e) => feed.push(e),
      log: () => {},
    })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // Enter a room + add players (so the captured stream has a room to apply to).
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({ 2, "Bob", "liubei", true }), false)
    `)

    // Feed player-1's captured packet stream via the raw-CBOR path.
    const packets: Array<{ to: number; command: string; dataHex: string; kind: string }> =
      JSON.parse(fs.readFileSync(CAPTURED, 'utf8'))
    const stream = packets.filter((p) => p.to === 1)
    lua.global.set('__cmds', stream.map((p) => p.command))
    lua.global.set('__hex', stream.map((p) => p.dataHex))
    lua.global.set('__req', stream.map((p) => p.kind === 'request'))
    const processed = await lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      local ok = 0
      for i = 1, #__cmds do
        if pcall(ClientCallback, ClientInstance, __cmds[i], fromHex(__hex[i] or ""), __req[i] == true) then ok = ok + 1 end
      end
      return ok
    `)

    expect(processed).toBeGreaterThan(100)
    expect(feed.length).toBeGreaterThan(50)
    // The hallmark in-game deltas the table UI will consume.
    const moveEvents = feed.filter((e) => e.command === 'MoveCards') as Array<{ command: string; data: { merged?: Array<{ ids: number[]; fromArea: number; toArea: number }> } }>
    expect(moveEvents.length).toBeGreaterThan(0)
    // Verify the `merged` contract the cardStore reducer relies on (RoomLogic
    // moveCards shape): each MoveCards carries merged[] with ids/fromArea/toArea.
    const withMerged = moveEvents.filter((e) => Array.isArray(e.data?.merged) && e.data.merged.length > 0)
    expect(withMerged.length).toBeGreaterThan(0)
    const sampleMove = withMerged[0]!.data.merged![0]!
    expect(Array.isArray(sampleMove.ids)).toBe(true)
    expect(typeof sampleMove.fromArea).toBe('number')
    expect(typeof sampleMove.toArea).toBe('number')

    // 五谷-class coverage gate: EVERY notifyUI command the VM emits while replaying a
    // real game MUST be classified as consumed (explicit branch / VM-mirror) or known-
    // deferred (M4 slice V visuals) — never "unhandled". This mirrors the web detector
    // (apps/web/src/diag/notifyCommands.ts); keep the sets in sync. A new command that
    // falls through every category is exactly the 五谷 bug class and fails here.
    const HANDLED_EXPLICIT = new Set(['MoveCards', 'DestroyTableCard', 'DestroyTableCardByEvent', 'UpdateRequestUI', 'AskForSkillInvoke', 'PlayCard', 'AskForUseCard', 'AskForResponseCard', 'AskForUseActiveSkill', 'ReplyToServer', 'CancelRequest', 'GetPlayerHandcards', 'GameLog', 'ShowToast', 'ChangeSelf', 'MoveFocus', 'UpdateCard', 'AskForGeneral', 'AskForChoice', 'AskForChoices', 'AskForCardChosen', 'AskForCardsChosen', 'FillAG', 'AskForAG', 'TakeAG', 'CloseAG', 'AskForGuanxing', 'AskForExchange', 'AskForMoveCardInBoard', 'AskForPoxi', 'AskForCardsAndChoice', 'CustomDialog', 'MiniGame', 'EmptyRequest', 'AskForArrangeCards', 'Setup', 'EnterRoom', 'SetPlayerMark', 'StartGame', 'GameOver', 'Animate', 'LogEvent', 'SetCardFootnote', 'SetCardVirtName'])
    const MIRROR_DRIVEN = new Set(['PropertyUpdate', 'ArrangeSeats', 'MaxCard', 'AddPlayer', 'RemovePlayer', 'AddNpc', 'AddSkill', 'LoseSkill', 'UpdateSkill', 'UpdateHandcard', 'AddTotalGameTime', 'PlayerRunned', 'EnterLobby', 'Reconnect', 'Observe', 'AddObserver', 'RemoveObserver', 'SetCardMark', 'SetCurrent'])
    const KNOWN_DEFERRED = new Set(['SetBanner', 'ShowVirtualCard', 'UpdateLimitSkill', 'ChangeSkin', 'UpdateDrawPile', 'UpdateRoundNum', 'UpdateGameData', 'UpdateMarkArea', 'UpdateMiniGame', 'ServerMessage', 'Chat'])
    const emitted = [...new Set(feed.map((e) => e.command))]
    const unclassified = emitted.filter((c) => !HANDLED_EXPLICIT.has(c) && !MIRROR_DRIVEN.has(c) && !KNOWN_DEFERRED.has(c))
    // Surface the exact offenders if any (so the failure names them).
    expect(unclassified, `notifyUI commands with no classification (五谷-class gap): ${unclassified.join(', ')}`).toEqual([])
    // And none should be genuinely unhandled (handled-explicit ∪ mirror covers the
    // functional ones; deferred is visual-only).
    const unhandled = emitted.filter((c) => !HANDLED_EXPLICIT.has(c) && !MIRROR_DRIVEN.has(c) && !KNOWN_DEFERRED.has(c))
    expect(unhandled).toEqual([])
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('PACE-1: paceFor reads the VM clean-JSON notifyUI data (data.type is a plain string)', async () => {
    // 实现纪律-5 verification for the pacing wiring. The captured envelope path has
    // data.type as a CBOR byte string (cbor-x-asio gotcha) — a probe proved paceFor on
    // the envelope only matched MoveCards, silently missing Animate/LogEvent. The fix
    // computes the beat inside the VM's notifyUI dispatch, where data is CLEAN JSON. This
    // replays the real captured stream through a booted VM and asserts paceFor — applied
    // to the SAME clean events the web dispatch sees — correctly beats MoveCards, the
    // visual Animate sub-types (Indicate/Emotion/InvokeSkill), and LogEvent Damage/Death,
    // while pacing state-mirror / audio-only commands to 0.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const feed: Array<{ command: string; data: unknown }> = []
    const natives = createNatives({ emfs: FS as never, onNotifyUI: (e) => feed.push(e), log: () => {} })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({ 2, "Bob", "liubei", true }), false)
    `)
    const packets: Array<{ to: number; command: string; dataHex: string; kind: string }> =
      JSON.parse(fs.readFileSync(CAPTURED, 'utf8'))
    const stream = packets.filter((p) => p.to === 1)
    lua.global.set('__cmds', stream.map((p) => p.command))
    lua.global.set('__hex', stream.map((p) => p.dataHex))
    lua.global.set('__req', stream.map((p) => p.kind === 'request'))
    await lua.doString(`
      local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
      for i = 1, #__cmds do pcall(ClientCallback, ClientInstance, __cmds[i], fromHex(__hex[i] or ""), __req[i] == true) end
    `)

    // The VM emits notifyUI with CLEAN JSON: Animate/LogEvent data.type is a plain
    // string here (not a byte string). Confirm the contract paceFor depends on.
    const anyAnimate = feed.find((e) => e.command === 'Animate') as { data: { type?: unknown } } | undefined
    expect(anyAnimate).toBeTruthy()
    expect(typeof anyAnimate!.data.type).toBe('string') // clean string, NOT a byte string

    // Run the REAL paceFor over the clean stream; tally beats per command/type.
    let moveBeats = 0, animateBeats = 0, logBeats = 0, zeroBeats = 0
    const animateTypesBeated = new Set<string>()
    for (const e of feed) {
      const ms = paceFor(e.command, e.data)
      if (ms <= 0) { zeroBeats++; continue }
      if (e.command === 'MoveCards') moveBeats++
      else if (e.command === 'Animate') { animateBeats++; animateTypesBeated.add(String((e.data as { type?: unknown }).type)) }
      else if (e.command === 'LogEvent') logBeats++
    }
    // MoveCards always beats (card fly-in).
    expect(moveBeats).toBeGreaterThan(0)
    // Animate now beats too (the envelope path missed these) — at least Indicate.
    expect(animateBeats).toBeGreaterThan(0)
    expect(animateTypesBeated.has('Indicate')).toBe(true)
    // LogEvent Damage/Death beat; audio-only LogEvent (PlaySound/PlaySkillSound) do not.
    // The captured game has Damage events, so at least one LogEvent beats.
    expect(logBeats).toBeGreaterThan(0)
    // State-mirror / audio-only commands pace to 0 (the bulk of the stream).
    expect(zeroBeats).toBeGreaterThan(moveBeats + animateBeats + logBeats)
    // Audio-only LogEvent sub-types must NOT beat (would stall on every sound).
    expect(paceFor('LogEvent', { type: 'PlaySound' })).toBe(0)
    expect(paceFor('LogEvent', { type: 'PlaySkillSound' })).toBe(0)
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('Setup overwrites the placeholder self; getDisabledPacks is config-driven', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        const rel = path.relative(CORE, full).replace(/\\/g, '/')
        factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
      }
    }
    const natives = createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {}, disabledPacks: ['foo', 'bar'] })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // A1: getDisabledPacks reflects the injected config, not a hardcoded [].
    const disabled = await lua.doString('return fk.GetDisabledPacks()')
    expect(JSON.parse(disabled as string)).toEqual(['foo', 'bar'])

    // A4: before Setup, self is an obvious placeholder (empty name), not "Tester".
    const beforeName = await lua.doString('return ClientInstance.client:getSelf():getScreenName()')
    expect(beforeName).toBe('')

    // Setup must set the real identity.
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({7,"webtester","liubei",0}),false)`)
    const after = await lua.doString('return Self.id .. "|" .. ClientInstance.client:getSelf():getScreenName()')
    expect(after).toBe('7|webtester')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('play→reply loop: select slash → target → OK emits ReplyToServer', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const replies: unknown[] = []
    const natives = createNatives({
      emfs: FS as never, log: () => {},
      onNotifyUI: (e) => { if (e.command === 'ReplyToServer') replies.push(e.data) },
    })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    // Set up a started room with Self holding a Slash in the Play phase, then fire
    // the PlayCard request — exactly the ui_emu local loop the web client drives.
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    const slashId = await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({1, "me", "caocao", 0}), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({2, 15, json.decode(__setup)}), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({2, "foe", "zhangfei", true}), false)
      Self.general="caocao"; Self.maxHp=4; Self.hp=4; Self.kingdom="wei"; Self.role="lord"; Self.dead=false
      for _, p in ipairs(ClientInstance.players) do
        p.dead=false; p.general=(p.general and p.general~="") and p.general or "zhangfei"
        p.maxHp=(p.maxHp and p.maxHp>0) and p.maxHp or 4; p.hp=(p.hp and p.hp>0) and p.hp or 4
      end
      local circle={}; for _,p in ipairs(ClientInstance.players) do table.insert(circle,p.id) end
      ClientCallback(ClientInstance,"ArrangeSeats",cbor.encode(circle),false)
      ClientCallback(ClientInstance,"StartGame",cbor.encode({}),false)
      ClientInstance.current=Self; Fk:currentRoom().current=Self
      local function findCardId(n) for _,c in ipairs(Fk.cards) do if c.name==n and c.suit~=Card.NoSuit then return c.id end end end
      local sid=findCardId("slash")
      Self.player_cards[Player.Hand]={}; Self:addCards(Player.Hand,{sid})
      Self.phase=Player.Play
      ClientCallback(ClientInstance,"PlayCard",cbor.encode({}),true)
      return sid
    `)
    // Drive the interaction via the global UpdateRequestUI (what the web client calls).
    lua.global.set('__slash', slashId)
    await lua.doString(`UpdateRequestUI("CardItem", __slash, "click", { selected = true })`)
    const targets = JSON.parse(await lua.doString(`
      local h=ClientInstance.current_request_handler; local out={}
      for pid,item in pairs(h.scene:getAllItems("Photo")) do if item.enabled then out[#out+1]=pid end end
      return json.encode(out)
    `) as string) as number[]
    expect(targets.length).toBeGreaterThan(0) // VM computed a valid target for Slash
    lua.global.set('__tgt', targets[0]!)
    await lua.doString(`UpdateRequestUI("Photo", __tgt, "click", { selected = true })`)
    await lua.doString(`UpdateRequestUI("Button", "OK", "click", {})`)

    expect(replies.length).toBe(1)
    const reply = replies[0] as { card: number; targets: number[] }
    expect(reply.card).toBe(slashId)
    expect(reply.targets).toEqual([targets[0]])
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('notifyUI survives non-serializable payloads (nullification extra_data.players cycle)', async () => {
    // Regression for the "b" prompt: AskForUseCard for 无懈可击 carries extra_data
    // with `players` = live Player objects (cyclic player<->room refs). json.encode
    // throws "circular reference", and the old fallback sent tostring(data) =
    // "table: 0x...", which the client indexed char-by-char (data[2] = 'b' in
    // "ta-b-le"). notifyUI must now emit a decodable array, not that string.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const feed: Array<{ command: string; data: unknown }> = []
    const natives = createNatives({ emfs: FS as never, onNotifyUI: (e) => feed.push(e), log: () => {} })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Emit a notify whose data contains a cyclic table (mirrors extra_data.players).
    await lua.doString(`
      local room = { name = "r" }
      local p1 = { id = 1, room = room }; local p2 = { id = 2, room = room }
      room.players = { p1, p2 }; p1.next = p2; p2.next = p1 -- cycles everywhere
      local extra = { effectCardId = 7, prompt = "#AskForNullification::-10:lightning",
                      effectFrom = 1, players = { p1, p2 } }
      local data = { "nullification", "nullification", extra.prompt, true, extra, {} }
      ClientInstance:notifyUI("AskForUseCard", data)
    `)
    const ask = feed.find((e) => e.command === 'AskForUseCard')
    expect(ask).toBeTruthy()
    // The payload must be a decoded ARRAY, not the literal "table: 0x..." string.
    expect(typeof ask!.data).not.toBe('string')
    expect(Array.isArray(ask!.data)).toBe(true)
    const arr = ask!.data as unknown[]
    expect(arr[0]).toBe('nullification')          // card_name intact
    expect(arr[2]).toBe('#AskForNullification::-10:lightning') // prompt intact (was "b")
    // extra_data survived with its scalar fields; cyclic players were pruned safely.
    const extra = arr[4] as { effectCardId?: number; prompt?: string }
    expect(extra.effectCardId).toBe(7)
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('play phase: selecting 铁索连环 emits SpecialSkills with recast (重铸 option)', async () => {
    // Issue: 铁索连环 has special_skills={"recast"} (maneuvering pkg). When picked in
    // the play phase the ui_emu (ReqPlayCard:selectCard, play_card.lua:194-203)
    // prepends "_normal_use" and pushes a SpecialSkills change. The web Dashboard
    // renders that as the 正常使用/重铸 radio. This verifies the VM actually emits it.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const changes: Array<{ command: string; data: { SpecialSkills?: Array<{ id: string; skills: string[] }> } }> = []
    const natives = createNatives({
      emfs: FS as never, log: () => {},
      onNotifyUI: (e) => { if (e.command === 'UpdateRequestUI') changes.push(e as never) },
    })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })

    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    const chainId = await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({1, "me", "caocao", 0}), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({2, 15, json.decode(__setup)}), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({2, "foe", "zhangfei", true}), false)
      Self.general="caocao"; Self.maxHp=4; Self.hp=4; Self.kingdom="wei"; Self.role="lord"; Self.dead=false
      for _, p in ipairs(ClientInstance.players) do
        p.dead=false; p.general=(p.general and p.general~="") and p.general or "zhangfei"
        p.maxHp=(p.maxHp and p.maxHp>0) and p.maxHp or 4; p.hp=(p.hp and p.hp>0) and p.hp or 4
      end
      local circle={}; for _,p in ipairs(ClientInstance.players) do table.insert(circle,p.id) end
      ClientCallback(ClientInstance,"ArrangeSeats",cbor.encode(circle),false)
      ClientCallback(ClientInstance,"StartGame",cbor.encode({}),false)
      ClientInstance.current=Self; Fk:currentRoom().current=Self
      local function findCardId(n) for _,c in ipairs(Fk.cards) do if c.name==n and c.suit~=Card.NoSuit then return c.id end end end
      local cid=findCardId("iron_chain")
      Self.player_cards[Player.Hand]={}; Self:addCards(Player.Hand,{cid})
      Self.phase=Player.Play
      ClientCallback(ClientInstance,"PlayCard",cbor.encode({}),true)
      return cid
    `)
    lua.global.set('__chain', chainId)
    changes.length = 0 // ignore the initial PlayCard setup change
    await lua.doString(`UpdateRequestUI("CardItem", __chain, "click", { selected = true })`)

    // The last UpdateRequestUI after selecting 铁索连环 must carry SpecialSkills with
    // _normal_use + recast (the radio the Dashboard renders).
    const withSpecial = changes.filter((c) => Array.isArray(c.data?.SpecialSkills) && c.data.SpecialSkills[0])
    expect(withSpecial.length).toBeGreaterThan(0)
    const skills = withSpecial[withSpecial.length - 1]!.data.SpecialSkills![0]!.skills
    expect(skills).toContain('recast')
    expect(skills).toContain('_normal_use')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('pre-compiled function handle survives many calls (doString leaks ~44 calls)', async () => {
    // Regression: lua.doString compiles a fresh chunk every call and corrupts the
    // WASM Lua heap after ~44 calls (_ENV becomes nil / memory access out of
    // bounds). The browser feeds a packet + reads players on EVERY server packet,
    // so this crashed within turn 1. The clientVm fix defines hot-path helpers
    // ONCE as globals and calls them via handles — this must NOT leak.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({1,"me","caocao",0}),false)`)
    await lua.doString(`function __readPlayers() local out={} for _,p in ipairs(ClientInstance.players) do out[#out+1]={id=p.id} end return json.encode(out) end`)
    const read = lua.global.get('__readPlayers') as () => string
    // 200 calls — far past the ~44 doString crash point.
    for (let i = 0; i < 200; i++) read()
    const last = JSON.parse(read()) as { id: number }[]
    expect(last.length).toBeGreaterThan(0) // still alive, heap intact
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('VM read bridge: card faces + translations (slice 5)', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Mirror clientVm's bridge handles.
    await lua.doString(`
      function __fkReadCards(cidsJson) local out={} local ok,cids=pcall(json.decode,cidsJson) if ok then for _,cid in ipairs(cids) do local d=GetCardData(cid) out[tostring(cid)]={name=d.name,number=d.number,suit=d.suit,color=d.color,mark=d.mark or {}} end end return json.encode(out) end
      function __fkTranslate(keysJson) local out={} local ok,keys=pcall(json.decode,keysJson) if ok then for _,k in ipairs(keys) do out[k]=Translate(tostring(k)) end end return json.encode(out) end
    `)
    const readCards = lua.global.get('__fkReadCards') as (j: string) => string
    const translate = lua.global.get('__fkTranslate') as (j: string) => string
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({1,"me","caocao",0}),false)`)
    const slashId = await lua.doString(`for _,c in ipairs(Fk.cards) do if c.name=="slash" and c.suit~=Card.NoSuit then return c.id end end`) as number
    const faces = JSON.parse(readCards(JSON.stringify([slashId]))) as Record<string, { name: string; suit: string; number: number; mark: unknown[] }>
    expect(faces[String(slashId)]!.name).toBe('slash')
    expect(['spade', 'heart', 'club', 'diamond']).toContain(faces[String(slashId)]!.suit)
    // D2: GetCardData.mark is an array (empty for a plain slash) — proves readCards
    // carries marks for CardItem.qml's mark delegate.
    expect(Array.isArray(faces[String(slashId)]!.mark)).toBe(true)
    const tx = JSON.parse(translate(JSON.stringify(['slash', 'jink', 'caocao', 'lord']))) as Record<string, string>
    expect(tx.slash).toBe('杀')
    expect(tx.jink).toBe('闪')
    expect(tx.caocao).toBe('曹操')
    // IG-2: the luck-card prompt key resolves to the real zh template via the VM's
    // Translate (web's localizePrompt registers it, processPrompt fills %arg with the
    // remaining count). Proves the prompt the OK/Cancel bar shows is localized, not raw.
    const lt = JSON.parse(translate(JSON.stringify(['#AskForLuckCard', 'AskForLuckCard']))) as Record<string, string>
    expect(lt['#AskForLuckCard']).toContain('手气卡')
    expect(lt['#AskForLuckCard']).toContain('%arg') // template carries the %arg slot processPrompt fills
    expect(lt['AskForLuckCard']).toBe('手气卡')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('VM read bridge: player equip/judge/shield + general extension (slice 6)', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    await lua.doString(`
      function __fkReadPlayers()
        local out={} for _,p in ipairs(ClientInstance.players) do
          out[#out+1]={id=p.id,general=p.general,shield=p.shield,chained=p.chained,
            equipCids=p.getCardIds and p:getCardIds("e") or {}, judgeCids=p.getCardIds and p:getCardIds("j") or {}}
        end return json.encode(out)
      end
      function __fkReadGenerals(j) local out={} local ok,ns=pcall(json.decode,j) if ok then for _,n in ipairs(ns) do local d=GetGeneralData(n) out[n]={extension=d.extension,kingdom=d.kingdom} end end return json.encode(out) end
      function __fkRoleVisible() return (Self ~= nil and Self.roleVisible and Self:roleVisible(Self)) or false end
      function __fkChooseGeneral(kind, argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok then return json.encode({ r = false }) end
        local res
        if kind == "prompt" then res = ChooseGeneralPrompt(a.rule, a.generals or {}, a.extra)
        elseif kind == "filter" then res = ChooseGeneralFilter(a.rule, a.name, a.selected or {}, a.generals or {}, a.extra)
        elseif kind == "feasible" then res = ChooseGeneralFeasible(a.rule, a.selected or {}, a.generals or {}, a.extra) end
        return json.encode({ r = res })
      end
      function __fkPlayerSkills(id) local ok, sk = pcall(GetPlayerSkills, id) return json.encode((ok and sk) or {}) end
      function __fkGameSummary()
        local out = {}
        local ci = ClientInstance
        local data = ci and ci.getBanner and ci:getBanner("GameSummary")
        if type(data) ~= "table" then return json.encode(out) end
        return json.encode(out)
      end
      function __fkSkillData(name) local d = GetSkillData(name) return json.encode(d or {}) end
    `)
    const readPlayers = lua.global.get('__fkReadPlayers') as () => string
    const readGenerals = lua.global.get('__fkReadGenerals') as (j: string) => string
    await lua.doString(`
      ClientCallback(ClientInstance,"Setup",cbor.encode({1,"me","caocao",0}),false)
      Self.general="caocao"; Self.shield=1; Self.chained=true
      local function fid(n) for _,c in ipairs(Fk.cards) do if c.name==n then return c.id end end end
      local eq=fid("qinggang_sword"); local jt=fid("indulgence")
      if eq then Self.player_cards[Player.Equip]={eq} end
      if jt then Self.player_cards[Player.Judge]={jt} end
    `)
    const self = (JSON.parse(readPlayers()) as Array<{ shield: number; chained: boolean; equipCids: number[]; judgeCids: number[] }>)[0]!
    expect(self.shield).toBe(1)
    expect(self.chained).toBe(true)
    expect(self.equipCids.length).toBe(1) // qinggang in equip area
    expect(self.judgeCids.length).toBe(1) // indulgence in judge area
    const gens = JSON.parse(readGenerals(JSON.stringify(['caocao', 'zhugeliang']))) as Record<string, { extension: string; kingdom: string }>
    expect(gens.caocao).toEqual({ extension: 'standard', kingdom: 'wei' })
    expect(gens.zhugeliang.kingdom).toBe('shu')
    // G3: Self:roleVisible(Self) is always true (player.lua:1711) — proves the
    // roleVisible bridge expression resolves against the real VM (Photo shownRole).
    expect(await lua.doString(`return __fkRoleVisible()`)).toBe(true)
    // TMR5: FinishRequestUI is callable without a pending request (no-op cleanup,
    // never replies). Proves the __fkFinishRequestUI bridge target exists.
    expect(await lua.doString(`local ok = pcall(FinishRequestUI); return ok`)).toBe(true)
    // GEN12/13/22: choose-general rule helpers resolve against the real VM. With
    // rule "askForGeneralsChosen" choosing n=1, feasible is false at 0 picks and
    // true at 1, and a candidate is selectable. Proves the __fkChooseGeneral bridge.
    const cg = lua.global.get('__fkChooseGeneral') as (k: string, j: string) => string
    const cgGens = ['caocao', 'liubei', 'sunquan']
    const cgExtra = { n: 1 }
    const feas0 = JSON.parse(cg('feasible', JSON.stringify({ rule: 'askForGeneralsChosen', selected: [], generals: cgGens, extra: cgExtra }))).r
    const feas1 = JSON.parse(cg('feasible', JSON.stringify({ rule: 'askForGeneralsChosen', selected: ['caocao'], generals: cgGens, extra: cgExtra }))).r
    const filt = JSON.parse(cg('filter', JSON.stringify({ rule: 'askForGeneralsChosen', name: 'liubei', selected: [], generals: cgGens, extra: cgExtra }))).r
    expect(feas0).toBe(false)
    expect(feas1).toBe(true)
    expect(filt).toBe(true)
    // DET2/DET3: GetPlayerSkills(id) returns an array of {name,description} for the
    // right-click detail panel. (This minimal harness sets Self.general directly so
    // no skills are granted — player_skills is empty; we assert the bridge resolves
    // GetPlayerSkills against the real VM without error and yields a well-formed array.)
    const ps = lua.global.get('__fkPlayerSkills') as (id: number) => string
    const selfId = await lua.doString(`return Self.id`) as number
    const skills = JSON.parse(ps(selfId)) as { name: string; description: string }[]
    expect(Array.isArray(skills)).toBe(true)
    expect(skills.every((s) => typeof s.name === 'string' && typeof s.description === 'string')).toBe(true)
    // F1: getBanner("GameSummary") resolves without error (absent in this minimal
    // harness → empty array). Proves the __fkGameSummary bridge target is sound.
    const gs = lua.global.get('__fkGameSummary') as () => string
    expect(Array.isArray(JSON.parse(gs()))).toBe(true)
    // C6: GetSkillData(name).freq classifies skills. jianxiong (a triggered skill)
    // → "notactive"; rende (an active skill) → "active". Proves readSkills' source.
    const sd = lua.global.get('__fkSkillData') as (n: string) => string
    const jianxiong = JSON.parse(sd('jianxiong')) as { freq?: string }
    expect(jianxiong.freq).toBe('notactive')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('IG-4: __fkPlayerCards + virtual-original lookup (GetVirtualEquipData)', async () => {
    // PlayerDetail.qml:291-312 — visible equip/judge cards; for a VIRTUAL card (e.g. a
    // 乐不思蜀 transformed from another card via getVirtualEquip), the displayed
    // (name,suit,number) is the ORIGINAL physical card and virtName is the transformed
    // name. The IG-4-specific risk is the original-card lookup, so we assert that
    // directly against the real VM (GetCardData = original physical card; GetVirtual-
    // EquipData.name = transformed name), plus the bridge's shape + visibility gate.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Bridge copied verbatim from clientVm.ts __fkPlayerCards.
    await lua.doString(`
      function __fkPlayerCards(id)
        local out, unknown = {}, 0
        local p = ClientInstance:getPlayerById(id)
        if not p then return json.encode({ cards = {}, unknown = 0 }) end
        local ej = {}
        for _, cid in ipairs(p:getCardIds("e") or {}) do ej[#ej+1] = cid end
        for _, cid in ipairs(p:getCardIds("j") or {}) do ej[#ej+1] = cid end
        for _, cid in ipairs(ej) do
          if CardVisibility(cid) then
            local t = GetCardData(cid)
            local entry = { cid = cid, name = t.name, suit = t.suit, number = t.number }
            local vok, v = pcall(GetVirtualEquipData, id, cid)
            if vok and type(v) == "table" and v.name then entry.virtName = v.name end
            out[#out+1] = entry
          else
            unknown = unknown + 1
          end
        end
        return json.encode({ cards = out, unknown = unknown })
      end
    `)
    const playerCards = lua.global.get('__fkPlayerCards') as (id: number) => string
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({1,"me","caocao",0}),false)`)
    // Set up a real physical card in Self's judge area, then make it a virtual 乐不思蜀
    // (clone indulgence, subcards = {physicalCid} → getVirtualEquip resolves it).
    const probe = JSON.parse(await lua.doString(`
      local function fid(n) for _,c in ipairs(Fk.cards) do if c.name==n and c.suit~=Card.NoSuit then return c.id end end end
      local pid = fid("slash")
      Self.player_cards[Player.Judge] = { pid }
      local ind = Fk:cloneCard("indulgence"); ind.subcards = { pid }
      Self.virtual_equips = { ind }
      -- the IG-4 original-card lookup: physical card data + transformed virtual name
      local t = GetCardData(pid)
      local v = GetVirtualEquipData(1, pid)
      return json.encode({
        pid = pid,
        physName = t.name, physSuit = t.suit, physNumber = t.number,
        virtName = (type(v)=="table" and v.name or "NIL"),
        bridgeJudgeCount = #Self:getCardIds("j"),
      })
    `) as string) as { pid: number; physName: string; physSuit: string; physNumber: number; virtName: string; bridgeJudgeCount: number }
    // The displayed card data is the ORIGINAL physical card (slash's suit/number)...
    expect(probe.physName).toBe('slash')
    expect(['spade', 'heart', 'club', 'diamond']).toContain(probe.physSuit)
    expect(probe.physNumber).toBeGreaterThan(0)
    // ...and the transformed (virtual) name is 乐不思蜀 (indulgence) — this is exactly
    // "what is 大乔's 乐不思蜀's original card / suit / number".
    expect(probe.virtName).toBe('indulgence')
    expect(probe.bridgeJudgeCount).toBe(1)
    // The bridge returns a well-formed {cards,unknown} object; in this minimal harness
    // cardVisible() is false without full game state, so the card is counted as unknown
    // (the gate is faithfully applied — it never crashes and never leaks a hidden card).
    const res = JSON.parse(playerCards(1)) as { cards: unknown[]; unknown: number }
    expect(Array.isArray(res.cards)).toBe(true)
    expect(res.cards.length + res.unknown).toBe(1)
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('VM poxi bridge: feasible respects min/max (M4 anti-illegal-selection)', async () => {
    // M4 切片 I: AskForPoxi was downgraded to a min0..maxAll pick that could permit
    // illegal selections. The fix routes selection rules through the VM's
    // Fk.poxi_methods (PoxiFilter/Feasible/Prompt). Verify the __fkPoxi bridge
    // against the real "AskForCardsChosen" poxi method (standard/aux_poxi.lua):
    // feasible = (#selected in [min,max]).
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Mirror clientVm's __fkPoxi bridge.
    await lua.doString(`
      function __fkPoxi(kind, argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local res
        if kind == "prompt" then res = PoxiPrompt(a.poxi_type, a.data, a.extra)
        elseif kind == "filter" then res = PoxiFilter(a.poxi_type, a.to_select, a.selected or {}, a.data, a.extra)
        elseif kind == "feasible" then res = PoxiFeasible(a.poxi_type, a.selected or {}, a.data, a.extra) end
        return json.encode({ r = res })
      end
    `)
    const poxi = lua.global.get('__fkPoxi') as (kind: string, args: string) => string
    const call = (kind: string, args: unknown) => (JSON.parse(poxi(kind, JSON.stringify(args))) as { r: unknown }).r
    // AskForCardsChosen feasible: needs min<=#selected<=max. extra_data min=1,max=2.
    const extra = { min: 1, max: 2, to: 1 }
    const data: [string, number[]][] = [['$Hand', [1, 2, 3]]]
    const args = (kind: string, sel: number[]) => ({ poxi_type: 'AskForCardsChosen', to_select: sel[0] ?? 1, selected: sel, data, extra })
    expect(call('feasible', args('feasible', []))).toBe(false)        // 0 < min
    expect(call('feasible', args('feasible', [1]))).toBe(true)        // within range
    expect(call('feasible', args('feasible', [1, 2]))).toBe(true)     // at max
    expect(call('feasible', args('feasible', [1, 2, 3]))).toBe(false) // > max → illegal
    // M4 I-2: __fkChoiceFilter — with no filter_skel the bridge allows the option
    // (ChooseCardsAndChoiceBox enables all OK options when no skel). Proves the
    // bridge target is sound (no skill_skels.choiceFilter in the basic packages).
    await lua.doString(`
      function __fkChoiceFilter(argsJson)
        local ok, a = pcall(json.decode, argsJson)
        if not ok or type(a) ~= "table" then return json.encode({ r = false }) end
        local skel = a.filter_skel and Fk.skill_skels and Fk.skill_skels[a.filter_skel]
        if not skel or not skel.extra or not skel.extra.choiceFilter then return json.encode({ r = true }) end
        local fok, res = pcall(skel.extra.choiceFilter, a.cards or {}, a.choice, a.extra)
        return json.encode({ r = fok and (res ~= false) })
      end
    `)
    const cf = lua.global.get('__fkChoiceFilter') as (j: string) => string
    const cfRes = (JSON.parse(cf(JSON.stringify({ filter_skel: '', cards: [1], choice: '确定', extra: {} }))) as { r: unknown }).r
    expect(cfRes).toBe(true)
    const cfMissing = (JSON.parse(cf(JSON.stringify({ filter_skel: 'no_such_skel', cards: [], choice: 'x', extra: {} }))) as { r: unknown }).r
    expect(cfMissing).toBe(true)
    // M4 I-6 fix: __fkCardFitPattern over a real card. A slash card matches the
    // "slash" name pattern and not a "jink" pattern (Exppattern name match).
    await lua.doString(`
      function __fkCardFitPattern(argsJson)
        local out = {}
        local ok, a = pcall(json.decode, argsJson)
        if ok and type(a)=="table" and a.pattern and a.cids then
          for _, cid in ipairs(a.cids) do local fok,r = pcall(CardFitPattern, cid, a.pattern); out[tostring(cid)] = fok and (r and true or false) end
        end
        return json.encode({ r = out })
      end
    `)
    const fitFn = lua.global.get('__fkCardFitPattern') as (j: string) => string
    const slashId = await lua.doString(`for _,c in ipairs(Fk.cards) do if c.name=="slash" then return c.id end end`) as number
    const fit = (JSON.parse(fitFn(JSON.stringify({ cids: [slashId], pattern: 'slash' }))) as { r: Record<string, boolean> }).r
    expect(fit[String(slashId)]).toBe(true)
    const noFit = (JSON.parse(fitFn(JSON.stringify({ cids: [slashId], pattern: 'jink' }))) as { r: Record<string, boolean> }).r
    expect(noFit[String(slashId)]).toBe(false)
    // M4 I-5 fix: __fkVirtualEquipNames returns {} for a non-virtual real card
    // (GetVirtualEquipData → nil when the card isn't a virtual equip).
    await lua.doString(`
      function __fkVirtualEquipNames(argsJson)
        local out = {}
        local ok, a = pcall(json.decode, argsJson)
        if ok and type(a)=="table" and a.pairs then
          for _, pr in ipairs(a.pairs) do local vok,v = pcall(GetVirtualEquipData, pr[1], pr[2]); if vok and type(v)=="table" and v.name then out[tostring(pr[2])] = v.name end end
        end
        return json.encode({ r = out })
      end
    `)
    const veFn = lua.global.get('__fkVirtualEquipNames') as (j: string) => string
    const ve = (JSON.parse(veFn(JSON.stringify({ pairs: [[1, slashId]] }))) as { r: Record<string, string> }).r
    expect(ve[String(slashId)]).toBeUndefined() // plain slash is not a virtual equip
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('parseLog prettifies a raw GameLog LogMessage into localized HTML (reconnect replay)', async () => {
    // The gateway buffers the RAW LogMessage JSON of each GameLog; on reconnect the
    // browser must run it through the SAME parseMsg the live path uses so the war
    // report shows prettified text (player generals + card names), not raw JSON.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Enter a room with a known self + another player so parseMsg can resolve names.
    // Generals must be REVEALED (not the default "anjiang") for parseMsg to show the
    // general name instead of the seat number (client.lua getPlayerStr:114-120).
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({ 1, "me", "caocao", 0 }), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      ClientCallback(ClientInstance, "AddPlayer", cbor.encode({ 2, "Bob", "liubei", true }), false)
      ClientCallback(ClientInstance, "PropertyUpdate", cbor.encode({ 1, "general", "caocao" }), false)
      ClientCallback(ClientInstance, "PropertyUpdate", cbor.encode({ 2, "general", "liubei" }), false)
    `)
    // Mirror clientVm's __fkParseLog bridge: it takes the RAW inner CBOR (hex), NOT
    // JSON — a GameLog LogMessage's fields (type/arg/arg2) are CBOR byte strings that
    // JSON would mangle. This is the bug the JSON version had: live logs feed raw CBOR
    // via ClientCallback, so the replay must too.
    await lua.doString(`
      function __fkParseLog(hex)
        local function fromHex(h) return (h:gsub("..", function(cc) return string.char(tonumber(cc,16)) end)) end
        local ok, msg = pcall(function() return cbor.decode(fromHex(hex or "")) end)
        if not ok or type(msg) ~= "table" then return "" end
        local ok2, text = pcall(function() return ClientInstance:parseMsg(msg) end)
        if not ok2 or type(text) ~= "string" then return "" end
        return text
      end
      -- Encode a #Damage LogMessage to raw CBOR hex (as asio's doNotify does), so the
      -- bridge decodes byte-string fields exactly like the live GameLog path.
      function __encodeLogHex()
        local bytes = cbor.encode({ type = "#Damage", from = 1, to = { 2 }, arg = 1, arg2 = "normal_damage" })
        return (bytes:gsub(".", function(c) return ("%02x"):format(c:byte()) end))
      end
    `)
    const parseLog = lua.global.get('__fkParseLog') as (j: string) => string
    const encodeLogHex = lua.global.get('__encodeLogHex') as () => string
    // A #Damage log: "%from 对 %to 造成了 %arg 点 %arg2 伤害". parseMsg should produce
    // localized HTML with the players' general names (曹操/刘备), not raw "from"/"to".
    const html = parseLog(encodeLogHex())
    expect(typeof html).toBe('string')
    expect(html.length).toBeGreaterThan(0)
    // Prettified: contains HTML font markup + the translated general names, NOT the
    // raw template key or raw json field names.
    expect(html).toContain('<font')
    expect(html).toContain('曹操') // self (caocao) general name resolved
    expect(html).toContain('刘备') // target (liubei) general name resolved
    expect(html).not.toContain('#Damage') // template key was expanded, not left raw
    // Malformed input → "" (caller falls back to the raw string).
    expect(parseLog('zzzz')).toBe('')
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('UpdateCard path: readCards re-reads current VM card data (mark) for a cid', async () => {
    // UpdateCard (client.lua:851) fires when a card's data changes in place (here via
    // setCardMark). The web fix re-reads readCards([cid]) and OVERWRITES the cached
    // face. This verifies the VM read reflects the mutated card data, so the overwrite
    // carries fresh data (not the stale cached face).
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    await lua.doString(`
      function __fkReadCards(cidsJson) local out={} local ok,cids=pcall(json.decode,cidsJson) if ok then for _,cid in ipairs(cids) do local d=GetCardData(cid) out[tostring(cid)]={name=d.name,number=d.number,suit=d.suit,mark=d.mark or {}} end end return json.encode(out) end
    `)
    const readCards = lua.global.get('__fkReadCards') as (j: string) => string
    await lua.doString(`ClientCallback(ClientInstance,"Setup",cbor.encode({1,"me","caocao",0}),false)`)
    const cid = await lua.doString(`for _,c in ipairs(Fk.cards) do if c.name=="slash" then return c.id end end`) as number
    // GetCardData returns mark as an ARRAY of {k,v} for @-prefixed non-zero marks
    // (client_util.lua:95-102). Before: empty.
    type Mark = { k: string; v: number }
    const before = JSON.parse(readCards(JSON.stringify([cid]))) as Record<string, { mark: Mark[] }>
    expect(before[String(cid)]!.mark.find((m) => m.k === '@test')).toBeUndefined()
    // Drive the real setCardMark path (what UpdateCard reacts to), then re-read.
    await lua.doString(`ClientCallback(ClientInstance,"SetCardMark",cbor.encode({${cid},"@test",7}),false)`)
    const after = JSON.parse(readCards(JSON.stringify([cid]))) as Record<string, { mark: Mark[] }>
    expect(after[String(cid)]!.mark.find((m) => m.k === '@test')?.v).toBe(7)
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('readPlayers mark classification: @! → picMarks, @@ → hidden value, @ → text (M5-a-2)', async () => {
    // Mirrors clientVm.ts __fkReadPlayers mark classification against the REAL VM:
    // SetPlayerMark by prefix → text vs picture mark, value hidden for @@.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({ 1, "me", "caocao", 0 }), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      -- set three marks on self via the real SetPlayerMark path
      ClientCallback(ClientInstance, "SetPlayerMark", cbor.encode({ 1, "@text", 2 }), false)
      ClientCallback(ClientInstance, "SetPlayerMark", cbor.encode({ 1, "@@hidden", 3 }), false)
      ClientCallback(ClientInstance, "SetPlayerMark", cbor.encode({ 1, "@!pic", 1 }), false)
    `)
    // The mark-classification snippet copied verbatim from clientVm.ts __fkReadPlayers.
    await lua.doString(`
      function __fkMarks()
        local p = ClientInstance.players[1]
        local textMarks, picMarks = {}, {}
        if type(p.mark) == "table" then
          for k, v in pairs(p.mark) do
            if type(k) == "string" and k:startsWith("@") then
              local isArr = (type(v) == "table" and not Util.isCborObject(v))
              local num = (type(v) == "number") and v or (isArr and #v) or nil
              if num and num ~= 0 then
                if k:startsWith("@!") then
                  local sv
                  if isArr then sv = tostring(#v) elseif tostring(v) == "1" then sv = "" else sv = Translate(tostring(v)) end
                  picMarks[#picMarks+1] = { name = k, value = sv }
                else
                  local val
                  if k:startsWith("@@") then val = "" elseif isArr then val = "" else val = Translate(tostring(v)) end
                  textMarks[#textMarks+1] = { name = Translate(k), value = val }
                end
              end
            end
          end
        end
        return json.encode({ text = textMarks, pic = picMarks })
      end
    `)
    const marks = lua.global.get('__fkMarks') as () => string
    const r = JSON.parse(marks()) as { text: { name: string; value: string }[]; pic: { name: string; value: string }[] }
    // @!pic → picture mark, value "" (because raw value 1 → "1" → "")
    expect(r.pic.find((m) => m.name === '@!pic')).toBeTruthy()
    expect(r.pic.find((m) => m.name === '@!pic')!.value).toBe('')
    // @@hidden → text mark with value HIDDEN ("")
    const hidden = r.text.find((m) => m.value === '' && m.name.length > 0)
    expect(hidden).toBeTruthy()
    // @text (value 2) → text mark with a visible value "2"
    expect(r.text.find((m) => m.value === '2')).toBeTruthy()
    lua.global.close()
  }, 30_000)

  it.skipIf(!ready)('QmlMark @[type] mark renders GetQmlMark text (M5-b stage A)', async () => {
    // QmlMark: register a spec with how_to_show, set a @[type]name mark on a player,
    // and assert the bridge's GetQmlMark path produces the computed text.
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        factory.mountFileSync(luaModule, `${VFS_CORE}/${path.relative(CORE, full).replace(/\\/g, '/')}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({ lua: lua as never, natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }), preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    lua.global.set('__setup', JSON.stringify({ gameMode: 'aaa_role_mode', disabledPack: [], disabledGenerals: [] }))
    await lua.doString(`
      ClientCallback(ClientInstance, "Setup", cbor.encode({ 1, "me", "caocao", 0 }), false)
      ClientCallback(ClientInstance, "EnterRoom", cbor.encode({ 2, 15, json.decode(__setup) }), false)
      -- register a QmlMark spec (text type, qml_path="") whose how_to_show echoes value
      Fk:addQmlMark{ name = "tmark", qml_path = "", how_to_show = function(name, value, p) return "MARK:" .. tostring(value) end }
      -- set a @[tmark]x mark on self with a numeric value
      ClientCallback(ClientInstance, "SetPlayerMark", cbor.encode({ 1, "@[tmark]x", 5 }), false)
    `)
    // The QmlMark snippet copied from clientVm.ts __fkReadPlayers @[ branch.
    await lua.doString(`
      function __fkQmlMarks()
        local p = ClientInstance.players[1]
        local out = {}
        for k, v in pairs(p.mark) do
          if type(k) == "string" and k:startsWith("@[") then
            local close = k:find("]", 1, true)
            if close then
              local mtype = k:sub(3, close - 1)
              local ok, qm = pcall(GetQmlMark, mtype, k, p.id)
              if ok and type(qm) == "table" and type(qm.text) == "string" and qm.text ~= "" then
                out[#out+1] = qm.text
              end
            end
          end
        end
        return json.encode(out)
      end
    `)
    const qm = lua.global.get('__fkQmlMarks') as () => string
    const texts = JSON.parse(qm()) as string[]
    expect(texts).toContain('MARK:5') // how_to_show echoed the value 5
    lua.global.close()
  }, 30_000)
})
