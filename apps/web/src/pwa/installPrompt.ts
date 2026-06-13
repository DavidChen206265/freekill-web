import { useCallback, useEffect, useState } from 'react'

type BeforeInstallPromptChoice = { outcome: 'accepted' | 'dismissed'; platform: string }

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptChoice>
}

type NavigatorWithStandalone = Navigator & { standalone?: boolean }

function displayModeMatches(mode: string): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(`(display-mode: ${mode})`).matches
}

export function isPwaInstalled(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = (window.navigator as NavigatorWithStandalone).standalone === true
  return standalone || displayModeMatches('fullscreen') || displayModeMatches('standalone') || displayModeMatches('minimal-ui')
}

export function isLikelyMobileDevice(): boolean {
  if (typeof window === 'undefined') return false
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches
  return coarse || Math.min(window.innerWidth, window.innerHeight) <= 820
}

export function isIosLike(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator
  return /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
}

export function usePwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(() => isPwaInstalled())
  const [mobile, setMobile] = useState(() => isLikelyMobileDevice())

  useEffect(() => {
    const refreshEnvironment = () => {
      setInstalled(isPwaInstalled())
      setMobile(isLikelyMobileDevice())
    }
    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setPromptEvent(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setPromptEvent(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    window.addEventListener('resize', refreshEnvironment)

    const queries = [
      window.matchMedia?.('(display-mode: fullscreen)'),
      window.matchMedia?.('(display-mode: standalone)'),
      window.matchMedia?.('(display-mode: minimal-ui)'),
      window.matchMedia?.('(hover: none) and (pointer: coarse)'),
    ].filter(Boolean) as MediaQueryList[]
    for (const query of queries) query.addEventListener?.('change', refreshEnvironment)
    refreshEnvironment()

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
      window.removeEventListener('resize', refreshEnvironment)
      for (const query of queries) query.removeEventListener?.('change', refreshEnvironment)
    }
  }, [])

  const install = useCallback(async (): Promise<BeforeInstallPromptChoice | null> => {
    if (!promptEvent) return null
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome !== 'accepted') return choice
    setPromptEvent(null)
    setInstalled(true)
    return choice
  }, [promptEvent])

  return {
    canInstall: !!promptEvent && !installed,
    install,
    installed,
    mobile,
    ios: isIosLike(),
  }
}
