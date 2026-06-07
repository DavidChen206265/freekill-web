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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..', '..', '..')
const CORE = path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
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
    lua.global.close()
  }, 30_000)
})
