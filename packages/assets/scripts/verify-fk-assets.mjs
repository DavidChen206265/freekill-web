#!/usr/bin/env node
// verify-fk-assets.mjs — deploy-side completeness check. Reads the synced manifests
// under <fkRoot> (default apps/web/public/fk) and asserts every asset they reference
// actually exists on disk and is non-empty. Exits 1 with a list on any miss — wired
// into the build so a deploy that's missing files (e.g. gamebg.jpg dropped by
// .dockerignore) fails LOUDLY instead of 404-ing silently in users' browsers.
//
//   node packages/assets/scripts/verify-fk-assets.mjs [fkRoot]
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enumerateAssets } from '../dist/enumerate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FK_ROOT = path.resolve(process.argv[2] ?? path.join(__dirname, '../../../apps/web/public/fk'))

function readJson(rel) {
  const p = path.join(FK_ROOT, rel)
  if (!fs.existsSync(p)) return null
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch (e) { return { __error: String(e) } }
}

console.log(`[verify-fk-assets] fkRoot: ${FK_ROOT}`)
if (!fs.existsSync(FK_ROOT)) {
  console.error(`[verify-fk-assets] FAIL: fkRoot does not exist (run sync-fk-assets first)`)
  process.exit(1)
}

// The four manifests must themselves exist — they ARE the contract.
const required = ['audio.json', 'images.json', 'anim.json', 'file-list.json']
const manifestMissing = required.filter((f) => !fs.existsSync(path.join(FK_ROOT, f)))
if (manifestMissing.length) {
  console.error(`[verify-fk-assets] FAIL: missing manifest(s): ${manifestMissing.join(', ')}`)
  process.exit(1)
}

const audio = readJson('audio.json')
const images = readJson('images.json')
const anim = readJson('anim.json')
const fileList = readJson('file-list.json')

const paths = enumerateAssets({
  audio: Array.isArray(audio) ? audio : [],
  images: Array.isArray(images) ? images : [],
  anim: anim && typeof anim === 'object' ? anim : {},
  fileList: fileList && typeof fileList === 'object' ? fileList : undefined,
})

let missing = 0, empty = 0
const missingList = []
const emptyList = []
for (const rel of paths) {
  const p = path.join(FK_ROOT, rel)
  let st
  try { st = fs.statSync(p) } catch { missing++; missingList.push(rel); continue }
  if (!st.isFile()) { missing++; missingList.push(rel); continue }
  if (st.size === 0) { empty++; emptyList.push(rel) }
}

console.log(`[verify-fk-assets] checked ${paths.length} assets`)
// Empty files are only a WARNING: a few freekill-core lua files (skill_manager.lua,
// user_manager.lua, poxi_box.lua, …) ship empty in the upstream source by design.
// MISSING is the real deploy-failure class (e.g. gamebg.jpg dropped by .dockerignore).
if (empty > 0) {
  console.warn(`[verify-fk-assets] WARN: ${empty} zero-byte file(s) (ok if empty in source):`)
  for (const r of emptyList.slice(0, 20)) console.warn('  EMPTY ' + r)
  if (emptyList.length > 20) console.warn(`  … and ${emptyList.length - 20} more`)
}
if (missing === 0) {
  console.log('[verify-fk-assets] OK — all referenced assets present')
  process.exit(0)
}
console.error(`[verify-fk-assets] FAIL: ${missing} missing asset(s):`)
for (const r of missingList.slice(0, 50)) console.error('  MISSING ' + r)
if (missingList.length > 50) console.error(`  … and ${missingList.length - 50} more`)
process.exit(1)
