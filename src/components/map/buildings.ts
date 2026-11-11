import type { Map as MlMap } from "maplibre-gl"

/**
 * 3D buildings. The OpenFreeMap tiles carry each building's height (`render_height`,
 * `render_min_height`), but the Positron / Dark styles draw buildings flat. This adds an
 * extruded layer on top of the flat one, rising in from zoom 14 to 15.
 * Call after every style load (a theme swap replaces the whole style).
 */
export const BUILDINGS_3D_LAYER = "buildings-3d"

const COLORS = {
  // Close to each style's own flat building colour, a touch darker / lighter so walls read.
  light: "rgb(222, 222, 215)",
  dark: "rgb(48, 48, 54)",
}

export function addBuildings3d(map: MlMap, dark: boolean) {
  if (map.getLayer(BUILDINGS_3D_LAYER)) return
  // Only for styles built on OpenMapTiles data (both OpenFreeMap styles are).
  if (!map.getSource("openmaptiles")) return
  // Above every shape layer (roads, water, flat buildings) and below the labels that come after them, so
  // names stay readable. Not simply "before the first label": the Dark style has a water label near the bottom.
  const layers = map.getStyle().layers
  const lastShape = layers.findLastIndex((l) => l.type !== "symbol")
  const firstLabel = layers.slice(lastShape + 1).find((l) => l.type === "symbol")?.id
  map.addLayer(
    {
      id: BUILDINGS_3D_LAYER,
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "building",
      minzoom: 14,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": dark ? COLORS.dark : COLORS.light,
        "fill-extrusion-height": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          15,
          ["coalesce", ["get", "render_height"], 0],
        ],
        "fill-extrusion-base": [
          "interpolate",
          ["linear"],
          ["zoom"],
          14,
          0,
          15,
          ["coalesce", ["get", "render_min_height"], 0],
        ],
        "fill-extrusion-opacity": 0.9,
      },
    },
    firstLabel,
  )
}

export function removeBuildings3d(map: MlMap) {
  if (map.getLayer(BUILDINGS_3D_LAYER)) map.removeLayer(BUILDINGS_3D_LAYER)
}
