import { describe, expect, it } from 'vitest'
import { computeStageViewport, STAGE_H, STAGE_W } from '../src/table/stageViewport.js'

describe('stage viewport sizing', () => {
  it('keeps desktop scaling on window inner size even when visualViewport differs', () => {
    const state = computeStageViewport({
      windowWidth: 1920,
      windowHeight: 1080,
      visualWidth: 900,
      visualHeight: 400,
      documentWidth: 900,
      documentHeight: 400,
      isMobile: false,
      isPwa: true,
    })

    expect(state.mobilePwa).toBe(false)
    expect(state.width).toBe(1920)
    expect(state.height).toBe(1080)
    expect(state.scale).toBeCloseTo(Math.min(1920 / STAGE_W, 1080 / STAGE_H))
  })

  it('uses visualViewport dimensions in mobile PWA mode', () => {
    const state = computeStageViewport({
      windowWidth: 932,
      windowHeight: 480,
      visualWidth: 932,
      visualHeight: 430,
      documentWidth: 932,
      documentHeight: 480,
      isMobile: true,
      isPwa: true,
    })

    expect(state.mobilePwa).toBe(true)
    expect(state.width).toBe(932)
    expect(state.height).toBe(430)
    expect(state.scale).toBeCloseTo(Math.min(932 / STAGE_W, 430 / STAGE_H))
  })

  it('does not apply mobile viewport correction outside PWA display mode', () => {
    const state = computeStageViewport({
      windowWidth: 932,
      windowHeight: 480,
      visualWidth: 932,
      visualHeight: 430,
      documentWidth: 932,
      documentHeight: 430,
      screenWidth: 430,
      screenHeight: 932,
      isMobile: true,
      isPwa: false,
    })

    expect(state.mobilePwa).toBe(false)
    expect(state.width).toBe(932)
    expect(state.height).toBe(480)
    expect(state.scale).toBeCloseTo(Math.min(932 / STAGE_W, 480 / STAGE_H))
  })

  it('uses visualViewport when an installed mobile app reports landscape visually but not display-mode', () => {
    const state = computeStageViewport({
      windowWidth: 430,
      windowHeight: 932,
      visualWidth: 932,
      visualHeight: 430,
      documentWidth: 430,
      documentHeight: 932,
      screenWidth: 932,
      screenHeight: 430,
      isMobile: true,
      isPwa: false,
    })

    expect(state.mobilePwa).toBe(true)
    expect(state.width).toBe(932)
    expect(state.height).toBe(430)
    expect(state.scale).toBeCloseTo(Math.min(932 / STAGE_W, 430 / STAGE_H))
  })

  it('falls back to document size for mobile PWA when visualViewport is unavailable', () => {
    const state = computeStageViewport({
      windowWidth: 900,
      windowHeight: 500,
      documentWidth: 844,
      documentHeight: 390,
      isMobile: true,
      isPwa: true,
    })

    expect(state.mobilePwa).toBe(true)
    expect(state.width).toBe(844)
    expect(state.height).toBe(390)
    expect(state.scale).toBeCloseTo(Math.min(844 / STAGE_W, 390 / STAGE_H))
  })
})
