// @freekill-web/assets — assets-manifest generation.
//
// The manifest's `md5` MUST equal what asio computes over its packages, or the Setup
// handshake fails with "MD5 check failed" (plan §3.2/§7, risk R-MD5). The algorithm
// reproduces freekill-asio src/core/util.cpp (calcFileMD5 / writePkgsMD5 /
// writeDirMD5 / computeFileMD5) byte-for-byte so we can compute the right MD5 for any
// package set (core-only or with extension packs) at build/deploy time.

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface AssetsManifest {
  /** Compatible client version (semver, must satisfy asio's range). */
  clientVersion: string
  /** freekill-asio version. */
  server: string
  /** flist MD5 — see computeFlistMd5. */
  md5: string
  /** Enabled package names. */
  packages: string[]
  /** Base URL for served assets. */
  assetsBaseUrl: string
}

// Built-in packs asio excludes from the flist (writePkgsMD5, util.cpp:126-128).
const BUILTIN_PKGS = new Set(['standard', 'standard_cards', 'maneuvering', 'test'])

// Per-file MD5 over content with CRLF normalized to LF, lone CR kept (computeFileMD5,
// util.cpp:20-90). We can do this on the whole buffer since Node reads it all.
function computeFileMD5(absPath: string): string {
  const buf = fs.readFileSync(absPath)
  const h = createHash('md5')
  let start = 0
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 0x0d /* \r */) {
      if (i > start) h.update(buf.subarray(start, i))
      if (i + 1 < buf.length && buf[i + 1] === 0x0a /* \n */) {
        h.update('\n'); start = i + 2; i++ // skip the \n
      } else {
        h.update('\r'); start = i + 1 // lone \r kept
      }
    }
  }
  if (buf.length > start) h.update(buf.subarray(start))
  return h.digest('hex')
}

// Recurse a directory in std::map (alphabetical-by-filename) order, collecting .lua /
// .qml / .js files (writeDirMD5, util.cpp:93-116). The recorded path starts at the
// `base` segment ("packages") so keys are "packages/<pkg>/.../file" — asio scans
// relative to "packages" with '/' separators on its Linux host; we match that.
function walkWithBase(dir: string, base: string, lua: [string, string][], qml: [string, string][], js: [string, string][]): void {
  const names = fs.readdirSync(dir).sort()
  for (const name of names) {
    const full = path.join(dir, name)
    const st = fs.statSync(full)
    if (st.isDirectory()) {
      walkWithBase(full, base, lua, qml, js)
    } else if (st.isFile()) {
      // Build "packages/<...>" by taking the path from the `base` segment onward.
      const parts = full.replace(/\\/g, '/').split('/')
      const idx = parts.lastIndexOf(base)
      const rel = idx >= 0 ? parts.slice(idx).join('/') : full.replace(/\\/g, '/')
      if (name.endsWith('.lua')) lua.push([rel, computeFileMD5(full)])
      else if (name.endsWith('.qml')) qml.push([rel, computeFileMD5(full)])
      else if (name.endsWith('.js')) js.push([rel, computeFileMD5(full)])
    }
  }
}

/**
 * Reproduce asio's flist MD5 for a `packages/` directory (calcFileMD5 + writePkgsMD5,
 * util.cpp:118-187). `packagesDir` = the dir whose entries are the package folders
 * (its basename MUST be "packages" to match asio's `fs::path("packages")` scan).
 * .disabled dirs + disabledPacks + the 4 built-ins are skipped (util.cpp:140-142).
 * flist = all .lua (then .qml, then .js) as "<path>=<md5>;"; result = MD5(flist).
 */
export function computeFlistMd5(packagesDir: string, disabledPacks: string[] = []): string {
  const lua: [string, string][] = []
  const qml: [string, string][] = []
  const js: [string, string][] = []
  const disabled = new Set(disabledPacks)
  const base = path.basename(packagesDir) // "packages"
  for (const name of fs.readdirSync(packagesDir).sort()) {
    const full = path.join(packagesDir, name)
    if (!fs.statSync(full).isDirectory()) continue
    if (name.endsWith('.disabled') || disabled.has(name) || BUILTIN_PKGS.has(name)) continue
    walkWithBase(full, base, lua, qml, js)
  }
  let flist = ''
  for (const [p, m] of lua) flist += `${p}=${m};`
  for (const [p, m] of qml) flist += `${p}=${m};`
  for (const [p, m] of js) flist += `${p}=${m};`
  return createHash('md5').update(flist).digest('hex')
}

/** Build a manifest: compute md5 over the packages dir + list enabled packs. */
export function buildManifest(opts: {
  packagesDir: string
  clientVersion: string
  server: string
  assetsBaseUrl?: string
  disabledPacks?: string[]
}): AssetsManifest {
  const disabled = new Set(opts.disabledPacks ?? [])
  const packages = fs.readdirSync(opts.packagesDir).sort().filter((name) => {
    const full = path.join(opts.packagesDir, name)
    return fs.statSync(full).isDirectory() && !name.endsWith('.disabled') && !disabled.has(name) && !BUILTIN_PKGS.has(name)
  })
  return {
    clientVersion: opts.clientVersion,
    server: opts.server,
    md5: computeFlistMd5(opts.packagesDir, opts.disabledPacks ?? []),
    packages,
    assetsBaseUrl: opts.assetsBaseUrl ?? '/fk',
  }
}
