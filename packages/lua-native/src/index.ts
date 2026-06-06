// @freekill-web/lua-native — client-side fk.* native surface + boot sequence.
//
// The web client ships the ORIGINAL freekill-core client Lua in a wasmoon VM
// plus this thin native shim. Verified complete against the full 30-package set
// (R-NATIVE audit): the only fk.* symbol the client path reads as nil is the
// legacy fk.CreateTriggerSkill, used solely by new-core-incompatible old packs.

export { createNatives } from './natives.js'
export type { Natives, NativesOptions, EmscriptenFS } from './natives.js'

export { bootClient } from './boot.js'
export type { BootClientOptions, BootClientResult, LuaEngineLike } from './boot.js'

export { mountFromFetch, VFS_PACKAGES } from './mount.js'
export type { LuaFactoryLike, FileListManifest } from './mount.js'

/** Path (within this package) to the client fk prelude Lua source. */
export const PRELUDE_LUA_PATH = 'lua/fkprelude.lua'
/** Path (within this package) to the server-side fk prelude Lua source. */
export const SERVER_PRELUDE_LUA_PATH = 'lua/server_fkprelude.lua'
