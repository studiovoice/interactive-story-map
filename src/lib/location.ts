/**
 * Approximate and privacy-obscured locations.
 * Pure helpers, safe on client and server. The obscuring itself happens server-side in
 * `normalizePointLocation`, which every create/update goes through.
 */
import type { LngLat, LocationPrecision, Point } from "@/lib/domain/schema"

/** Radius presets offered in the point form. */
export const RADIUS_PRESETS = [50, 100, 250, 500, 1000, 2000] as const
export const DEFAULT_APPROX_RADIUS = 100
/** Obscured areas smaller than this barely hide anything. */
export const MIN_OBSCURED_RADIUS = 250
export const DEFAULT_OBSCURED_RADIUS = 500

const M_PER_DEG_LAT = 110_540
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180)

export function formatMeters(m: number): string {
  if (m >= 1000) return `${+(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

export function isFuzzy(p: Pick<Point, "locationPrecision">) {
  return p.locationPrecision !== "exact"
}

/** "Exact", "Approximate, within ~250 m", "Hidden for privacy, ~1 km area" */
export function locationPrecisionLabel(p: Pick<Point, "locationPrecision" | "locationRadiusM">): string {
  const r = p.locationRadiusM ? formatMeters(p.locationRadiusM) : null
  switch (p.locationPrecision) {
    case "approximate":
      return r ? `Approximate, within ~${r}` : "Approximate"
    case "obscured":
      return r ? `Hidden for privacy, ~${r} area` : "Hidden for privacy"
    default:
      return "Exact"
  }
}

/** Move `center` by `distanceM` in direction `bearingRad` (0 = north). */
export function offset(center: LngLat, distanceM: number, bearingRad: number): LngLat {
  const dy = Math.cos(bearingRad) * distanceM
  const dx = Math.sin(bearingRad) * distanceM
  const lat = center[1] + dy / M_PER_DEG_LAT
  const lng = center[0] + dx / mPerDegLng(center[1])
  return [+lng.toFixed(6), +lat.toFixed(6)]
}

/** A closed ring approximating a circle, for drawing the area on the map. */
export function circleRing(center: LngLat, radiusM: number, steps = 48): LngLat[] {
  const ring: LngLat[] = []
  for (let i = 0; i <= steps; i++) ring.push(offset(center, radiusM, (i / steps) * 2 * Math.PI))
  return ring
}

/** GeoJSON polygons for every point with a fuzzy location. */
export function areaFeatures(points: Pick<Point, "id" | "location" | "locationPrecision" | "locationRadiusM">[]) {
  return {
    type: "FeatureCollection" as const,
    features: points
      .filter((p) => p.locationPrecision !== "exact" && p.locationRadiusM)
      .map((p) => ({
        type: "Feature" as const,
        properties: { id: p.id, obscured: p.locationPrecision === "obscured" },
        geometry: { type: "Polygon" as const, coordinates: [circleRing(p.location, p.locationRadiusM!)] },
      })),
  }
}

type LocationFields = { location: LngLat; locationPrecision: LocationPrecision; locationRadiusM: number | null }

/**
 * Make the location fields consistent, and obscure the location when asked.
 *
 * For `obscured`, the submitted pin is treated as the true spot: we store a center moved
 * a random distance (up to 70% of the radius) in a random direction, so the circle still
 * contains the true spot but isn't centred on it. We only shift when the pin was moved or the
 * point just became obscured. Re-saving (or only changing the radius) keeps the stored center,
 * so the point doesn't drift further from the true spot on every edit.
 */
export function normalizePointLocation(next: LocationFields, previous?: LocationFields): LocationFields {
  if (next.locationPrecision === "exact") return { ...next, locationRadiusM: null }

  if (next.locationPrecision === "approximate") {
    return { ...next, locationRadiusM: next.locationRadiusM ?? DEFAULT_APPROX_RADIUS }
  }

  const radius = Math.max(next.locationRadiusM ?? DEFAULT_OBSCURED_RADIUS, MIN_OBSCURED_RADIUS)
  const unchanged =
    previous?.locationPrecision === "obscured" &&
    previous.location[0] === next.location[0] &&
    previous.location[1] === next.location[1]
  if (unchanged) return { ...next, locationRadiusM: radius }

  // sqrt for an even spread over the disc rather than bunching near the middle.
  const distance = Math.sqrt(Math.random()) * radius * 0.7
  const bearing = Math.random() * 2 * Math.PI
  return { location: offset(next.location, distance, bearing), locationPrecision: "obscured", locationRadiusM: radius }
}
