// Snaps a hand-placed set of waypoints onto real OpenStreetMap road geometry so a traced
// street follows the true centerline instead of straight lines between taps. Roads are
// fetched from the Overpass API (same OSM ecosystem + privacy profile as the Nominatim
// reverse-geocode already done at trace time — only coordinates are sent, no identity).
// Everything degrades gracefully: no network, no nearby road, or too few points all fall
// back to the raw waypoints the user placed.

export interface LatLng {
  lat: number
  lng: number
}

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
// Drivable/walkable named streets — excludes footways/paths/cycleways so we don't snap a
// street trace onto a sidewalk running alongside it.
const HIGHWAY_RE = '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|road)(_link)?$'
// ~40m, expressed in degrees of latitude, used both to pad the query bbox and to decide
// whether a waypoint is close enough to a road to snap.
const SNAP_M = 40
const M_PER_DEG = 111_320
const SNAP_DEG = SNAP_M / M_PER_DEG

/** Fetches nearby road ways as arrays of lat/lng vertices. Returns [] on any failure so the
    caller can fall back to the raw path. */
export async function fetchRoadsNear(points: LatLng[]): Promise<LatLng[][]> {
  if (points.length === 0) return []
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity
  for (const p of points) {
    minLat = Math.min(minLat, p.lat); maxLat = Math.max(maxLat, p.lat)
    minLng = Math.min(minLng, p.lng); maxLng = Math.max(maxLng, p.lng)
  }
  const cosLat = Math.cos((minLat * Math.PI) / 180) || 1
  const padLat = SNAP_DEG
  const padLng = SNAP_DEG / cosLat
  const bbox = `${minLat - padLat},${minLng - padLng},${maxLat + padLat},${maxLng + padLng}`
  const query = `[out:json][timeout:20];way["highway"~"${HIGHWAY_RE}"](${bbox});out geom;`
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(query),
    })
    if (!res.ok) return []
    const data = await res.json()
    const ways: LatLng[][] = []
    for (const el of data?.elements ?? []) {
      if (el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2) {
        ways.push(el.geometry.map((g: { lat: number; lon: number }) => ({ lat: g.lat, lng: g.lon })))
      }
    }
    return ways
  } catch {
    return []
  }
}

interface XY { x: number; y: number }

/** Projection of a point onto a polyline: perpendicular distance, the projected point, and
    its arc-length position along the line — all in the local planar units below. */
interface Projection { dist: number; pos: number; point: LatLng }

function projectOntoWay(p: XY, toLL: (xy: XY) => LatLng, xy: XY[], cum: number[]): Projection {
  let best: Projection | null = null
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i], b = xy[i + 1]
    const dx = b.x - a.x, dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    const projX = a.x + t * dx, projY = a.y + t * dy
    const dist = Math.hypot(p.x - projX, p.y - projY)
    if (!best || dist < best.dist) {
      const segLen = Math.sqrt(len2)
      best = { dist, pos: cum[i] + t * segLen, point: toLL({ x: projX, y: projY }) }
    }
  }
  return best!
}

/** Snaps the placed waypoints onto the best-fitting nearby road, segment by segment, pulling
    in the road's own vertices between snapped points so the trace follows real curves. Any
    segment with no road within ~40m stays a straight line between the two waypoints. */
export function snapPathToRoads(waypoints: LatLng[], ways: LatLng[][]): LatLng[] {
  if (waypoints.length < 2 || ways.length === 0) return waypoints
  const lat0 = waypoints[0].lat
  const cosLat = Math.cos((lat0 * Math.PI) / 180) || 1
  const toXY = (p: LatLng): XY => ({ x: p.lng * cosLat, y: p.lat })
  const toLL = (xy: XY): LatLng => ({ lat: xy.y, lng: xy.x / cosLat })

  // Precompute each way in planar coords with cumulative arc-length.
  const prepared = ways.map((w) => {
    const xy = w.map(toXY)
    const cum: number[] = [0]
    for (let i = 1; i < xy.length; i++) cum[i] = cum[i - 1] + Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y)
    return { w, xy, cum }
  })

  const out: LatLng[] = []
  const pushDedup = (p: LatLng) => {
    const last = out[out.length - 1]
    if (!last || Math.abs(last.lat - p.lat) > 1e-9 || Math.abs(last.lng - p.lng) > 1e-9) out.push(p)
  }

  for (let s = 0; s < waypoints.length - 1; s++) {
    const A = waypoints[s], B = waypoints[s + 1]
    const axy = toXY(A), bxy = toXY(B)
    let bestWay: (typeof prepared)[number] | null = null
    let bestA: Projection | null = null
    let bestB: Projection | null = null
    let bestScore = Infinity
    for (const pw of prepared) {
      const pa = projectOntoWay(axy, toLL, pw.xy, pw.cum)
      const pb = projectOntoWay(bxy, toLL, pw.xy, pw.cum)
      const score = pa.dist + pb.dist
      if (score < bestScore) { bestScore = score; bestWay = pw; bestA = pa; bestB = pb }
    }

    if (bestWay && bestA && bestB && Math.max(bestA.dist, bestB.dist) <= SNAP_DEG) {
      pushDedup(bestA.point)
      const startPos = bestA.pos, endPos = bestB.pos
      const forward = endPos >= startPos
      const lo = Math.min(startPos, endPos), hi = Math.max(startPos, endPos)
      const between: { pos: number; ll: LatLng }[] = []
      for (let i = 0; i < bestWay.w.length; i++) {
        if (bestWay.cum[i] > lo + 1e-9 && bestWay.cum[i] < hi - 1e-9) between.push({ pos: bestWay.cum[i], ll: bestWay.w[i] })
      }
      between.sort((x, y) => (forward ? x.pos - y.pos : y.pos - x.pos))
      for (const v of between) pushDedup(v.ll)
      pushDedup(bestB.point)
    } else {
      // No road near this segment — keep the user's own two points.
      pushDedup(A)
      pushDedup(B)
    }
  }

  return out.length >= 2 ? out : waypoints
}
