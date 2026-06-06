// @freekill-web/assets — assets-manifest generation.
//
// PLACEHOLDER. The manifest's `md5` MUST equal what asio computes over its
// packages, or the Setup handshake fails with "MD5 check failed" (plan §3.2/§7,
// risk R-MD5). The algorithm below is documented from freekill-asio
// src/core/util.cpp (calcFileMD5 / writePkgsMD5 / writeDirMD5) so the generator
// can reproduce it byte-for-byte at build time.

export interface AssetsManifest {
  /** Compatible client version (semver, must satisfy asio's >=0.5.19 <0.6.0). */
  clientVersion: string
  /** freekill-asio version. */
  server: string
  /** flist MD5 — see computeFlistMd5 algorithm note below. */
  md5: string
  /** Enabled package names. */
  packages: string[]
  /** Base URL for served assets. */
  assetsBaseUrl: string
}

/**
 * asio flist/MD5 algorithm (to reproduce in the generator — NOT yet implemented):
 *
 *  1. Scan `packages/` top-level dirs in ALPHABETICAL order (std::map ordering).
 *  2. Skip: dirs ending ".disabled", disabled packs (GetDisabledPacks), and the
 *     built-in packs {standard, standard_cards, maneuvering, test}.
 *  3. For each remaining pack, recurse (alphabetical per directory) collecting
 *     files by extension into three ordered lists: .lua, .qml, .js.
 *  4. Per-file MD5 is computed over content with CRLF normalized to LF
 *     (skip '\r' when immediately followed by '\n').
 *  5. Build flist string = concat over (lua_hashes, then qml_hashes, then
 *     js_hashes) of `"<path>=<md5>;"` (path is the OS path as scanned).
 *  6. manifest.md5 = MD5(flist).
 *
 * Source: freekill-asio/src/core/util.cpp lines ~93-187.
 */
export function computeFlistMd5(_packagesDir: string, _disabledPacks: string[] = []): string {
  throw new Error('not implemented: reproduce asio calcFileMD5 (see algorithm note) — M0/assets task')
}

export function buildManifest(_opts: Partial<AssetsManifest>): AssetsManifest {
  throw new Error('not implemented — generate from actual asio/packages at build time')
}
