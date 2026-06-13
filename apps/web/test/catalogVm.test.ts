import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient } from '@freekill-web/lua-native'
import { installCatalogBridge } from '../src/vm/catalogBridge.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(__dirname, '..', '..', '..')
const REPO = path.resolve(WEB, '..')
const MIRROR_CORE = path.join(WEB, 'packages-upstream', 'freekill-core')
const CORE = fs.existsSync(MIRROR_CORE)
  ? MIRROR_CORE
  : path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
const PRELUDE = path.join(WEB, 'packages', 'lua-native', 'lua', 'fkprelude.lua')

const VFS_CORE = '/fk/packages/freekill-core'
const EXTS = new Set(['.lua', '.json', '.txt'])
const ready = fs.existsSync(CORE) && fs.existsSync(PRELUDE)

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

describe('catalog VM bridge', () => {
  it.skipIf(!ready)('reads lobby catalog metadata from the real FreeKill Lua VM', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      for (const full of collect(path.join(CORE, sub))) {
        const rel = path.relative(CORE, full).replace(/\\/g, '/')
        factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
      }
    }
    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({
      lua: lua as never,
      natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }),
      preludeLua: fs.readFileSync(PRELUDE, 'utf8'),
    })

    const catalog = await installCatalogBridge(lua as never)
    const packs = catalog.generalPacks()
    expect(packs).toContain('standard')
    expect(catalog.allModNames().length).toBeGreaterThan(0)
    expect(catalog.allMods().standard).toContain('standard')

    const standardGenerals = catalog.generals('standard')
    expect(standardGenerals).toContain('caocao')
    expect(catalog.searchGeneralNames('standard', '曹')).toContain('caocao')
    expect(catalog.searchAllGeneralNames('刘')).toContain('liubei')

    const caocao = catalog.generalData('caocao')
    expect(caocao?.package).toBe('standard')
    expect(caocao?.extension).toBeTruthy()
    expect(caocao?.kingdom).toBe('wei')

    const detail = catalog.generalDetail('caocao')
    expect(detail.skill.length).toBeGreaterThan(0)
    expect(detail.skill.some((s) => s.displayName === '奸雄')).toBe(true)
    expect(catalog.translate(['caocao']).caocao).toBe('曹操')

    const items = catalog.generalListItems(['caocao', 'liubei'])
    expect(items.map((g) => g.name)).toEqual(['caocao', 'liubei'])
    expect(items[0]?.kingdom).toBe('wei')

    lua.global.close()
  }, 30_000)
})
