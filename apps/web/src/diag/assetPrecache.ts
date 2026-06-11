// assetPrecache.ts — OPTIONAL full-asset precache (W1-RES ③). Off by default. When the
// user opts in (they want offline / zero-hitch play), download EVERY asset the manifests
// list so the SW (StaleWhileRevalidate, fk-assets cache) holds the full /fk tree. This
// deliberately fights the project's selective/lazy-load default (R-PERF: ~53MB, 2000+
// files), so it's a toggle, never automatic. Uses GET (populates the SW cache, unlike
// the HEAD-only self-check) with bounded concurrency; failures are collected, not fatal.

import { enumerateAssets, type AssetManifests } from '@freekill-web/assets/enumerate'

const FK = '/fk'
const PRECACHE_KEY = 'fk_precache_all'

export function isPrecacheEnabled(): boolean {
  try { return localStorage.getItem(PRECACHE_KEY) === '1' } catch { return false }
}
export function setPrecacheEnabled(on: boolean): void {
  try { localStorage.setItem(PRECACHE_KEY, on ? '1' : '0') } catch { /* ignore */ }
}

export interface PrecacheResult { total: number; ok: number; failed: { url: string; status: number | string }[]; ms: number }

async function fetchJson(rel: string): Promise<unknown> {
  try { const r = await fetch(`${FK}/${rel}`, { cache: 'no-store' }); return r.ok ? await r.json() : null } catch { return null }
}

let running = false

/** Download all enumerated assets (GET → SW cache). `onProgress(done,total)` ticks per
 *  asset. Re-entrant-safe (a second call while one runs is a no-op returning null). */
export async function precacheAll(opts: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<PrecacheResult | null> {
  if (running) return null
  running = true
  try {
    const startedAt = Date.now()
    const [audio, images, anim, fileList] = await Promise.all([
      fetchJson('audio.json'), fetchJson('images.json'), fetchJson('anim.json'), fetchJson('file-list.json'),
    ])
    const manifests: AssetManifests = {
      audio: Array.isArray(audio) ? (audio as string[]) : [],
      images: Array.isArray(images) ? (images as string[]) : [],
      anim: anim && typeof anim === 'object' ? (anim as Record<string, number>) : {},
      fileList: fileList && typeof fileList === 'object' ? (fileList as AssetManifests['fileList']) : undefined,
    }
    const paths = enumerateAssets(manifests)
    const total = paths.length
    const failed: { url: string; status: number | string }[] = []
    let ok = 0, done = 0
    const concurrency = Math.max(1, opts.concurrency ?? 16)

    let next = 0
    async function worker() {
      while (next < paths.length) {
        const i = next++
        const url = `${FK}/${paths[i]!}`
        try {
          const r = await fetch(url) // GET (default cache) → SW StaleWhileRevalidate stores it
          if (r.ok) ok++; else failed.push({ url, status: r.status })
        } catch { failed.push({ url, status: 'network-error' }) }
        done++
        opts.onProgress?.(done, total)
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker))
    return { total, ok, failed, ms: Date.now() - startedAt }
  } finally { running = false }
}
