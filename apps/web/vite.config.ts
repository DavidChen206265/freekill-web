import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // PWA: installable app + a service worker that caches the /fk/ game assets
    // (audio / sprites / general+card art / extension-pack lua, ~53MB across 2000+
    // files). The assets are large and flaky to fetch on first load — StaleWhile-
    // Revalidate runtime caching serves them from cache instantly (fixing the
    // "missing voice/animation" issue) while refetching in the background so updated
    // bytes land. See the runtimeCaching note for why NOT CacheFirst.
    // without precaching all 53MB up front.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Dev server keeps the SW OFF so HMR isn't poisoned by caching; the SW only
      // ships in `vite build` output (verify via `vite preview` / Caddy).
      devOptions: { enabled: false },
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'FreeKill Web 新月杀',
        short_name: '新月杀',
        description: 'FreeKill 三国杀 Web 客户端',
        lang: 'zh-CN',
        theme_color: '#1a1a1f',
        background_color: '#1a1a1f',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell precache: hashed JS/CSS + index.html ONLY. Explicitly EXCLUDE the
        // 53MB /fk tree from precache (it's runtime-cached on demand below).
        globPatterns: ['**/*.{js,css,html,woff2}'],
        globIgnores: ['**/fk/**'],
        navigateFallback: '/index.html',
        // Allow large single assets (some sprite sheets / audio) into the cache.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        runtimeCaching: [
          {
            // Game assets: /fk/** (lua, json, images, audio, anim frames). Use
            // StaleWhileRevalidate, NOT CacheFirst: serve from cache instantly (fixes
            // the flaky-first-load → missing voice/animation problem) AND refetch in
            // the background so updated bytes land within one extra load. CacheFirst
            // would pin stale bytes forever — the SAME bug the Caddy /fk no-cache fix
            // (commit 72415ef) had to solve, because fk filenames are NOT content-
            // hashed (jink.mp3 stays jink.mp3 even when its bytes change). SWR + Caddy
            // ETag revalidation keep the SW cache self-updating with no manual purge.
            urlPattern: ({ url }) => url.pathname.startsWith('/fk/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fk-assets',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  // host: true binds all interfaces (IPv4 0.0.0.0 + IPv6) so http://localhost,
  // http://127.0.0.1 and the LAN IP all work. The default bound IPv6-only, which
  // broke browsers resolving localhost to 127.0.0.1 ("can't connect").
  server: { host: true, port: 5173 },
})
