// natives.ts — flat leaf-level native functions the client Lua VM needs.
//
// Mirrors the C++ SWIG client surface (src/swig/{freekill,client,qt,player}.i)
// AND the asio server's own pure-Lua replacement (lua/server/rpc/fk.lua).
// Critically, `fk` itself is built as a LUA table (see lua/fkprelude.lua) so
// engine objects keep their metatables; JS only provides leaf ops (FS, clock,
// logging) and the notifyUI render sink.
//
// Ported from the spike's fknatives.mjs, with the node:path dependency removed
// (posix normalize implemented inline) so this module is node/browser isomorphic.

/** Minimal slice of the emscripten FS that wasmoon exposes and we depend on. */
export interface EmscriptenFS {
  cwd(): string
  chdir(path: string): void
  readdir(path: string): string[]
  stat(path: string): { mode: number }
}

export interface NativesOptions {
  /** The emscripten virtual FS backing FileIO / QmlBackend. */
  emfs: EmscriptenFS
  /** Render-data sink: every notifyUI(command, data) the VM emits. */
  onNotifyUI?: (event: { command: string; data: unknown }) => void
  /** Optional log sink (qInfo/qWarning/qCritical/qDebug + diagnostics). */
  log?: (message: string) => void
}

/** The flat table of leaf functions injected into the VM as `__natives`. */
export interface Natives {
  cd(p: string): boolean
  pwd(): string
  ls(dir: string): string[]
  exists(p: string): boolean
  isDir(p: string): boolean
  getMicroSecond(): number
  qInfo(m: string): void
  qWarning(m: string): void
  qCritical(m: string): void
  qDebug(m: string): void
  getDisabledPacks(): string
  notifyUI(command: string, dataJson: string): void
  notifyServer(command: string, dataJson: string): void
}

// POSIX path.normalize, inlined (no node:path) so this runs in the browser too.
// Resolves '.' and '..' segments; preserves a leading '/'. Mirrors the subset of
// path.posix.normalize the spike relied on for FileIO path resolution.
function normalizePosix(p: string): string {
  const isAbsolute = p.startsWith('/')
  const segments = p.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop()
      else if (!isAbsolute) out.push('..')
    } else {
      out.push(seg)
    }
  }
  const joined = out.join('/')
  if (isAbsolute) return '/' + joined
  return joined === '' ? '.' : joined
}

// emscripten stat mode bits: S_IFMT mask + S_IFDIR (wasmoon's FS does NOT expose
// FS.isDir(), so we test the mode bits directly — without this, FreeKill's
// package-discovery loop FileIO.isDir("packages/"..d) returns false for every
// extension pack and silently loads only the bundled base packs).
const S_IFMT = 0o170000
const S_IFDIR = 0o040000

export function createNatives({ emfs, onNotifyUI, log }: NativesOptions): Natives {
  const absToCwd = (p: string) => (p.startsWith('/') ? p : emfs.cwd().replace(/\/$/, '') + '/' + p)
  const norm = (p: string) => normalizePosix(absToCwd(p))

  return {
    // FileIO / QmlBackend — backed by the emscripten virtual FS
    cd: (p) => {
      try { emfs.chdir(norm(p)); return true }
      catch (e) { log?.(`[cd fail] ${p}: ${(e as Error).message}`); return false }
    },
    pwd: () => emfs.cwd(),
    ls: (dir) => {
      try { return emfs.readdir(norm(dir || '.')).filter((n) => n !== '.' && n !== '..') }
      catch (e) { log?.(`[ls fail] ${dir}: ${(e as Error).message}`); return [] }
    },
    exists: (p) => { try { emfs.stat(norm(p)); return true } catch { return false } },
    isDir: (p) => { try { return (emfs.stat(norm(p)).mode & S_IFMT) === S_IFDIR } catch { return false } },

    // qt.i
    getMicroSecond: () => Date.now() * 1000,
    qInfo: (m) => log?.('[qInfo] ' + m),
    qWarning: (m) => log?.('[qWarning] ' + m),
    qCritical: (m) => log?.('[qCritical] ' + m),
    qDebug: (m) => log?.('[qDebug] ' + m),

    // freekill.i
    getDisabledPacks: () => '[]',

    // client.i — the render sink. `dataJson` is a JSON string built in Lua so we
    // get a faithful, fully-expanded snapshot of what the VM wants drawn.
    notifyUI: (command, dataJson) => {
      let data: unknown
      try { data = JSON.parse(dataJson) } catch { data = dataJson }
      onNotifyUI?.({ command, data })
    },
    notifyServer: (command, dataJson) => {
      onNotifyUI?.({ command: '__toServer__:' + command, data: dataJson })
    },
  }
}
