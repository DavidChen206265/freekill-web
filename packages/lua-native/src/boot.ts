// boot.ts — the verified client-VM boot sequence, distilled from the spike.
//
// Encapsulates spike Gates 1-2: run the fk prelude, boot freekill.lua (loads the
// engine + packages), load client.lua, and create the ClientInstance state
// mirror. The caller supplies the wasmoon engine (already created with the
// mounted freekill-core tree + injected __natives) and the prelude Lua source —
// boot.ts stays FS/transport-agnostic so it runs identically in node and browser.

/** Minimal slice of a wasmoon engine this module drives. */
export interface LuaEngineLike {
  doString(code: string): Promise<unknown>
  global: { set(name: string, value: unknown): void }
}

export interface BootClientOptions {
  /** wasmoon engine, created with the mounted core tree and cwd at packages/freekill-core. */
  lua: LuaEngineLike
  /** The leaf natives table to inject as `__natives` (from createNatives). */
  natives: unknown
  /** Source of lua/fkprelude.lua (read by the host: fs in node, fetch in browser). */
  preludeLua: string
}

export interface BootClientResult {
  /** Engine content counts after boot (proves packages loaded). */
  engine: { generals: number; cards: number; skills: number; packages: number; modes: number }
  /** True once CreateLuaClient built the ClientInstance state mirror. */
  clientCreated: boolean
}

/**
 * Boot the client-side FreeKill Lua VM. Caller must have already:
 *   1. mounted freekill-core (lua/ + base packs + any extension packs) into the FS,
 *   2. created `lua` with injectObjects, and chdir'd the FS to packages/freekill-core.
 *
 * This runs the prelude (builds `fk` as a real Lua table from __natives), boots
 * the engine, then creates the ClientInstance — exactly the spike's Gate 1-2 path.
 */
export async function bootClient({ lua, natives, preludeLua }: BootClientOptions): Promise<BootClientResult> {
  lua.global.set('__natives', natives)

  // Build `fk`, FileIO-backing natives, and the cpp_client as REAL Lua tables.
  await lua.doString(preludeLua)

  // Gate 1: boot the engine (loads packages, fills generals/cards/skills).
  await lua.doString(`assert(loadfile("lua/freekill.lua"))()`)

  // Gate 2: create the client state mirror.
  await lua.doString(`dofile("lua/client/client.lua")`)
  await lua.doString(`CreateLuaClient(__cpp_client)`)

  const engine = (await lua.doString(`
    local function count(t) local n = 0 for _ in pairs(t or {}) do n = n + 1 end return n end
    return {
      generals = count(Fk.generals),
      cards = #Fk.cards,
      skills = count(Fk.skills),
      packages = #Fk.extension_names,
      modes = count(Fk.game_modes),
    }
  `)) as BootClientResult['engine']

  const clientCreated = (await lua.doString(`return ClientInstance ~= nil`)) as boolean

  return { engine, clientCreated }
}
