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
// Extension packs are mirrored into freekill-web/packages-upstream/ (gitignored;
// structure preserved via .gitkeep, see packages-upstream/README.md). Prefer that
// in-repo copy so the project is self-contained; fall back to the upstream
// FreeKill-release/packages tree when the mirror isn't populated (e.g. fresh clone
// before pulling packs). Override with FK_PACKAGES_DIR.
const UPSTREAM_MIRROR = path.resolve(WEB, '..', '..', 'packages-upstream')
const RELEASE_PACKAGES = path.join(REPO, 'FreeKill-release', 'packages')
const PACKAGES = process.env.FK_PACKAGES_DIR
  ? path.resolve(process.env.FK_PACKAGES_DIR)
  : (fs.existsSync(path.join(UPSTREAM_MIRROR, 'freekill-core')) ? UPSTREAM_MIRROR : RELEASE_PACKAGES)
const CORE = path.join(PACKAGES, 'freekill-core')
const SOURCECODE = path.join(REPO, 'FreeKill-sourcecode')
const DEST = path.join(WEB, 'public', 'fk', 'packages', 'freekill-core')
const FK_ROOT = path.join(WEB, 'public', 'fk')
const MANIFEST = path.join(WEB, 'public', 'fk', 'file-list.json')
console.log(`[sync] packages source: ${PACKAGES}`)


const EXTS = new Set(['.lua', '.json', '.txt'])
const MOUNT_DIRS = ['lua', 'standard', 'standard_cards', 'maneuvering', 'test']
const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp'])
// Extension packs to ship (must match the asio server's ENABLED pack set, or the
// handshake MD5 won't match — recompute FK_MD5 with packages/assets/compute-md5.mjs).
// Their lua is mounted into the VM VFS; their image/anim/audio synced for the browser.
// Most depend on `utility` (shared skills/qml). To add a pack: add it here, put it in
// asio's packages/ (enabled in packages.db), and recompute FK_MD5.
const EXTENSION_PACKS = ['utility', 'standard_ex', 'sp']
// Packs whose per-package art/anim/audio the browser loads (core art packs + the
// extension packs that carry their own image/audio).
const ART_PACKS = ['standard', 'standard_cards', 'maneuvering', ...EXTENSION_PACKS]

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
for (const pkg of ART_PACKS) {
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

// ---- Extension packs: mount their lua/json into the VFS (manifest.extra) ---------
// Each pack's code tree (excluding image/audio, which load lazily as static assets)
// is copied to public/fk/packages/<pkg>/ and listed under manifest.extra so the VM
// mounts it at /fk/packages/<pkg>/. MUST match asio's enabled pack set (handshake MD5).
const extra = []
for (const pkg of EXTENSION_PACKS) {
  const srcDir = path.join(PACKAGES, pkg)
  if (!fs.existsSync(srcDir)) { console.warn(`  [extension] missing pack: ${pkg}`); continue }
  const destDir = path.join(FK_ROOT, 'packages', pkg)
  // clear stale code (keep image/ — handled by the art loop below)
  for (const sub of ['lua', 'pkg', 'i18n', 'aux_skills', 'aux_events', 'qml']) {
    fs.rmSync(path.join(destDir, sub), { recursive: true, force: true })
  }
  const files = []
  for (const full of collect(srcDir)) {
    const ext = path.extname(full).toLowerCase()
    if (!EXTS.has(ext)) continue // only code/json/txt; image+audio load lazily
    const rel = path.relative(srcDir, full).split(path.sep).join('/')
    if (rel.startsWith('image/') || rel.startsWith('audio/')) continue
    const target = path.join(destDir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(full, target)
    files.push(rel)
    bytes += fs.statSync(full).size
  }
  files.sort()
  extra.push({ base: pkg, files })
  console.log(`  [extension] ${pkg}: ${files.length} code files`)
}

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
fs.writeFileSync(MANIFEST, JSON.stringify({ base: 'freekill-core', files: relPaths, extra }, null, 0))

// ---- Image assets (slice 6) ----------------------------------------------
// These are NOT in the VM mount manifest — the browser loads them via <img> on
// demand (lazy). We mirror two roots so skin.ts can resolve SkinBank-style paths:
//   ① built-in chrome  FreeKill-sourcecode/image/photo/  -> public/fk/image/photo/
//   ② per-package art   packages/<pkg>/image/{generals,card}/
//                        -> public/fk/packages/<pkg>/image/...
// We also record every per-package card-art path into images.json (the set the
// client uses to resolve which package actually has a card/equip PNG, instead of
// probing each package over <img> and eating a 404 per miss — that floods the
// browser console on the server deploy, same class as the audio 404 storm).
const imageManifest = [] // paths relative to FK_ROOT, e.g. "packages/standard_cards/image/card/peach.png"
function copyImages(srcDir, destDir, record = false) {
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
        if (record) imageManifest.push(path.relative(FK_ROOT, path.join(d, name)).split(path.sep).join('/'))
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
// Game-table background image (W1-1 2e). Single top-level file, not a tree.
{
  const bgSrc = path.join(SOURCECODE, 'image', 'gamebg.jpg')
  if (fs.existsSync(bgSrc)) {
    fs.mkdirSync(FK_ROOT, { recursive: true })
    fs.copyFileSync(bgSrc, path.join(FK_ROOT, 'image', 'gamebg.jpg'))
  }
}
// ② per-package generals + card art (skip anim sprites for now — slice 7)
for (const pkg of ART_PACKS) {
  // record=true for BOTH generals and card art: the client candidate-probes general
  // portraits across packages too (skin.ts generalPicCandidates), and a general that
  // ships only in an extension pack (e.g. re__xusheng → sp) 404s on the default packs
  // and floods the console + drops the portrait. Manifesting general-art paths lets
  // the client resolve the one real package with a single GET, same as card art.
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'generals'), path.join(FK_ROOT, 'packages', pkg, 'image', 'generals'), true))
  acc(copyImages(path.join(PACKAGES, pkg, 'image', 'card'), path.join(FK_ROOT, 'packages', pkg, 'image', 'card'), true))
}
// images.json: the set of per-package general + card art paths that exist under /fk,
// so the client picks the one real package candidate (no <img> 404 probing).
fs.writeFileSync(path.join(FK_ROOT, 'images.json'), JSON.stringify(imageManifest.sort(), null, 0))

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
for (const pkg of ART_PACKS) {
  accAnim(copyAnimDir(path.join(PACKAGES, pkg, 'image', 'anim'), path.join(FK_ROOT, 'packages', pkg, 'image', 'anim'), animManifest, pkg + '/'))
}
fs.writeFileSync(path.join(FK_ROOT, 'anim.json'), JSON.stringify(animManifest, null, 0))

// ---- Audio (slice V) -------------------------------------------------------
// LogEvent/SkinBank play .mp3 from audio/<type>/ (built-in: system/...) and per-
// package audio/<type>/ (skill/death voices). Mirror the same roots so audio.ts can
// resolve SkinBank.getAudio-style paths; lazily fetched at play time. We copy the
// whole audio tree (system sounds are small; skill/death voices add up but are
// lazy-loaded, never bundled). We ALSO record every copied path into audio.json so
// the client can resolve which candidate exists WITHOUT firing 404 HEAD probes (the
// candidate-probe approach floods the console with 404s on the server deploy).
const audioManifest = [] // paths relative to FK_ROOT, e.g. "audio/skill/yingzi1.mp3"
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
        audioManifest.push(path.relative(FK_ROOT, path.join(d, name)).split(path.sep).join('/'))
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
for (const pkg of ART_PACKS) {
  accAudio(copyAudioTree(path.join(PACKAGES, pkg, 'audio'), path.join(FK_ROOT, 'packages', pkg, 'audio')))
}
// Project-owned, USER-ADDED sounds (W1-1 2f: draw/move card SFX — FreeKill has no
// generic ones). Tracked in apps/web/assets/audio, copied to /fk/audio/system so
// audio.ts resolves them like built-in system sounds.
{
  const customDir = path.join(WEB, 'assets', 'audio')
  const destSys = path.join(FK_ROOT, 'audio', 'system')
  if (fs.existsSync(customDir)) {
    for (const name of fs.readdirSync(customDir)) {
      if (path.extname(name).toLowerCase() !== '.mp3') continue
      fs.mkdirSync(destSys, { recursive: true })
      fs.copyFileSync(path.join(customDir, name), path.join(destSys, name))
      audioManifest.push(`audio/system/${name}`)
      audioFiles++
    }
  }
}
// audio.json: a set of every audio path that exists under /fk, so the client can
// pick the one real candidate and issue a single GET instead of probing N URLs and
// eating 404s (each miss is logged as a console error in the browser).
fs.writeFileSync(path.join(FK_ROOT, 'audio.json'), JSON.stringify(audioManifest.sort(), null, 0))

console.log(`[sync-fk-assets] copied ${relPaths.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) -> public/fk`)
console.log(`[sync-fk-assets] images: ${imgFiles} files (${(imgBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/image + packages/*/image + images.json`)
console.log(`[sync-fk-assets] anim: ${animDirs} sprites / ${animFiles} frames (${(animBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/**/image/anim + anim.json`)
console.log(`[sync-fk-assets] audio: ${audioFiles} files (${(audioBytes / 1024 / 1024).toFixed(2)} MB) -> public/fk/**/audio + audio.json`)
console.log(`[sync-fk-assets] manifest: ${path.relative(WEB, MANIFEST)} + fkprelude.lua`)
