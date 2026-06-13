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
const EXTENSION_PACKS = ['utility', 'standard_ex', 'sp', 'shzl']
const ready = fs.existsSync(CORE) && fs.existsSync(PRELUDE)
const extensionReady = ready && EXTENSION_PACKS.every((pkg) => fs.existsSync(path.join(packageSource(pkg), 'init.lua')))

function packageSource(pkg: string): string {
  const mirror = path.join(WEB, 'packages-upstream', pkg)
  return fs.existsSync(path.join(mirror, 'init.lua'))
    ? mirror
    : path.join(REPO, 'FreeKill-release', 'packages', pkg)
}

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

function mountTree(factory: LuaFactory, luaModule: Awaited<ReturnType<LuaFactory['getLuaModule']>>, src: string, vfsBase: string) {
  for (const full of collect(src)) {
    const rel = path.relative(src, full).replace(/\\/g, '/')
    if (rel.startsWith('image/') || rel.startsWith('audio/')) continue
    factory.mountFileSync(luaModule, `${vfsBase}/${rel}`, fs.readFileSync(full))
  }
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

  it.skipIf(!extensionReady)('loads enabled extension packs including shzl into the lobby catalog VM', async () => {
    const factory = new LuaFactory()
    const luaModule = await factory.getLuaModule()
    const FS = luaModule.module.FS
    for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
      mountTree(factory, luaModule, path.join(CORE, sub), `${VFS_CORE}/${sub}`)
    }
    for (const pkg of EXTENSION_PACKS) {
      mountTree(factory, luaModule, packageSource(pkg), `/fk/packages/${pkg}`)
    }

    const lua = await factory.createEngine({ injectObjects: true })
    FS.chdir(VFS_CORE)
    await bootClient({
      lua: lua as never,
      natives: createNatives({ emfs: FS as never, onNotifyUI: () => {}, log: () => {} }),
      preludeLua: fs.readFileSync(PRELUDE, 'utf8'),
    })

    const catalog = await installCatalogBridge(lua as never)
    expect(catalog.allModNames()).toContain('shzl')
    expect(catalog.generalPacks()).toEqual(expect.arrayContaining(['wind', 'fire', 'forest', 'mountain', 'shadow', 'thunder', 'shzl_god']))
    expect(catalog.generals('wind')).toContain('xiahouyuan')
    expect(catalog.searchGeneralNames('wind', '夏侯')).toContain('xiahouyuan')
    expect(catalog.generalData('xiahouyuan')).toMatchObject({ package: 'wind', extension: 'shzl', kingdom: 'wei' })
    expect(catalog.translate(['shzl', 'wind', 'xiahouyuan', 'shensu'])).toMatchObject({
      shzl: '神话再临',
      wind: '神话再临·风',
      xiahouyuan: '夏侯渊',
      shensu: '神速',
    })

    lua.global.close()
  }, 45_000)
})
