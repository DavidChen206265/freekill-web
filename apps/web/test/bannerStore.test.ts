import { describe, it, expect, beforeEach } from 'vitest'
import { useBannerStore } from '../src/stores/bannerStore.js'

beforeEach(() => useBannerStore.getState().reset())

describe('bannerStore (SetBanner MarkArea rules)', () => {
  it('sets and removes a normal banner mark', () => {
    const t = (k: string) => ({ '@@hidden': '隐藏', '@clock': '回合', turn: '轮次' }[k] ?? k)
    useBannerStore.getState().setMark('@clock', 'turn', t)
    expect(useBannerStore.getState().marks['@clock']).toEqual({ mark: '@clock', name: '回合', value: '轮次' })

    useBannerStore.getState().removeMark('@clock')
    expect(useBannerStore.getState().marks['@clock']).toBeUndefined()
  })

  it('counts pile-style banner values and keeps @@ values hidden', () => {
    useBannerStore.getState().setMark('@$pile', [1, 2, 3])
    expect(useBannerStore.getState().marks['@$pile']!.value).toBe('3')

    useBannerStore.getState().setMark('@@hidden', '')
    expect(useBannerStore.getState().marks['@@hidden']!.value).toBe('')
  })
})
