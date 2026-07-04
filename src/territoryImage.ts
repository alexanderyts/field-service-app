// A schematic (not photographic) rendering of one or more traced streets — used for both
// the single-stroke trace preview (right after drawing) and the combined multi-street
// territory image. Deliberately draws only the traced shapes on a plain canvas, with no
// map tiles or other external images involved: capturing the real Leaflet map (e.g. via
// html2canvas) risks a cross-origin "tainted canvas" failure depending on the tile CDN's
// CORS headers, which this approach can't hit since nothing is loaded from elsewhere.

export interface CanvasPoint {
  lat: number
  lng: number
}

export const STREET_COLORS = ['#2f6f5e', '#d97a3e', '#6d5dd3', '#c1587a', '#3b82a6', '#a68a3b']

/** Normalizes every street's points to one shared bounding box (preserving aspect ratio,
    centered, with padding) and draws each as a colored polyline on an off-screen canvas.
    Returns a PNG data URL. */
export function renderStreetsImage(
  streets: { points: CanvasPoint[]; name?: string }[],
  options?: { width?: number; height?: number }
): string {
  const width = options?.width ?? 320
  const height = options?.height ?? 240
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f3f1ec'
  ctx.fillRect(0, 0, width, height)

  const allPoints = streets.flatMap((s) => s.points)
  if (allPoints.length === 0) {
    ctx.strokeStyle = '#d8d3c8'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1)
    return canvas.toDataURL('image/png')
  }

  const lats = allPoints.map((p) => p.lat)
  const lngs = allPoints.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const latSpan = Math.max(maxLat - minLat, 0.0001)
  const lngSpan = Math.max(maxLng - minLng, 0.0001)

  const padding = 20
  const innerW = width - padding * 2
  const innerH = height - padding * 2
  // Fit to whichever axis is more constrained, then center the drawing on the other —
  // otherwise a long, thin street would get stretched to fill a square canvas.
  const scale = Math.min(innerW / lngSpan, innerH / latSpan)
  const drawnW = lngSpan * scale
  const drawnH = latSpan * scale
  const offsetX = padding + (innerW - drawnW) / 2
  const offsetY = padding + (innerH - drawnH) / 2

  function project(p: CanvasPoint): [number, number] {
    const x = offsetX + (p.lng - minLng) * scale
    const y = offsetY + (maxLat - p.lat) * scale // latitude increases northward — canvas y grows downward
    return [x, y]
  }

  streets.forEach((s, i) => {
    if (s.points.length < 2) return
    ctx.strokeStyle = STREET_COLORS[i % STREET_COLORS.length]
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    const [sx, sy] = project(s.points[0])
    ctx.moveTo(sx, sy)
    for (const p of s.points.slice(1)) {
      const [x, y] = project(p)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  })

  // Street-name labels drawn over the schematic, so a traced line is still identifiable.
  streets.forEach((s, i) => {
    if (s.points.length < 2 || !s.name) return
    const [mx, my] = project(s.points[Math.floor(s.points.length / 2)])
    ctx.font = '600 11px system-ui, -apple-system, sans-serif'
    ctx.textBaseline = 'middle'
    const textW = Math.min(ctx.measureText(s.name).width, width - 16)
    const boxW = textW + 8
    const boxH = 16
    let bx = mx - boxW / 2
    bx = Math.max(3, Math.min(bx, width - boxW - 3))
    const by = Math.max(3, Math.min(my - boxH / 2, height - boxH - 3))
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(bx, by, boxW, boxH)
    ctx.fillStyle = STREET_COLORS[i % STREET_COLORS.length]
    ctx.save()
    ctx.beginPath()
    ctx.rect(bx, by, boxW, boxH)
    ctx.clip()
    ctx.textAlign = 'center'
    ctx.fillText(s.name, bx + boxW / 2, by + boxH / 2 + 0.5)
    ctx.restore()
  })

  ctx.strokeStyle = '#d8d3c8'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1)

  return canvas.toDataURL('image/png')
}
