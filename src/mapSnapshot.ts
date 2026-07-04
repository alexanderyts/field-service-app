import type { Map as LeafletMap } from 'leaflet'

// Captures a real picture of the map tiles under a freshly-traced street: renders the live
// Leaflet map's DOM to a canvas (html-to-image, lazy-loaded), then draws the traced line and
// the street's name on top. The CARTO tiles are loaded with crossOrigin so the canvas stays
// exportable. Best-effort: any failure (a tainted tile, an unsupported browser) returns null
// and the caller falls back to the schematic renderer.

export interface LatLng {
  lat: number
  lng: number
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Draws a rounded label chip centered horizontally on (cx, cy), clamped inside the canvas. */
function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, canvasW: number) {
  ctx.font = '600 14px system-ui, -apple-system, sans-serif'
  const padX = 8
  const textW = Math.min(ctx.measureText(text).width, canvasW - 24)
  const w = textW + padX * 2
  const h = 22
  let x = cx - w / 2
  x = Math.max(6, Math.min(x, canvasW - w - 6))
  const y = Math.max(6, cy - h - 8)
  ctx.fillStyle = 'rgba(20, 24, 28, 0.82)'
  roundRect(ctx, x, y, w, h, 7)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  // Clip long names to the chip width.
  ctx.save()
  roundRect(ctx, x, y, w, h, 7)
  ctx.clip()
  ctx.fillText(text, x + w / 2, y + h / 2 + 1)
  ctx.restore()
}

export async function captureTraceSnapshot(map: LeafletMap, points: LatLng[], label: string): Promise<string | null> {
  if (points.length < 2) return null
  try {
    const container = map.getContainer()
    const { toCanvas } = await import('html-to-image')
    // pixelRatio 1 so canvas pixels line up 1:1 with Leaflet's CSS-pixel container coords,
    // letting us project lat/lng straight onto the captured canvas. Zoom/attribution controls
    // are filtered out so they don't clutter the snapshot.
    const canvas = await toCanvas(container, {
      pixelRatio: 1,
      cacheBust: false,
      filter: (node) =>
        !(node instanceof HTMLElement && node.classList.contains('leaflet-control-container')),
    })
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // The traced street, drawn on top of the real tiles.
    ctx.lineWidth = 5
    ctx.strokeStyle = '#d97a3e'
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    points.forEach((p, i) => {
      const pt = map.latLngToContainerPoint([p.lat, p.lng])
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    })
    ctx.stroke()

    const midLL = points[Math.floor(points.length / 2)]
    const mid = map.latLngToContainerPoint([midLL.lat, midLL.lng])
    drawLabel(ctx, label, mid.x, mid.y, canvas.width)

    return canvas.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}
