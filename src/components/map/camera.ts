import type { Map as MlMap, PaddingOptions } from "maplibre-gl"
import type { Camera, ChapterWithPoints, LngLat } from "@/lib/domain/schema"
import { boundsOf } from "@/lib/geo"

export const NO_PADDING: PaddingOptions = { top: 0, bottom: 0, left: 0, right: 0 }

type CameraChapter = Pick<ChapterWithPoints, "camera" | "route" | "connection"> & {
  points: { point: { location: LngLat } }[]
}

/**
 * Where the camera should be for a chapter: its saved camera, or a fit of its points
 * and route. Set the map's padding (map.setPadding) first; the fit respects it.
 */
export function chapterCamera(map: MlMap, chapter: CameraChapter): Camera | null {
  if (chapter.camera) return chapter.camera
  const coords = [
    ...chapter.points.map((p) => p.point.location),
    ...(chapter.connection === "path" ? chapter.route : []),
  ]
  const b = boundsOf(coords)
  if (!b) return null
  const cam = map.cameraForBounds(b, { padding: 70, maxZoom: 16.5 })
  if (!cam?.center) return null
  const c = cam.center as { lng: number; lat: number }
  return { center: [c.lng, c.lat], zoom: cam.zoom ?? 15, bearing: 0, pitch: 40 }
}

/** Snapshot the map's current view, e.g. to save as a chapter camera. */
export function currentCamera(map: MlMap): Camera {
  const c = map.getCenter()
  return {
    center: [+c.lng.toFixed(6), +c.lat.toFixed(6)],
    zoom: +map.getZoom().toFixed(2),
    bearing: +map.getBearing().toFixed(1),
    pitch: +map.getPitch().toFixed(1),
  }
}
