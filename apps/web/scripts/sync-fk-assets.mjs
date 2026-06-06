// scripts/sync-fk-assets.mjs — copy freekill-core Lua/JSON into apps/web/public
// and generate a file-list manifest the browser fetches to mount into wasmoon.
//
// Mirrors lua-native's verified mount set (lua/ + the 4 bundled base packs).
// Run via `pnpm sync-assets` before dev/build. Source is read-only upstream.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(__dirname, '..')
const REPO = path.resolve(WEB, '..', '..', '..')
const CORE = path.join(REPO, 'FreeKill-release', 'packages', 'freekill-core')
const DEST = path.join(WEB, 'public', 'fk', 'packages', 'freekill-core')
const MANIFEST = path.join(WEB, 'public', 'fk', 'file-list.json')

const EXTS = new Set(['.lua', '.json', '.txt'])
const MOUNT_DIRS = ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']

function collect(dir) {
  const out = []
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full)
      else if (EXTS.has(path.extname(name))) out.push(full)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out
}

// Clean dest and recopy.
fs.rmSync(DEST, { recursive: true, force: true })
const relPaths = []
let bytes = 0
for (const sub of MOUNT_DIRS) {
  for (const full of collect(path.join(CORE, sub))) {
    const rel = path.relative(CORE, full).split(path.sep).join('/')
    const target = path.join(DEST, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(full, target)
    relPaths.push(rel)
    bytes += fs.statSync(full).size
  }
}

relPaths.sort()
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
fs.writeFileSync(MANIFEST, JSON.stringify({ base: 'freekill-core', files: relPaths }, null, 0))

// Also stage the fk prelude (client native surface) next to the manifest so the
// browser can fetch it. Source of truth is the lua-native package.
const PRELUDE_SRC = path.join(WEB, '..', '..', 'packages', 'lua-native', 'lua', 'fkprelude.lua')
fs.copyFileSync(PRELUDE_SRC, path.join(WEB, 'public', 'fk', 'fkprelude.lua'))

console.log(`[sync-fk-assets] copied ${relPaths.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) -> public/fk`)
console.log(`[sync-fk-assets] manifest: ${path.relative(WEB, MANIFEST)} + fkprelude.lua`)
