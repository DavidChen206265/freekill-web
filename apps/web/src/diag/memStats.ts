// memStats.ts — browser memory diagnostics for R-PERF/R-VM acceptance. Reads the
// real browser's memory two ways:
//   - measureUserAgentSpecificMemory(): accurate, but requires crossOriginIsolated
//     (COOP+COEP headers). Returns total bytes broken down by type.
//   - performance.memory (Chrome non-standard): usedJSHeapSize fallback, always
//     available in Chromium without isolation.
// Also counts how many image assets the page has actually fetched (resource timing
// entries under /fk/...), to size the art footprint.

export interface MemSample {
  method: 'measureUserAgent' | 'performance.memory' | 'unavailable'
  totalMB?: number
  jsHeapMB?: number
  detail?: string
  imageCount: number
  imageMB: number
}

interface PerfMemory { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number }
interface UAMemoryBreakdown { bytes: number; types: string[] }
interface UAMemory { bytes: number; breakdown: UAMemoryBreakdown[] }

function imageFootprint(): { count: number; mb: number } {
  try {
    const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    let count = 0, bytes = 0
    for (const e of entries) {
      if (/\/fk\/.*\.(png|jpe?g|webp)(\?|$)/i.test(e.name)) {
        count++
        bytes += e.encodedBodySize || e.transferSize || 0
      }
    }
    return { count, mb: bytes / 1024 / 1024 }
  } catch { return { count: 0, mb: 0 } }
}

export async function sampleMemory(): Promise<MemSample> {
  const img = imageFootprint()
  const base = { imageCount: img.count, imageMB: Math.round(img.mb * 100) / 100 }

  // Prefer the accurate cross-origin-isolated API.
  const measure = (performance as unknown as { measureUserAgentSpecificMemory?: () => Promise<UAMemory> })
    .measureUserAgentSpecificMemory
  if (typeof measure === 'function' && (globalThis as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated) {
    try {
      const r = await measure()
      const top = r.breakdown.filter((b) => b.bytes > 0).sort((a, b) => b.bytes - a.bytes).slice(0, 4)
        .map((b) => `${b.types.join('/') || '?'}:${(b.bytes / 1024 / 1024).toFixed(1)}M`).join(' ')
      return { method: 'measureUserAgent', totalMB: Math.round(r.bytes / 1024 / 1024 * 100) / 100, detail: top, ...base }
    } catch { /* fall through */ }
  }

  // Chrome fallback.
  const pm = (performance as unknown as { memory?: PerfMemory }).memory
  if (pm) {
    return { method: 'performance.memory', jsHeapMB: Math.round(pm.usedJSHeapSize / 1024 / 1024 * 100) / 100,
      detail: `limit ${(pm.jsHeapSizeLimit / 1024 / 1024).toFixed(0)}M`, ...base }
  }

  return { method: 'unavailable', detail: '浏览器不支持内存测量 API', ...base }
}
