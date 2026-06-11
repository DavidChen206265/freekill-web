// enumerate.ts — isomorphic (no node/browser deps): turn the synced asset manifests
// into the full list of asset paths that SHOULD exist under /fk. Used by both the
// deploy-side verifier (Node: fs.existsSync each) and the client self-check / optional
// precache (browser: HEAD/GET each). Keeping one enumerator means the "what assets
// exist" truth can't drift between deploy validation and runtime.
//
// Paths returned are RELATIVE to the /fk root, e.g. "audio/system/bgm.mp3",
// "packages/standard_cards/audio/card/male/indulgence.mp3",
// "packages/maneuvering/image/anim/guding_blade/3.png".

/** audio.json / images.json: arrays of /fk-relative paths. */
export type ListManifest = string[]
/** anim.json: { "<emotion>" | "<pkg>/<emotion>": frameCount }. Frames are
 *  <key>/0.png .. <key>/(n-1).png, under image/anim/ (builtin, bare key) or
 *  packages/<pkg>/image/anim/<emotion>/ (pkg-prefixed key). */
export type AnimManifest = Record<string, number>
/** file-list.json: the VM mount tree. Files live at packages/<base>/<file>. */
export interface FileListManifest {
  base: string
  files: string[]
  extra?: { base: string; files: string[] }[]
}

export interface AssetManifests {
  audio?: ListManifest
  images?: ListManifest
  anim?: AnimManifest
  fileList?: FileListManifest
}

// Fixed assets the client code references directly but that live in NO manifest.
// gamebg.jpg is exactly the file that slipped through .dockerignore (404 on VPS):
// it has no manifest entry, so neither the old client nor any check would catch it.
// Keep this list in sync with hard-coded /fk paths in the web app (Stage bg, etc.).
export const FIXED_ASSETS: string[] = [
  'image/gamebg.jpg', // Stage.tsx game-table background (W1-1 2e)
]

/** Builtin chat-throw animations (egg/flower/shoe/wine) are NOT index-addressable:
 *  anim.json records a frame count, but the files are named (egg0.png, shoe_s.png, …)
 *  and played by ChatAnim QML by explicit name, not <key>/<i>.png. Their recorded
 *  count doesn't map to 0..n-1 paths, so exclude them from frame enumeration (else
 *  the verifier reports phantom-missing wine/0.png etc.). */
const CHAT_ANIM_KEYS = new Set(['egg', 'flower', 'shoe', 'wine', 'fly'])

/** Expand anim.json into individual frame paths.
 *
 *  anim.json keys are ambiguous: "x/y" can mean either a PACKAGE sprite
 *  (packages/x/image/anim/y, when x is a pack) OR a builtin NESTED sprite
 *  (image/anim/x/y, e.g. skillInvoke/control where skillInvoke is a builtin
 *  category, not a pack). Disambiguate using the known pack set: first segment is
 *  a package iff it's in `packs`; otherwise the whole key is a builtin path.
 *  (Mirrors sync-fk-assets copyAnimDir: builtin keyPrefix '' incl. nested dirs;
 *  per-pack keyPrefix '<pkg>/'.) */
export function animFramePaths(anim: AnimManifest, packs: string[] = []): string[] {
  const packSet = new Set(packs)
  const out: string[] = []
  for (const [key, count] of Object.entries(anim)) {
    if (!Number.isFinite(count) || count <= 0) continue
    if (CHAT_ANIM_KEYS.has(key)) continue // named frames, not 0..n-1 (see above)
    const slash = key.indexOf('/')
    const firstSeg = slash >= 0 ? key.slice(0, slash) : ''
    let base: string
    if (slash >= 0 && packSet.has(firstSeg)) {
      // package sprite: packages/<pkg>/image/anim/<emotion>
      base = `packages/${firstSeg}/image/anim/${key.slice(slash + 1)}`
    } else {
      // builtin sprite (flat "emotion" or nested "skillInvoke/type"): image/anim/<key>
      base = `image/anim/${key}`
    }
    for (let i = 0; i < count; i++) out.push(`${base}/${i}.png`)
  }
  return out
}

/** Expand file-list.json into VM-mount file paths (packages/<base>/<file>). */
export function fileListPaths(fl: FileListManifest): string[] {
  const out: string[] = []
  const add = (base: string, files: string[]) => {
    for (const f of files) out.push(`packages/${base}/${f}`)
  }
  if (fl.base && Array.isArray(fl.files)) add(fl.base, fl.files)
  for (const ex of fl.extra ?? []) if (ex.base && Array.isArray(ex.files)) add(ex.base, ex.files)
  return out
}

/** All /fk-relative paths that should exist, deduped. Pass whichever manifests you
 *  have; missing ones are skipped. Always includes FIXED_ASSETS. The pack set used to
 *  disambiguate anim keys is the builtin art packs + the file-list extra packs (which
 *  is exactly what sync-fk-assets iterates as ART_PACKS). */
export function enumerateAssets(m: AssetManifests): string[] {
  const set = new Set<string>(FIXED_ASSETS)
  for (const p of m.audio ?? []) set.add(p)
  for (const p of m.images ?? []) set.add(p)
  if (m.anim) {
    const packs = ['standard', 'standard_cards', 'maneuvering', ...(m.fileList?.extra ?? []).map((e) => e.base)]
    for (const p of animFramePaths(m.anim, packs)) set.add(p)
  }
  if (m.fileList) for (const p of fileListPaths(m.fileList)) set.add(p)
  return [...set]
}
