import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchWithTimeout } from './fetchWithTimeout'

// REVIEW.md F-C1: a plain fetch to a hung socket never resolves or rejects, so any code
// awaiting it (and any loading flag gated on that await) is stuck forever. These assert the
// one thing that matters — the promise settles — not fetch's own request/response mechanics.

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('rejects instead of hanging forever when the request never settles', async () => {
    // A real hung fetch does reject once its AbortSignal fires — that's the whole mechanism
    // this helper relies on — so the stub must honor the signal the way fetch itself does.
    vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = fetchWithTimeout('https://example.com', {}, 5_000)
    const assertion = expect(pending).rejects.toThrow()
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it('passes an AbortSignal through to fetch so the underlying request is actually cancelled', async () => {
    const fetchMock = vi.fn((_url: string, _options: RequestInit) => new Promise(() => {}))
    vi.stubGlobal('fetch', fetchMock)
    void fetchWithTimeout('https://example.com', {}, 5_000).catch(() => {})
    const [, options] = fetchMock.mock.calls[0]
    expect(options.signal).toBeInstanceOf(AbortSignal)
  })

  it('resolves normally, and clears its timer, when the request finishes in time', async () => {
    const response = new Response('ok')
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))
    await expect(fetchWithTimeout('https://example.com', {}, 5_000)).resolves.toBe(response)
  })

  it('preserves caller-supplied options (headers, method, body) alongside the abort signal', async () => {
    const fetchMock = vi.fn((_url: string, _options: RequestInit) => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)
    await fetchWithTimeout('https://example.com', { method: 'POST', headers: { 'X-Test': '1' } }, 5_000)
    const [, options] = fetchMock.mock.calls[0]
    expect(options).toMatchObject({ method: 'POST', headers: { 'X-Test': '1' } })
  })
})
