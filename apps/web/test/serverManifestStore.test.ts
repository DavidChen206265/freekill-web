// serverManifestStore parse tests — W0-2 SetServerSettings manifest (4th element).

import { describe, it, expect } from 'vitest'
import { parseManifest } from '../src/stores/serverManifestStore.js'

describe('parseManifest', () => {
  it('parses a full manifest object', () => {
    const m = parseManifest({
      webOnly: true,
      serverBuild: '0.1.14',
      assetVersion: '8efa2ccfcfc10ffb84a010f9e87920f6',
      enabledPacks: ['standard', 'standard_cards', 'maneuvering', 'sp', 'standard_ex', 'utility'],
      webFeatures: ['AddRobot', 'ChangeRoom'],
    })
    expect(m).not.toBeNull()
    expect(m!.received).toBe(true)
    expect(m!.webOnly).toBe(true)
    expect(m!.serverBuild).toBe('0.1.14')
    expect(m!.assetVersion).toBe('8efa2ccfcfc10ffb84a010f9e87920f6')
    expect(m!.enabledPacks).toContain('utility')
    expect(m!.webFeatures).toEqual(['AddRobot', 'ChangeRoom'])
  })

  it('returns null for old-server payloads (no 4th element)', () => {
    expect(parseManifest(undefined)).toBeNull()
    expect(parseManifest(null)).toBeNull()
  })

  it('returns null when enabledPacks is missing/wrong type', () => {
    expect(parseManifest({ webOnly: true })).toBeNull()
    expect(parseManifest({ enabledPacks: 'nope' })).toBeNull()
    expect(parseManifest([])).toBeNull() // array, not an object
  })

  it('filters non-string entries and defaults missing fields', () => {
    const m = parseManifest({ enabledPacks: ['standard', 42, null, 'sp'] })
    expect(m).not.toBeNull()
    expect(m!.enabledPacks).toEqual(['standard', 'sp'])
    expect(m!.webFeatures).toEqual([]) // missing → empty
    expect(m!.serverBuild).toBe('') // missing → ''
    expect(m!.webOnly).toBe(false)
  })
})
