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
const PACKAGES = path.join(REPO, 'FreeKill-release', 'packages')
const SOURCECODE = path.join(REPO, 'FreeKill-sourcecode')
const DEST = path.join(WEB, 'public', 'fk', 'packages', 'freekill-core')
const FK_ROOT = path.join(WEB, 'public', 'fk')
const MANIFEST = path.join(WEB, 'public', 'fk', 'file-list.json')

const EXTS = new Set(['.lua', '.json', '.txt'])
const MOUNT_DIRS = ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']
const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

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
// Also clear previously-synced image trees so removed assets don't linger.
fs.rmSync(path.join(FK_ROOT, 'image'), { recursive: true, force: true })
for (const pkg of ['standard', 'standard_cards', 'maneuvering']) {
  fs.rmSync(path.join(FK_ROOT, 'packages', pkg, 'image'), { recursive: true, force: true })
}
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

// ---- Image assets (slice 6) ----------------------------------------------
// These are NOT in the VM mount manifest — the browser loads them via <img> on
// demand (lazy). We mirror two roots so skin.ts can resolve SkinBank-style paths:
//   ① built-in chrome  FreeKill-sourcecode/image/photo/  -> public/fk/image/photo/
//   ② per-package art   packages/<pkg>/image/{generals,card}/
//                        -> public/fk/packages/<pkg>/image/...
function copyImages(srcDir, destDir) {
  let n = 0, b = 0
  const walk = (s, d) => {
    if (!fs.existsSync(s)) return
    for (const name of fs.readdirSync(s)) {
      const full = path.join(s, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full, path.join(d, name))
      else if (IMG_EXTS.has(path.extname(name).toLowerCase())) {
        fs.mkdirSync(d, { recursive: true })
        fs.copyFileSync(full, path.join(d, name))
        n++; b += st.size
      }
    }
  }
  walk(srcDir, destDir)
  return { n, b }
}

let imgFiles = 0, imgBytes = 0
const acc = (r) => { imgFiles += r.n; imgBytes += r.b }
// ① built-in photo chrome (magatama / role / back / death / chain / state / ...)
acc(copyImages(path.join(SOURCECODE, 'image', 'photo'), path.join(FK_ROOT, 'image', 'photo')))
// ② per-package generals + card art (skip anim sprites for now — slice 7)
for (const pkg of ['standard', 'standard_cards', 'maneuvering']) {
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'generals'), path.join(FK_ROOT, 'packages', pkg, 'image', 'generals')))
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'card'), path.join(FK_ROOT, 'packages', pkg, 'image', 'card')))
}

// Also stage the fk prelude (client native surface) next to the manifest so the
// browser can fetch it. Source of truth is the lua-native package.
const PRELUDE_SRC = path.join(WEB, '..', '..', 'packages', 'lua-native', 'lua', 'fkprelude.lua')
fs.copyFileSync(PRELUDE_SRC, path.join(WEB, 'public', 'fk', 'fkprelude.lua'))

console.log(`[sync-fk-assets] copied ${relPaths.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) -> public/fk`)
console.log(`[sync-fk-assets] images: ${imgFiles} files (${(imgBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/image + packages/*/image`)
console.log(`[sync-fk-assets] manifest: ${path.relative(WEB, MANIFEST)} + fkprelude.lua`)
