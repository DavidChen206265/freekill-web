import { describe, expect, it } from 'vitest'
import {
  buildDisabledPayload,
  defaultDisableScheme,
  normalizeDisableScheme,
  summarizeDisableScheme,
  toggleBanGeneralInScheme,
  toggleBanPackageInScheme,
  type DisableScheme,
} from '../src/stores/disableSchemesStore.js'

describe('disableSchemes', () => {
  it('uses the FreeKill Config.qml default shape', () => {
    expect(defaultDisableScheme()).toEqual({ name: '', banPkg: {}, normalPkg: {}, banCardPkg: [] })
  })

  it('toggles package ban like GeneralsOverview.qml stat=banPkg', () => {
    const first = toggleBanPackageInScheme(defaultDisableScheme(), 'standard')
    expect(first.banPkg.standard).toEqual([])
    expect(first.normalPkg.standard).toBeUndefined()

    const withBlackList = toggleBanGeneralInScheme(first, 'caocao', 'standard')
    expect(withBlackList.banPkg.standard).toEqual(['caocao'])
    const second = toggleBanPackageInScheme(withBlackList, 'standard')
    expect(second.banPkg.standard).toBeUndefined()
    expect(second.normalPkg.standard).toBeUndefined()
  })

  it('toggles general into normalPkg or banPkg whitelist depending on package state', () => {
    const normal = toggleBanGeneralInScheme(defaultDisableScheme(), 'caocao', 'standard')
    expect(normal.normalPkg.standard).toEqual(['caocao'])
    expect(toggleBanGeneralInScheme(normal, 'caocao', 'standard').normalPkg.standard).toEqual([])

    const banPkg = toggleBanPackageInScheme(defaultDisableScheme(), 'standard')
    const whitelist = toggleBanGeneralInScheme(banPkg, 'liubei', 'standard')
    expect(whitelist.banPkg.standard).toEqual(['liubei'])
    expect(whitelist.normalPkg.standard).toBeUndefined()
  })

  it('builds disabledGenerals/disabledPack exactly like CreateRoom.qml', () => {
    const scheme: DisableScheme = {
      name: 'test',
      banPkg: {
        standard: ['liubei'],
        sp: [],
      },
      normalPkg: {
        maneuvering: ['m_ex__foo'],
      },
      banCardPkg: ['standard_cards'],
    }
    const getGenerals = (pack: string) => ({
      standard: ['caocao', 'liubei', 'sunquan'],
      sp: ['sp_caoren'],
      maneuvering: ['m_ex__foo'],
    }[pack] ?? [])

    expect(buildDisabledPayload(scheme, getGenerals, ['utility'])).toEqual({
      disabledGenerals: ['caocao', 'sunquan', 'm_ex__foo'],
      disabledPack: ['standard_cards', 'sp', 'utility'],
    })
  })

  it('does not send disabled data outside lunarltk', () => {
    const scheme = toggleBanGeneralInScheme(defaultDisableScheme(), 'caocao', 'standard')
    expect(buildDisabledPayload(scheme, () => ['caocao'], [], 'other')).toEqual({ disabledPack: [], disabledGenerals: [] })
  })

  it('validates imported schemes and produces BanGeneralSetting summaries', () => {
    const valid = normalizeDisableScheme({
      name: 'List1',
      banPkg: { standard: ['liubei'] },
      normalPkg: { sp: ['sp_caoren'] },
      banCardPkg: ['standard_cards'],
    })
    expect(valid).not.toBeNull()
    expect(summarizeDisableScheme(valid!)).toEqual({
      banGenerals: ['sp_caoren'],
      banPackages: ['standard', 'standard_cards'],
      whitelistGenerals: ['liubei'],
    })
    expect(normalizeDisableScheme({ banPkg: [], normalPkg: {}, banCardPkg: [] })).toBeNull()
    expect(normalizeDisableScheme({ banPkg: {}, normalPkg: { standard: 'bad' }, banCardPkg: [] })).toBeNull()
  })
})
