// mount.ts — mount the freekill-core resource tree into a wasmoon VFS.
//
// Two sources:
//   - mountFromFetch: browser — fetch each file from a base URL (Vite static) and
//     write it into the emscripten FS. Driven by a file-list manifest.
//   - (node tests mount directly from fs; see test/boot.test.ts.)
//
// The VFS layout MUST match what freekill.lua expects: files live under
// /fk/packages/freekill-core/<rel>, and the VM cwd is set there before boot.

/** Minimal wasmoon surface this module needs. */
export interface LuaFactoryLike {
  mountFileSync(luaModule: unknown, path: string, content: string | ArrayBufferView): void
}

export interface FileListManifest {
  base: string
  files: string[]
}

export const VFS_PACKAGES = '/fk/packages'

/**
 * Fetch every file in the manifest from `${baseUrl}/${rel}` and mount it under
 * /fk/packages/freekill-core/<rel>. Returns counts for perf reporting.
 *
 * @param baseUrl e.g. "/fk/packages/freekill-core" (Vite serves public/fk/...)
 */
export async function mountFromFetch(
  factory: LuaFactoryLike,
  luaModule: unknown,
  baseUrl: string,
  manifest: FileListManifest,
  opts: { concurrency?: number } = {},
): Promise<{ files: number; bytes: number; ms: number }> {
  const t0 = Date.now()
  const vfsBase = `${VFS_PACKAGES}/${manifest.base}`
  const concurrency = opts.concurrency ?? 16
  let bytes = 0

  const files = manifest.files
  let next = 0
  async function worker() {
    while (next < files.length) {
      const rel = files[next++]!
      const res = await fetch(`${baseUrl}/${rel}`)
      if (!res.ok) throw new Error(`mount fetch failed ${res.status}: ${rel}`)
      const buf = new Uint8Array(await res.arrayBuffer())
      factory.mountFileSync(luaModule, `${vfsBase}/${rel}`, buf)
      bytes += buf.length
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker))

  return { files: files.length, bytes, ms: Date.now() - t0 }
}
