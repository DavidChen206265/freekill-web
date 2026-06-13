import { LuaFactory } from 'wasmoon'
import { createNatives, bootClient, mountFromFetch, type FileListManifest } from '@freekill-web/lua-native'
import glueWasmUrl from 'wasmoon/dist/glue.wasm?url'
import { installCatalogBridge, type CatalogBridge, type CatalogGeneralData, type CatalogGeneralDetail, type CatalogGeneralListItem } from './catalogBridge.js'
import type { ClientVmStats } from './clientVm.js'

const FK_BASE_URL = '/fk/packages/freekill-core'
const FILE_LIST_URL = '/fk/file-list.json'
const PRELUDE_URL = '/fk/fkprelude.lua'
const VFS_CORE = '/fk/packages/freekill-core'

export class CatalogVm {
  private lua: Awaited<ReturnType<LuaFactory['createEngine']>> | null = null
  private bridge: CatalogBridge | null = null

  async boot(): Promise<ClientVmStats> {
    const factory = new LuaFactory(glueWasmUrl)
    const luaModule = await factory.getLuaModule()
    const FS = (luaModule as { module: { FS: EmFS } }).module.FS

    const manifest = (await fetchJson(FILE_LIST_URL)) as FileListManifest
    const mount = await mountFromFetch(factory, luaModule, FK_BASE_URL, manifest)
    const natives = createNatives({
      emfs: FS as unknown as Parameters<typeof createNatives>[0]['emfs'],
      onNotifyUI: () => {},
      log: () => {},
    })
    const lua = await factory.createEngine({ injectObjects: true })
    this.lua = lua
    FS.chdir(VFS_CORE)

    const preludeLua = await fetchText(PRELUDE_URL)
    const tb = performance.now()
    const res = await bootClient({ lua: lua as never, natives, preludeLua })
    const bootMs = Math.round(performance.now() - tb)
    this.bridge = await installCatalogBridge(lua as never)

    return {
      mountFiles: mount.files,
      mountMs: mount.ms,
      bootMs,
      engine: res.engine,
    }
  }

  close(): void {
    this.lua?.global.close()
    this.lua = null
    this.bridge = null
  }

  translate(keys: string[]): Record<string, string> {
    return this.requireBridge().translate(keys)
  }

  allMods(): Record<string, string[]> {
    return this.requireBridge().allMods()
  }

  allModNames(): string[] {
    return this.requireBridge().allModNames()
  }

  generalPacks(): string[] {
    return this.requireBridge().generalPacks()
  }

  generals(pack: string): string[] {
    return this.requireBridge().generals(pack)
  }

  searchGeneralNames(word: string, pack = ''): string[] {
    const bridge = this.requireBridge()
    return pack ? bridge.searchGeneralNames(pack, word) : bridge.searchAllGeneralNames(word)
  }

  generalData(name: string): CatalogGeneralData | null {
    return this.requireBridge().generalData(name)
  }

  generalDetail(name: string): CatalogGeneralDetail {
    return this.requireBridge().generalDetail(name)
  }

  generalListItems(names: string[]): CatalogGeneralListItem[] {
    return this.requireBridge().generalListItems(names)
  }

  searchGenerals(word: string, pack = ''): CatalogGeneralListItem[] {
    return this.generalListItems(this.searchGeneralNames(word, pack))
  }

  private requireBridge(): CatalogBridge {
    if (!this.bridge) throw new Error('Catalog VM not booted')
    return this.bridge
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  return res.json()
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  return res.text()
}

interface EmFS {
  chdir(path: string): void
}
