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
// ① built-in card chrome (suit / number / card-back / unknown — overlays drawn on
// top of per-package card art; see PokerCard.qml).
acc(copyImages(path.join(SOURCECODE, 'image', 'card'), path.join(FK_ROOT, 'image', 'card')))
// ② per-package generals + card art (skip anim sprites for now — slice 7)
for (const pkg of ['standard', 'standard_cards', 'maneuvering']) {
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'generals'), path.join(FK_ROOT, 'packages', pkg, 'image', 'generals')))
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'card'), path.join(FK_ROOT, 'packages', pkg, 'image', 'card')))
}

// Also stage the fk prelude (client native surface) next to the manifest so the
// browser can fetch it. Source of truth is the lua-native package.
const PRELUDE_SRC = path.join(WEB, '..', '..', 'packages', 'lua-native', 'lua', 'fkprelude.lua')
fs.copyFileSync(PRELUDE_SRC, path.join(WEB, 'public', 'fk', 'fkprelude.lua'))

// ---- Animation sprites (slice V) + frame-count manifest --------------------
// setEmotion/PixmapAnimation play numbered PNG frames from image/anim/<emotion>/.
// The browser can't list a directory, so we copy the sprite folders AND build an
// anim.json mapping "<emotion>" (built-in) / "<pkg>/<emotion>" → frame count, so
// EmotionSprite knows how many frames to cycle. Built-in dir wins; packages add
// their own (card-use / equipment-skill animations).
function copyAnimDir(srcAnim, destAnim, manifest, keyPrefix) {
  if (!fs.existsSync(srcAnim)) return { dirs: 0, files: 0, bytes: 0 }
  let dirs = 0, files = 0, bytes = 0
  // Copy one sprite folder (PNG frames numbered 0..n-1) → dest, recording its frame
  // count under `key`. Returns whether it was a real sprite (had frames).
  const copyOneSprite = (srcDir, destDir, key) => {
    const frames = fs.readdirSync(srcDir).filter((f) => IMG_EXTS.has(path.extname(f).toLowerCase()))
    if (frames.length === 0) return false
    fs.mkdirSync(destDir, { recursive: true })
    for (const f of frames) {
      const st = fs.statSync(path.join(srcDir, f))
      fs.copyFileSync(path.join(srcDir, f), path.join(destDir, f))
      files++; bytes += st.size
    }
    // Frame count = highest numeric basename + 1 (frames are 0..n-1). Fall back to
    // count if non-numeric. PixmapAnimation loads source/0, source/1, ...
    const nums = frames.map((f) => parseInt(path.basename(f, path.extname(f)), 10)).filter((n) => !Number.isNaN(n))
    manifest[key] = nums.length > 0 ? Math.max(...nums) + 1 : frames.length
    dirs++
    return true
  }
  for (const entry of fs.readdirSync(srcAnim)) {
    const srcDir = path.join(srcAnim, entry)
    if (!fs.statSync(srcDir).isDirectory()) continue
    // Flat sprite (e.g. damage/0.png) — copy directly. Else a NESTED dir of sprites
    // (e.g. skillInvoke/<type>/0.png) — recurse one level, keyed "<entry>/<sub>".
    if (!copyOneSprite(srcDir, path.join(destAnim, entry), keyPrefix + entry)) {
      for (const sub of fs.readdirSync(srcDir)) {
        const subDir = path.join(srcDir, sub)
        if (fs.statSync(subDir).isDirectory()) {
          copyOneSprite(subDir, path.join(destAnim, entry, sub), `${keyPrefix}${entry}/${sub}`)
        }
      }
    }
  }
  return { dirs, files, bytes }
}

const animManifest = {}
let animDirs = 0, animFiles = 0, animBytes = 0
const accAnim = (r) => { animDirs += r.dirs; animFiles += r.files; animBytes += r.bytes }
// built-in image/anim → /fk/image/anim, key = "<emotion>"
accAnim(copyAnimDir(path.join(SOURCECODE, 'image', 'anim'), path.join(FK_ROOT, 'image', 'anim'), animManifest, ''))
// per-package image/anim → /fk/packages/<pkg>/image/anim, key = "<pkg>/<emotion>"
for (const pkg of ['standard', 'standard_cards', 'maneuvering']) {
  accAnim(copyAnimDir(path.join(PACKAGES, pkg, 'image', 'anim'), path.join(FK_ROOT, 'packages', pkg, 'image', 'anim'), animManifest, pkg + '/'))
}
fs.writeFileSync(path.join(FK_ROOT, 'anim.json'), JSON.stringify(animManifest, null, 0))

// ---- Audio (slice V) -------------------------------------------------------
// LogEvent/SkinBank play .mp3 from audio/<type>/ (built-in: system/...) and per-
// package audio/<type>/ (skill/death voices). Mirror the same roots so audio.ts can
// resolve SkinBank.getAudio-style paths; lazily fetched at play time. We copy the
// whole audio tree (system sounds are small; skill/death voices add up but are
// lazy-loaded, never bundled). No frame manifest needed — paths are direct.
function copyAudioTree(srcAudio, destAudio) {
  if (!fs.existsSync(srcAudio)) return { files: 0, bytes: 0 }
  let files = 0, bytes = 0
  const walk = (s, d) => {
    for (const name of fs.readdirSync(s)) {
      const full = path.join(s, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) walk(full, path.join(d, name))
      else if (path.extname(name).toLowerCase() === '.mp3') {
        fs.mkdirSync(d, { recursive: true })
        fs.copyFileSync(full, path.join(d, name))
        files++; bytes += st.size
      }
    }
  }
  walk(srcAudio, destAudio)
  return { files, bytes }
}
let audioFiles = 0, audioBytes = 0
const accAudio = (r) => { audioFiles += r.files; audioBytes += r.bytes }
// built-in audio (system/card/...) → /fk/audio
accAudio(copyAudioTree(path.join(SOURCECODE, 'audio'), path.join(FK_ROOT, 'audio')))
// per-package audio (skill/death voices) → /fk/packages/<pkg>/audio
for (const pkg of ['standard', 'standard_cards', 'maneuvering']) {
  accAudio(copyAudioTree(path.join(PACKAGES, pkg, 'audio'), path.join(FK_ROOT, 'packages', pkg, 'audio')))
}

console.log(`[sync-fk-assets] copied ${relPaths.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) -> public/fk`)
console.log(`[sync-fk-assets] images: ${imgFiles} files (${(imgBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/image + packages/*/image`)
console.log(`[sync-fk-assets] anim: ${animDirs} sprites / ${animFiles} frames (${(animBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/**/image/anim + anim.json`)
console.log(`[sync-fk-assets] audio: ${audioFiles} files (${(audioBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/**/audio`)
console.log(`[sync-fk-assets] manifest: ${path.relative(WEB, MANIFEST)} + fkprelude.lua`)
