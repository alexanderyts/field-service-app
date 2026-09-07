import type { Plugin } from 'vite'

// Content-Security-Policy for the production build (AUDIT F009). Injected as a <meta> tag
// because the app is static hosting (GitHub Pages / Netlify) with no header control.
//
// What it buys: no script can run unless it came from this origin — an injected <script>,
// an inline handler, or eval is refused by the browser. Every outside host the app talks to
// is named, so a compromised dependency can't quietly send data anywhere else.
//
// What it can't buy yet: `style-src` keeps 'unsafe-inline' because React `style={{}}` props
// and Leaflet's positioning both write inline styles; tightening that is a rewrite of every
// component, not a policy change. Scripts are the part that matters, and they are strict.
//
// Applied at BUILD only. The dev server needs an HMR WebSocket and injects its own client,
// neither of which this policy allows — and the built file is the one that ships, so it is
// the one the real-browser check has to exercise (see the sister project's G-031: a CSP that
// silently blocked every inline script, invisible to every test, found only by opening the
// built page in Chromium).
export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  // data: — QR codes render to a data: PNG; also the inline SVGs in index.css.
  // tiles — CartoDB Voyager (street map + labels) and Esri World Imagery (satellite).
  'img-src': ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://server.arcgisonline.com'],
  'font-src': ["'self'"],
  // data: — ShareModal turns the QR data: URL into a File via fetch(), which connect-src governs.
  'connect-src': ["'self'", 'data:', 'https://nominatim.openstreetmap.org', 'https://overpass-api.de'],
  'worker-src': ["'self'"],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
}

export const CSP_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

/** Vite plugin: prepend the CSP <meta> to the built index.html. Build-only by design. */
export function cspPlugin(): Plugin {
  return {
    name: 'meleo-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP_POLICY },
            injectTo: 'head-prepend',
          },
        ],
      }
    },
  }
}
