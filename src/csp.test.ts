import { describe, it, expect } from 'vitest'
import { CSP_DIRECTIVES, CSP_POLICY, cspPlugin } from './csp'

// AUDIT F009. The policy is a string nobody reads twice, so these pin the parts that would be
// easy to loosen "just to make something work" and hard to notice afterwards.

describe('Content-Security-Policy', () => {
  it("allows scripts from this origin only — no inline, no eval, no other host", () => {
    expect(CSP_DIRECTIVES['script-src']).toEqual(["'self'"])
    expect(CSP_POLICY).not.toMatch(/script-src[^;]*unsafe/)
  })

  it('names every outside host the app actually talks to, and nothing broader', () => {
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://nominatim.openstreetmap.org')
    expect(CSP_DIRECTIVES['connect-src']).toContain('https://overpass-api.de')
    expect(CSP_DIRECTIVES['img-src']).toContain('https://*.basemaps.cartocdn.com')
    expect(CSP_DIRECTIVES['img-src']).toContain('https://server.arcgisonline.com')
    for (const sources of Object.values(CSP_DIRECTIVES)) {
      expect(sources).not.toContain('*')
      expect(sources).not.toContain('https:')
    }
  })

  // The two data: allowances are load-bearing: QR codes are data: images, and ShareModal
  // fetch()es that data: URL to build a shareable file. Drop either and sharing breaks silently.
  it('keeps the data: allowances the share flow depends on', () => {
    expect(CSP_DIRECTIVES['img-src']).toContain('data:')
    expect(CSP_DIRECTIVES['connect-src']).toContain('data:')
  })

  it('forbids plugins, base-tag hijacking and off-origin form posts', () => {
    expect(CSP_DIRECTIVES['object-src']).toEqual(["'none'"])
    expect(CSP_DIRECTIVES['base-uri']).toEqual(["'self'"])
    expect(CSP_DIRECTIVES['form-action']).toEqual(["'self'"])
  })

  it('is a build-only plugin that prepends one meta tag to the head', () => {
    const plugin = cspPlugin()
    expect(plugin.apply).toBe('build')
    const hook = plugin.transformIndexHtml as (html: string) => { html: string; tags: { tag: string; attrs: Record<string, string>; injectTo: string }[] }
    const result = hook('<html></html>')
    expect(result.tags).toHaveLength(1)
    expect(result.tags[0]).toMatchObject({ tag: 'meta', injectTo: 'head-prepend' })
    expect(result.tags[0].attrs['http-equiv']).toBe('Content-Security-Policy')
    expect(result.tags[0].attrs.content).toBe(CSP_POLICY)
  })
})
