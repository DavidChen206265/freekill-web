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
const VFS = '/fk/packages/freekill-core'
const EXTS = new Set(['.lua', '.json', '.txt'])
function collect(d: string): string[] {
  const o: string[] = []
  const w = (x: string) => {
    for (const n of fs.readdirSync(x)) {
      const f = path.join(x, n)
      fs.statSync(f).isDirectory() ? w(f) : EXTS.has(path.extname(n)) && o.push(f)
    }
  }
  if (fs.existsSync(d)) w(d)
  return o
}
describe('notifyUI sanitize: dense object graph', () => {
  it('does not blow up on a dense player<->room DAG; keeps scalar card lists', async () => {
    const factory = new LuaFactory()
    const lm = await factory.getLuaModule()
    const FS = lm.module.FS
    for (const s of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const f of collect(path.join(CORE, s))) {
        factory.mountFileSync(lm, `${VFS}/${path.relative(CORE, f).replace(/\\/g, '/')}`, fs.readFileSync(f))
      }
    }
    const feed: Array<{ command: string; data: unknown }> = []
    const natives = createNatives({ emfs: FS as never, onNotifyUI: (e) => feed.push(e), log: () => {} })
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS)
    await bootClient({ lua: lua as never, natives, preludeLua: fs.readFileSync(PRELUDE, 'utf8') })
    // Dense graph: 6 players, each references room, room references all players,
    // every player references every other (the shape that exploded exponentially).
    await lua.doString(`
      local room = { name = "r", players = {} }
      local ps = {}
      for i = 1, 6 do ps[i] = { id = i, room = room, peers = {} } end
      for i = 1, 6 do
        room.players[i] = ps[i]
        for j = 1, 6 do ps[i].peers[j] = ps[j] end -- cross-links + self
      end
      -- A 五谷-style payload: card_data carries real scalar id lists the client reads,
      -- plus extra_data.players = the cyclic objects (json.encode would throw).
      local data = {
        card_data = { { "AG", { 23, 126, 90, 7, 12 } } }, -- [name, [cids]]
        extra_data = { players = ps, room = room },
        _prompt = "#AskForGuanxing",
      }
      ClientInstance:notifyUI("AskForCardChosen", data)
    `)
    const ev = feed.find((e) => e.command === 'AskForCardChosen')
    expect(ev).toBeTruthy()
    // Must be decoded (not "{}" or "table: 0x...") and keep the scalar id list intact.
    expect(typeof ev!.data).toBe('object')
    const obj = ev!.data as { card_data?: [string, number[]][] }
    expect(obj.card_data?.[0]?.[0]).toBe('AG')
    expect(obj.card_data?.[0]?.[1]).toEqual([23, 126, 90, 7, 12]) // ids NOT truncated
    lua.global.close()
  }, 30000)
})
