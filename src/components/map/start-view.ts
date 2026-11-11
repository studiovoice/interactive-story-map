"use client"

/**
 * Where maps open, and where the Home (⌂) button goes.
 *
 * The viewer's *home area* is the place they picked, or else the site's default area
 * (NEXT_PUBLIC_DEFAULT_VIEW), or else, if the site has none, a fit of all points.
 *
 * The "Map starts at" setting (lib/settings.ts):
 *   default  open on the site's default area
 *   last     where the explore map was left (saved on every move, in this browser)
 *   place    the viewer's chosen place (the default area until one is picked)
 *
 * Home: the chosen place in "place" and "last" mode, the default area in "default" mode.
 * Used by the explore map and the new-point map. Story screens follow the story instead.
 */
import type { Map as MlMap } from "maplibre-gl"
import type { Camera, LngLat } from "@/lib/domain/schema"
import { boundsOf } from "@/lib/geo"
import type { PlaceResult } from "@/lib/geocoding/types"
import type { SavedPlace, Settings } from "@/lib/settings"
import { currentCamera } from "./camera"
import type { InitialView } from "./map-view"

const LAST_VIEW_KEY = "voice-story-map:last-view"
const WORLD: InitialView = { center: [-40, 30], zoom: 1.6 }

/** After panning around the globe MapLibre can report a longitude outside ±180. */
const wrapLng = (lng: number) => +(((((lng + 180) % 360) + 360) % 360) - 180).toFixed(6)

export function loadLastView(): Camera | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_VIEW_KEY) ?? "null") as Camera | null
    const ok =
      v &&
      Array.isArray(v.center) &&
      Math.abs(v.center[0]) <= 180 &&
      Math.abs(v.center[1]) <= 90 &&
      typeof v.zoom === "number"
    return ok ? v : null
  } catch {
    return null
  }
}

/** Remember the explore map's view (kept separate from settings: it changes on every move). */
export function saveLastView(map: MlMap) {
  try {
    const cam = currentCamera(map)
    localStorage.setItem(LAST_VIEW_KEY, JSON.stringify({ ...cam, center: [wrapLng(cam.center[0]), cam.center[1]] }))
  } catch {
    // Storage blocked: "Where I left off" just won't remember.
  }
}

export function fitAllView(coords: LngLat[]): InitialView {
  const b = boundsOf(coords)
  return b ? { bounds: b, padding: 60 } : WORLD
}

export function placeView(p: SavedPlace): InitialView {
  if (p.bounds) {
    const [w, s, e, n] = p.bounds
    return {
      bounds: [
        [w, s],
        [e, n],
      ],
      padding: 40,
    }
  }
  return { center: p.center, zoom: p.zoom }
}

/**
 * The site's default area, from NEXT_PUBLIC_DEFAULT_VIEW (inlined at build time):
 * "lng,lat,zoom" for a center, or "west,south,east,north" for an area to fit.
 * NEXT_PUBLIC_DEFAULT_VIEW_LABEL names it in the UI ("New York").
 */
export const siteDefault = parseSiteDefault(
  process.env.NEXT_PUBLIC_DEFAULT_VIEW,
  process.env.NEXT_PUBLIC_DEFAULT_VIEW_LABEL,
)

export function parseSiteDefault(raw: string | undefined, label: string | undefined): SavedPlace | null {
  if (!raw?.trim()) return null
  const n = raw.split(",").map((x) => Number(x.trim()))
  const lngOk = (v: number) => Number.isFinite(v) && Math.abs(v) <= 180
  const latOk = (v: number) => Number.isFinite(v) && Math.abs(v) <= 90
  const name = label?.trim() || "the default area"
  if (n.length === 3 && lngOk(n[0]) && latOk(n[1]) && Number.isFinite(n[2]) && n[2] >= 0 && n[2] <= 22) {
    return { label: name, center: [n[0], n[1]], zoom: n[2] }
  }
  if (n.length === 4 && lngOk(n[0]) && latOk(n[1]) && lngOk(n[2]) && latOk(n[3]) && n[0] < n[2] && n[1] < n[3]) {
    const center: LngLat = [(n[0] + n[2]) / 2, (n[1] + n[3]) / 2]
    return { label: name, center, zoom: 10, bounds: [n[0], n[1], n[2], n[3]] }
  }
  console.warn(`Ignoring NEXT_PUBLIC_DEFAULT_VIEW="${raw}": use "lng,lat,zoom" or "west,south,east,north".`)
  return null
}

/** The site's default area, or a fit of all points when the site has none. */
function defaultArea(coords: LngLat[]): { view: InitialView; label: string } {
  if (siteDefault) return { view: placeView(siteDefault), label: siteDefault.label }
  return { view: fitAllView(coords), label: "all points" }
}

/** Where the Home button goes, and its name. */
export function homeView(settings: Settings, coords: LngLat[]): { view: InitialView; label: string } {
  if (settings.startView !== "default" && settings.startPlace) {
    return { view: placeView(settings.startPlace), label: settings.startPlace.label }
  }
  return defaultArea(coords)
}

/** The view a map opens at, given the viewer's settings and the points it shows. */
export function startView(settings: Settings, coords: LngLat[]): InitialView {
  if (settings.startView === "last") {
    const last = loadLastView()
    if (last) return last
  }
  return homeView(settings, coords).view
}

/** Name of the default area, for the settings menu. */
export const defaultAreaLabel = siteDefault?.label ?? null

export function flyToView(map: MlMap, view: InitialView) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const duration = reduced ? 0 : 1200
  if ("bounds" in view) {
    map.fitBounds(view.bounds, { padding: view.padding ?? 60, maxZoom: 16, duration, bearing: 0, pitch: 0 })
  } else {
    map.flyTo({ ...view, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0, duration })
  }
}

export function savedPlaceFromResult(place: PlaceResult): SavedPlace {
  const label = [place.name, place.context.split(",")[0]?.trim()].filter(Boolean).join(", ")
  const [w, s, e, n] = place.bbox ?? [0, 0, 0, 0]
  // Same rule as flyToPlace: tiny extents read better as a zoom on the center.
  const big = place.bbox && (e - w > 0.0015 || n - s > 0.0015)
  return { label, center: place.center, zoom: 15, ...(big && { bounds: place.bbox! }) }
}

export function savedPlaceFromMap(map: MlMap, label = "Custom view"): SavedPlace {
  const cam = currentCamera(map)
  return { label, center: [wrapLng(cam.center[0]), cam.center[1]], zoom: cam.zoom }
}
