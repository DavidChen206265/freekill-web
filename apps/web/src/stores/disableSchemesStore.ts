import { create } from 'zustand'

export interface DisableScheme {
  name: string
  /** Banned general packages: package -> whitelist general names. */
  banPkg: Record<string, string[]>
  /** Normal packages: package -> blacklist general names. */
  normalPkg: Record<string, string[]>
  /** Banned card package names. */
  banCardPkg: string[]
}

interface DisableSchemesState {
  disableSchemes: DisableScheme[]
  currentDisableIdx: number
  curScheme: DisableScheme
  setCurrentIndex: (idx: number) => void
  newScheme: () => void
  clearCurrent: () => void
  renameCurrent: (name: string) => void
  importCurrent: (scheme: unknown) => boolean
  exportCurrent: () => string
  toggleBanPackage: (pack: string) => void
  toggleBanGeneral: (general: string, pack: string) => void
  revertSelection: (generals: { name: string; package: string }[]) => void
  save: () => void
}

const STORAGE_KEY = 'fk-disable-schemes'

export function defaultDisableScheme(): DisableScheme {
  return { name: '', banPkg: {}, normalPkg: {}, banCardPkg: [] }
}

export function normalizeDisableScheme(value: unknown): DisableScheme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const banPkg = normalizePackageMap(raw.banPkg)
  const normalPkg = normalizePackageMap(raw.normalPkg)
  const banCardPkg = Array.isArray(raw.banCardPkg) ? raw.banCardPkg.filter(isNonEmptyString) : null
  if (!banPkg || !normalPkg || !banCardPkg) return null
  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    banPkg,
    normalPkg,
    banCardPkg,
  }
}

export function cloneDisableScheme(scheme: DisableScheme): DisableScheme {
  return {
    name: scheme.name,
    banPkg: clonePackageMap(scheme.banPkg),
    normalPkg: clonePackageMap(scheme.normalPkg),
    banCardPkg: [...scheme.banCardPkg],
  }
}

export function toggleBanPackageInScheme(scheme: DisableScheme, pack: string): DisableScheme {
  if (!pack) return cloneDisableScheme(scheme)
  const next = cloneDisableScheme(scheme)
  if (next.banPkg[pack]) {
    delete next.banPkg[pack]
    delete next.normalPkg[pack]
  } else {
    delete next.normalPkg[pack]
    next.banPkg[pack] = []
  }
  return next
}

export function toggleBanGeneralInScheme(scheme: DisableScheme, general: string, pack: string): DisableScheme {
  if (!general || !pack) return cloneDisableScheme(scheme)
  const next = cloneDisableScheme(scheme)
  const target = next.banPkg[pack] ?? (next.normalPkg[pack] ?? [])
  if (!next.banPkg[pack] && !next.normalPkg[pack]) next.normalPkg[pack] = target
  const idx = target.indexOf(general)
  if (idx >= 0) target.splice(idx, 1)
  else target.push(general)
  return next
}

export function summarizeDisableScheme(scheme: DisableScheme): {
  banGenerals: string[]
  banPackages: string[]
  whitelistGenerals: string[]
} {
  return {
    banGenerals: Object.values(scheme.normalPkg).flat(),
    banPackages: [...Object.keys(scheme.banPkg), ...scheme.banCardPkg],
    whitelistGenerals: Object.values(scheme.banPkg).flat(),
  }
}

export function buildDisabledPayload(
  scheme: DisableScheme,
  getGenerals: (pack: string) => string[],
  serverHiddenPacks: string[] = [],
  boardgameName = 'lunarltk',
): { disabledPack: string[]; disabledGenerals: string[] } {
  if (boardgameName !== 'lunarltk') return { disabledPack: [], disabledGenerals: [] }
  const disabledGenerals: string[] = []
  for (const [pack, whitelist] of Object.entries(scheme.banPkg)) {
    if (whitelist.length !== 0) {
      const generals = getGenerals(pack)
      if (generals.length !== 0) disabledGenerals.push(...generals.filter((g) => !whitelist.includes(g)))
    }
  }
  for (const arr of Object.values(scheme.normalPkg)) {
    if (arr.length !== 0) disabledGenerals.push(...arr)
  }

  const disabledPack = [...scheme.banCardPkg]
  for (const [pack, whitelist] of Object.entries(scheme.banPkg)) {
    if (whitelist.length === 0) disabledPack.push(pack)
  }
  for (const pack of serverHiddenPacks) {
    if (!disabledPack.includes(pack)) disabledPack.push(pack)
  }
  return { disabledPack, disabledGenerals }
}

function normalizePackageMap(value: unknown): Record<string, string[]> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string[]> = {}
  for (const [pack, names] of Object.entries(value)) {
    if (!Array.isArray(names)) return null
    out[pack] = names.filter(isNonEmptyString)
  }
  return out
}

function clonePackageMap(value: Record<string, string[]>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(value)) out[k] = [...v]
  return out
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function loadPersisted(): { disableSchemes: DisableScheme[]; currentDisableIdx: number } {
  try {
    if (typeof localStorage === 'undefined') return { disableSchemes: [defaultDisableScheme()], currentDisableIdx: 0 }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { disableSchemes: [defaultDisableScheme()], currentDisableIdx: 0 }
    const parsed = JSON.parse(raw) as { disableSchemes?: unknown; currentDisableIdx?: unknown }
    const schemes = Array.isArray(parsed.disableSchemes)
      ? parsed.disableSchemes.map(normalizeDisableScheme).filter((s): s is DisableScheme => s !== null)
      : []
    const disableSchemes = schemes.length > 0 ? schemes : [defaultDisableScheme()]
    const idx = typeof parsed.currentDisableIdx === 'number' ? parsed.currentDisableIdx : 0
    return { disableSchemes, currentDisableIdx: clampIndex(idx, disableSchemes.length) }
  } catch {
    return { disableSchemes: [defaultDisableScheme()], currentDisableIdx: 0 }
  }
}

function persist(disableSchemes: DisableScheme[], currentDisableIdx: number): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ disableSchemes, currentDisableIdx }))
  } catch { /* ignore */ }
}

function replaceCurrent(state: DisableSchemesState, scheme: DisableScheme): Pick<DisableSchemesState, 'disableSchemes' | 'curScheme'> {
  const disableSchemes = state.disableSchemes.map((s, i) => i === state.currentDisableIdx ? cloneDisableScheme(scheme) : cloneDisableScheme(s))
  return { disableSchemes, curScheme: disableSchemes[state.currentDisableIdx] ?? defaultDisableScheme() }
}

function clampIndex(idx: number, length: number): number {
  return Math.min(Math.max(Math.trunc(idx) || 0, 0), Math.max(length - 1, 0))
}

const initial = loadPersisted()

export const useDisableSchemesStore = create<DisableSchemesState>((set, get) => ({
  disableSchemes: initial.disableSchemes,
  currentDisableIdx: initial.currentDisableIdx,
  curScheme: initial.disableSchemes[initial.currentDisableIdx] ?? defaultDisableScheme(),

  setCurrentIndex: (idx) => set((s) => {
    const currentDisableIdx = clampIndex(idx, s.disableSchemes.length)
    persist(s.disableSchemes, currentDisableIdx)
    return { currentDisableIdx, curScheme: s.disableSchemes[currentDisableIdx] ?? defaultDisableScheme() }
  }),

  newScheme: () => set((s) => {
    const disableSchemes = [...s.disableSchemes.map(cloneDisableScheme), defaultDisableScheme()]
    const currentDisableIdx = s.currentDisableIdx
    persist(disableSchemes, currentDisableIdx)
    return { disableSchemes, curScheme: disableSchemes[currentDisableIdx] ?? defaultDisableScheme() }
  }),

  clearCurrent: () => set((s) => {
    const next = replaceCurrent(s, { ...s.curScheme, banPkg: {}, normalPkg: {}, banCardPkg: [] })
    persist(next.disableSchemes, s.currentDisableIdx)
    return next
  }),

  renameCurrent: (name) => set((s) => {
    const next = replaceCurrent(s, { ...s.curScheme, name })
    persist(next.disableSchemes, s.currentDisableIdx)
    return next
  }),

  importCurrent: (value) => {
    const scheme = normalizeDisableScheme(value)
    if (!scheme) return false
    set((s) => {
      const next = replaceCurrent(s, scheme)
      persist(next.disableSchemes, s.currentDisableIdx)
      return next
    })
    return true
  },

  exportCurrent: () => JSON.stringify(get().curScheme),

  toggleBanPackage: (pack) => set((s) => {
    const next = replaceCurrent(s, toggleBanPackageInScheme(s.curScheme, pack))
    persist(next.disableSchemes, s.currentDisableIdx)
    return next
  }),

  toggleBanGeneral: (general, pack) => set((s) => {
    const next = replaceCurrent(s, toggleBanGeneralInScheme(s.curScheme, general, pack))
    persist(next.disableSchemes, s.currentDisableIdx)
    return next
  }),

  revertSelection: (generals) => set((s) => {
    let curScheme = cloneDisableScheme(s.curScheme)
    for (const g of generals) curScheme = toggleBanGeneralInScheme(curScheme, g.name, g.package)
    const next = replaceCurrent(s, curScheme)
    persist(next.disableSchemes, s.currentDisableIdx)
    return next
  }),

  save: () => {
    const s = get()
    persist(s.disableSchemes, s.currentDisableIdx)
  },
}))
