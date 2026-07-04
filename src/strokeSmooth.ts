// Cleans up a freehand street trace into a tidy line: first drop the jitter of individual
// finger samples (Ramer–Douglas–Peucker simplification), then round the remaining corners
// into a smooth curve (Chaikin corner-cutting). Purely local — no network, no map-matching
// against real road geometry — so it always works offline and instantly; it tidies the line
// you drew rather than snapping it to the true street centerline.

export interface LatLng {
  lat: number
  lng: number
}

// ~1.3m at the equator — enough to absorb hand jitter at street-tracing zoom without
// flattening genuine bends in the road.
const SIMPLIFY_EPSILON = 1.2e-5

/** Perpendicular distance from point p to the line through a→b, in lat/lng units. */
function perpDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(p.lng - a.lng, p.lat - a.lat)
  // |cross product| / |a→b|
  const cross = Math.abs(dx * (a.lat - p.lat) - dy * (a.lng - p.lng))
  return cross / len
}

/** Ramer–Douglas–Peucker — keeps only the points that define the line's shape within
    `epsilon`, dropping the dense in-between jitter. Iterative (explicit stack) so a very
    long stroke can't blow the call stack. */
function simplify(points: LatLng[], epsilon: number): LatLng[] {
  if (points.length < 3) return points.slice()
  const keep = new Array<boolean>(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let maxDist = 0
    let idx = -1
    for (let i = start + 1; i < end; i++) {
      const d = perpDistance(points[i], points[start], points[end])
      if (d > maxDist) { maxDist = d; idx = i }
    }
    if (maxDist > epsilon && idx !== -1) {
      keep[idx] = true
      stack.push([start, idx], [idx, end])
    }
  }
  return points.filter((_, i) => keep[i])
}

/** Chaikin corner-cutting: replaces each interior corner with two points 1/4 and 3/4 along
    its adjacent segments, rounding sharp angles into a smooth curve. Endpoints are pinned so
    the street still starts and ends exactly where it was drawn. */
function chaikin(points: LatLng[], iterations: number): LatLng[] {
  let pts = points
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break
    const next: LatLng[] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      next.push({ lat: a.lat * 0.75 + b.lat * 0.25, lng: a.lng * 0.75 + b.lng * 0.25 })
      next.push({ lat: a.lat * 0.25 + b.lat * 0.75, lng: a.lng * 0.25 + b.lng * 0.75 })
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

/** Simplify away finger jitter, then smooth the corners — returns the cleaned trace. Leaves
    a too-short stroke (a tap or a two-point flick) untouched. */
export function smoothStroke(points: LatLng[]): LatLng[] {
  if (points.length < 3) return points
  return chaikin(simplify(points, SIMPLIFY_EPSILON), 2)
}
