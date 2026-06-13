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
  isMobile: boolean
  isPwa: boolean
}

export interface StageViewportState {
  mobilePwa: boolean
  width: number
  height: number
  scale: number
}

function positive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

export function computeStageViewport(input: StageViewportInput): StageViewportState {
  const mobilePwa = input.isMobile && input.isPwa
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
    isMobile: isLikelyMobileDevice(),
    isPwa: isPwaInstalled(),
  })
}
