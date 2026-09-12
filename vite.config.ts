import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { cspPlugin } from './src/csp.ts'

// Netlify serves this at the domain root ('/'), but GitHub Pages serves a project repo
// at '/<repo-name>/' — set GH_PAGES=1 (only in the gh-pages deploy script) so asset URLs,
// the PWA manifest, and the service worker's scope all resolve correctly there too.
const base = process.env.GH_PAGES ? '/field-service-app/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    cspPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Meleo',
        short_name: 'Meleo',
        description: 'Track ministry time, contacts, and territory visits',
        theme_color: '#2f6f5e',
        background_color: '#f3f1ec',
        display: 'standalone',
        // When a link (e.g. a scanned share QR) is opened and Meleo is already installed,
        // focus/navigate the existing installed window instead of spawning a new browser tab.
        // Chromium-only; iOS ignores it (a scanned URL can't be routed into an installed PWA
        // there — that needs the native build). See QR-PWA-NOTES.md.
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
        // Unlike start_url/scope (which vite-plugin-pwa derives from `base` itself),
        // icon paths are used as given — so they need the same base prefix by hand,
        // or they'd 404 under GitHub Pages' '/field-service-app/' subpath.
        icons: [
          { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
          { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The PDF form template (555 kB) and pdf-lib are no longer precached — they serve one
        // rarely-used flow (the aux-pioneer slip), so they cache on first use instead of
        // doubling every install's download (AUDIT F043).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webp}'],
        globIgnores: ['**/es-*.js'],
        runtimeCaching: [
          {
            // Esri map tiles: cache what's been looked at so the Map and territory previews
            // still render offline for areas worked recently. Bounded so it can't grow forever.
            urlPattern: ({ url }) => url.hostname === 'server.arcgisonline.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'map-tiles',
              expiration: { maxEntries: 800, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // The aux-pioneer PDF template + pdf-lib chunk: cache on first use.
            urlPattern: ({ url }) => /S-205b.*\.pdf$/.test(url.pathname) || /\/es-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'aux-slip', expiration: { maxEntries: 4, maxAgeSeconds: 90 * 24 * 3600 } },
          },
        ],
        // Nominatim/Overpass are intentionally NOT cached — results are address-specific and
        // their usage policies forbid it.
      },
    }),
  ],
})
