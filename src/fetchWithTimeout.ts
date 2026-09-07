/**
 * `fetch` with a client-side timeout. Plain `fetch` has no way to distinguish "the network is
 * slow" from "this socket will never resolve" — and a server-side query timeout (e.g.
 * Overpass's own `[timeout:20]`) only bounds how long the SERVER works; it does nothing if the
 * response itself never arrives. Every external request in this app goes through this so a
 * flaky connection fails loudly instead of leaving a "Loading…" state stuck forever
 * (`REVIEW.md` F-C1).
 */
export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
