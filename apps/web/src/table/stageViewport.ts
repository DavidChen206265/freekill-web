import { isLikelyMobileDevice, isPwaInstalled } from '../pwa/installPrompt.js'

export const STAGE_W = 1200
export const STAGE_H = 540

export interface StageViewportInput {
  windowWidth: number
  windowHeight: number
  visualWidth?: number
  visualHeight?: number
  documentWidth?: number
  documentHeight?: number
  screenWidth?: number
  screenHeight?: number
  isMobile: boolean
  isPwa: boolean
}

export interface StageViewportState {
  mobilePwa: boolean
  width: number
  height: number
  scale: number
}

export interface StageLayoutState {
  width: number
  height: number
  scale: number
  left: number
  top: number
}

function positive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function needsMobileViewportCorrection(input: StageViewportInput): boolean {
  if (!input.isMobile) return false
  if (input.isPwa) return true
  const visualLandscape = positive(input.visualWidth) && positive(input.visualHeight) && input.visualWidth > input.visualHeight
  const windowPortrait = input.windowWidth < input.windowHeight
  const screenLandscape = positive(input.screenWidth) && positive(input.screenHeight) && input.screenWidth > input.screenHeight
  return visualLandscape && (windowPortrait || screenLandscape)
}

export function computeStageViewport(input: StageViewportInput): StageViewportState {
  const mobilePwa = needsMobileViewportCorrection(input)
  const width = mobilePwa
    ? (positive(input.visualWidth) ? input.visualWidth : positive(input.documentWidth) ? input.documentWidth : input.windowWidth)
    : input.windowWidth
  const height = mobilePwa
    ? (positive(input.visualHeight) ? input.visualHeight : positive(input.documentHeight) ? input.documentHeight : input.windowHeight)
    : input.windowHeight
  return {
    mobilePwa,
    width,
    height,
    scale: Math.min(width / STAGE_W, height / STAGE_H),
  }
}

export function computeStageLayout(width: number, height: number): StageLayoutState {
  const safeWidth = positive(width) ? width : STAGE_W
  const safeHeight = positive(height) ? height : STAGE_H
  const scale = Math.min(safeWidth / STAGE_W, safeHeight / STAGE_H)
  return {
    width: safeWidth,
    height: safeHeight,
    scale,
    left: (safeWidth - STAGE_W * scale) / 2,
    top: (safeHeight - STAGE_H * scale) / 2,
  }
}

export function readStageViewport(): StageViewportState {
  const vv = window.visualViewport
  const doc = document.documentElement
  return computeStageViewport({
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    visualWidth: vv?.width,
    visualHeight: vv?.height,
    documentWidth: doc.clientWidth,
    documentHeight: doc.clientHeight,
    screenWidth: window.screen?.width,
    screenHeight: window.screen?.height,
    isMobile: isLikelyMobileDevice(),
    isPwa: isPwaInstalled(),
  })
}
