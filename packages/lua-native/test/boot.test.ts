// boot.test.ts — R-NATIVE / Gate 1-2 as a formal test.
//
// Mounts the REAL freekill-core base tree into wasmoon, injects this package's
// native surface, runs bootClient, and asserts the engine loaded packages and
// built the ClientInstance. This is the spike's Gate 1-2 turned into a regression
// test: if the native shim or prelude regresses, this fails.
//
// Reads freekill-core from the upstream read-only release tree (../../../.. from
// this package = repo root, then FreeKill-release/packages/freekill-core).

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient } from '../src/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// packages/lua-native/test -> repo root is four levels up (../../../..).
const REPO = path.resolve(__dirname, '..', '..', '..', '..')
const CORE = path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
const PRELUDE = path.join(__dirname, '..', 'lua', 'fkprelude.lua')

const VFS_CORE = '/fk/packages/freekill-core'
const MOUNT_EXTS = new Set(['.lua', '.json', '.txt'])

function collectFiles(dir: string, exts: Set<string>): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full)
      else if (exts.has(path.extname(name))) out.push(full)
    }
  }
  walk(dir)
  return out
}

const coreAvailable = fs.existsSync(CORE)

describe('lua-native bootClient', () => {
  it.skipIf(!coreAvailable)(
    'boots the engine and builds ClientInstance against real freekill-core',
    async () => {
      const factory = new LuaFactory()
      const luaModule = await factory.getLuaModule()
      const FS = luaModule.module.FS

      // Mount lua/ + the bundled base packages.
      for (const sub of ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']) {
        const base = path.join(CORE, sub)
        if (!fs.existsSync(base)) continue
        for (const full of collectFiles(base, MOUNT_EXTS)) {
          const rel = path.relative(CORE, full).replace(/\\/g, '/')
          factory.mountFileSync(luaModule, `${VFS_CORE}/${rel}`, fs.readFileSync(full))
        }
      }

      const notifyFeed: Array<{ command: string; data: unknown }> = []
      const natives = createNatives({
        emfs: FS as unknown as Parameters<typeof createNatives>[0]['emfs'],
        onNotifyUI: (e) => notifyFeed.push(e),
        log: () => {},
      })

      const lua = await factory.createEngine({ injectObjects: true })
      FS.chdir(VFS_CORE)

      const preludeLua = fs.readFileSync(PRELUDE, 'utf8')
      const result = await bootClient({ lua: lua as never, natives, preludeLua })

      expect(result.clientCreated).toBe(true)
      expect(result.engine.packages).toBeGreaterThanOrEqual(4)
      expect(result.engine.generals).toBeGreaterThan(0)
      expect(result.engine.cards).toBeGreaterThan(0)
      expect(result.engine.skills).toBeGreaterThan(0)

      lua.global.close()
    },
    30_000,
  )

  it('exports the native surface and prelude paths', async () => {
    const mod = await import('../src/index.js')
    expect(typeof mod.createNatives).toBe('function')
    expect(typeof mod.bootClient).toBe('function')
    expect(mod.PRELUDE_LUA_PATH).toContain('fkprelude.lua')
  })
})
