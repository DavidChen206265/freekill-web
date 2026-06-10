// assets MD5 unit tests — verify the flist algorithm reproduces asio's calcFileMD5
// (util.cpp): CRLF→LF normalization, alphabetical scan, lua→qml→js grouping, built-in
// + .disabled + disabledPacks exclusion, and "packages/..." path keys. We build a tiny
// fake packages tree in a temp dir and check the MD5 against a hand-computed flist.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { computeFlistMd5, buildManifest } from '../src/index.js'

let root: string
let pkgs: string

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'fk-assets-'))
  pkgs = path.join(root, 'packages')
  const w = (rel: string, content: string) => {
    const f = path.join(pkgs, rel)
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, content)
  }
  // extension pack "zz" with one of each type + nested dir
  w('zz/a.lua', 'print(1)\n')
  w('zz/b.qml', 'Item{}\n')
  w('zz/c.js', 'export {}\n')
  w('zz/sub/d.lua', 'local x = 2\r\n') // CRLF → must hash as LF
  // built-in (excluded) + .disabled (excluded) + a non-code file (ignored)
  w('standard/x.lua', 'should be excluded\n')
  w('off.disabled/y.lua', 'excluded too\n')
  w('zz/readme.txt', 'not code, ignored\n')
})

afterAll(() => { fs.rmSync(root, { recursive: true, force: true }) })

// Recompute the expected flist by hand, mirroring the algorithm, to cross-check.
function fileMd5LF(p: string): string {
  const buf = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
  return createHash('md5').update(Buffer.from(buf, 'utf8')).digest('hex')
}

describe('computeFlistMd5', () => {
  it('matches a hand-built flist (lua→qml→js, alphabetical, packages/ keys, CRLF→LF)', () => {
    // Expected order: lua [zz/a.lua, zz/sub/d.lua], qml [zz/b.qml], js [zz/c.js].
    // (writeDirMD5 recurses alphabetically: a.lua, b.qml, c.js, readme.txt, sub/ →
    //  but the LISTS are grouped by type, lua first across the whole walk.)
    const lua = [
      `packages/zz/a.lua=${fileMd5LF(path.join(pkgs, 'zz/a.lua'))};`,
      `packages/zz/sub/d.lua=${fileMd5LF(path.join(pkgs, 'zz/sub/d.lua'))};`,
    ]
    const qml = [`packages/zz/b.qml=${fileMd5LF(path.join(pkgs, 'zz/b.qml'))};`]
    const js = [`packages/zz/c.js=${fileMd5LF(path.join(pkgs, 'zz/c.js'))};`]
    const flist = [...lua, ...qml, ...js].join('')
    const expected = createHash('md5').update(flist).digest('hex')
    expect(computeFlistMd5(pkgs)).toBe(expected)
  })

  it('excludes built-ins, .disabled dirs, and disabledPacks', () => {
    // Adding "standard" content must NOT change the MD5 (built-in excluded).
    const md5a = computeFlistMd5(pkgs)
    // Disabling "zz" → empty flist → md5 of "".
    const md5disabled = computeFlistMd5(pkgs, ['zz'])
    expect(md5disabled).toBe(createHash('md5').update('').digest('hex'))
    expect(md5a).not.toBe(md5disabled)
  })

  it('buildManifest lists enabled (non-builtin) packs + the md5', () => {
    const m = buildManifest({ packagesDir: pkgs, clientVersion: '0.5.20', server: '0.5.20' })
    expect(m.packages).toEqual(['zz']) // standard excluded, off.disabled excluded
    expect(m.md5).toBe(computeFlistMd5(pkgs))
    expect(m.assetsBaseUrl).toBe('/fk')
  })
})
