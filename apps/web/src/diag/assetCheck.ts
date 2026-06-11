// assetCheck.ts — client-side asset integrity self-check (W1-RES ②). Fetches the four
// /fk manifests, enumerates every asset that SHOULD exist (shared enumerator, same one
// the deploy verifier uses), and HEAD-probes each to find 404/500/network failures.
// HEAD only — no downloads. Surfaces silent asset breakage (the gamebg-404 /
// guding_blade-500 class) as a concrete list instead of console noise.

import { enumerateAssets, type AssetManifests } from '@freekill-web/assets/enumerate'

const FK = '/fk'

export interface AssetProblem { url: string; status: number | string }
export interface AssetCheckResult {
  checked: number
  problems: AssetProblem[]
  startedAt: number
  ms: number
}

async function fetchJson(rel: string): Promise<unknown> {
  try {
    const r = await fetch(`${FK}/${rel}`, { cache: 'no-store' })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Probe one asset with HEAD; bypass the SW/browser cache so we see the SERVER's
 *  real status (a SWR-cached 200 would otherwise mask a now-404). Returns null if OK,
 *  or the problem status (404/500/0/'err'). */
async function probe(rel: string): Promise<AssetProblem | null> {
  const url = `${FK}/${rel}`
  try {
    const r = await fetch(`${url}?_ck=${Date.now()}`, { method: 'HEAD', cache: 'no-store' })
    return r.ok ? null : { url, status: r.status }
  } catch {
    return { url, status: 'network-error' }
  }
}

/** Run the integrity check. `concurrency` caps in-flight HEADs (default 24).
 *  `onProgress(done,total)` is called as probes complete. */
export async function checkAssets(opts: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<AssetCheckResult> {
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
  const problems: AssetProblem[] = []
  const concurrency = Math.max(1, opts.concurrency ?? 24)

  let next = 0, done = 0
  async function worker() {
    while (next < paths.length) {
      const i = next++
      const p = await probe(paths[i]!)
      if (p) problems.push(p)
      done++
      opts.onProgress?.(done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker))

  return { checked: total, problems, startedAt, ms: Date.now() - startedAt }
}
