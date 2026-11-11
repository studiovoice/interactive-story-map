import type { LngLat } from "@/lib/domain/schema"

/** Approximate metres between two points (equirectangular; plenty for city-scale routes). */
export function distance(a: LngLat, b: LngLat): number {
  const latRad = (((a[1] + b[1]) / 2) * Math.PI) / 180
  const dx = (a[0] - b[0]) * 111_320 * Math.cos(latRad)
  const dy = (a[1] - b[1]) * 110_540
  return Math.hypot(dx, dy)
}

export type MeasuredLine = { coords: LngLat[]; cum: number[]; total: number }

export function measure(coords: LngLat[]): MeasuredLine {
  const cum = [0]
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + distance(coords[i - 1], coords[i]))
  return { coords, cum, total: cum.at(-1) ?? 0 }
}

/** The first `f` (0..1, by distance) of a line. Always returns at least 2 coordinates. */
export function sliceLine(line: MeasuredLine, f: number): LngLat[] {
  const { coords, cum, total } = line
  if (coords.length < 2) return coords
  const d = Math.min(1, Math.max(0, f)) * total
  const out: LngLat[] = [coords[0]]
  for (let i = 1; i < coords.length; i++) {
    if (cum[i] <= d) {
      out.push(coords[i])
      continue
    }
    const span = cum[i] - cum[i - 1] || 1
    const s = (d - cum[i - 1]) / span
    out.push([
      coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * s,
      coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * s,
    ])
    break
  }
  if (out.length < 2) out.push(out[0])
  return out
}

/** Fraction (0..1, by distance) along the line of the nearest spot to `p`. */
export function projectOntoLine(line: MeasuredLine, p: LngLat): number {
  const { coords, cum, total } = line
  if (coords.length < 2 || total === 0) return 0
  const latRad = (p[1] * Math.PI) / 180
  const kx = 111_320 * Math.cos(latRad)
  const ky = 110_540
  let best = Infinity
  let bestD = 0
  for (let i = 1; i < coords.length; i++) {
    const ax = coords[i - 1][0] * kx,
      ay = coords[i - 1][1] * ky
    const bx = coords[i][0] * kx,
      by = coords[i][1] * ky
    const px = p[0] * kx,
      py = p[1] * ky
    const dx = bx - ax,
      dy = by - ay
    const len2 = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    const qx = ax + dx * t,
      qy = ay + dy * t
    const dist = Math.hypot(px - qx, py - qy)
    if (dist < best) {
      best = dist
      bestD = cum[i - 1] + (cum[i] - cum[i - 1]) * t
    }
  }
  return bestD / total
}

export type Bounds = [[number, number], [number, number]]

export function boundsOf(coords: LngLat[]): Bounds | null {
  if (!coords.length) return null
  let w = Infinity,
    s = Infinity,
    e = -Infinity,
    n = -Infinity
  for (const [x, y] of coords) {
    w = Math.min(w, x)
    s = Math.min(s, y)
    e = Math.max(e, x)
    n = Math.max(n, y)
  }
  return [
    [w, s],
    [e, n],
  ]
}

export const lineFeature = (coordinates: LngLat[]) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates },
})

/** Reads `lat` and `lng` query params; undefined unless both are present and valid. */
export function lngLatFromParams(sp: URLSearchParams): LngLat | undefined {
  if (!sp.has("lat") || !sp.has("lng")) return undefined
  const lat = Number(sp.get("lat"))
  const lng = Number(sp.get("lng"))
  const ok = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return ok ? [lng, lat] : undefined
}
