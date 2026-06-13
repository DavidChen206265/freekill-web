import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

const FILES = [
  'table/BannerArea.tsx',
  'table/Photo.tsx',
  'table/RoomScene.tsx',
  'table/CardLayer.tsx',
  'table/Dashboard.tsx',
  'table/AnimationLayer.tsx',
]

describe('Zustand selectors', () => {
  it('do not return freshly-created object/array snapshots from React hooks', () => {
    const unsafe: string[] = []
    for (const rel of FILES) {
      const src = readFileSync(join(SRC, rel), 'utf8')
      const re = /use[A-Za-z0-9]+Store\(\s*\([^)]*\)\s*=>[^)\n]*(Object\.(?:values|keys|entries)|=>\s*\[[^\]]*\])/g
      for (const m of src.matchAll(re)) unsafe.push(`${rel}: ${m[0]}`)
    }
    expect(unsafe).toEqual([])
  })
})
