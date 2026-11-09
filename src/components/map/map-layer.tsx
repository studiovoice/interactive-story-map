"use client"

import type { GeoJSONSource, GeoJSONSourceSpecification, LayerSpecification } from "maplibre-gl"
import { useEffect, useRef } from "react"
import { useMap } from "./map-view"

type LayerDef = Omit<LayerSpecification & { type: "line" | "circle" | "fill" }, "source" | "id"> & { id: string }

/**
 * A GeoJSON source plus one or more layers drawn from it. Re-adds itself after
 * a basemap style change; updates data and paint in place.
 */
export function MapLayer({
  id,
  data,
  layers,
}: {
  id: string
  data: GeoJSONSourceSpecification["data"]
  layers: LayerDef[]
}) {
  const { map, styleKey } = useMap()
  const dataRef = useRef(data)
  const layersRef = useRef(layers)
  useEffect(() => {
    dataRef.current = data
    layersRef.current = layers
  })

  useEffect(() => {
    if (!styleKey) return
    if (!map.getSource(id)) map.addSource(id, { type: "geojson", data: dataRef.current })
    for (const layer of layersRef.current) {
      if (!map.getLayer(layer.id)) map.addLayer({ ...layer, source: id } as LayerSpecification)
    }
    const ids = layersRef.current.map((l) => l.id)
    return () => {
      // The style may already be gone (map removed or style swapped).
      try {
        for (const l of ids) if (map.getLayer(l)) map.removeLayer(l)
        if (map.getSource(id)) map.removeSource(id)
      } catch {}
    }
  }, [map, id, styleKey])

  useEffect(() => {
    if (!styleKey) return
    ;(map.getSource(id) as GeoJSONSource | undefined)?.setData(data)
  }, [map, id, data, styleKey])

  const paintKey = JSON.stringify(layers.map((l) => [l.id, l.paint, l.layout]))
  useEffect(() => {
    if (!styleKey) return
    for (const layer of layersRef.current) {
      if (!map.getLayer(layer.id)) continue
      for (const [k, v] of Object.entries(layer.paint ?? {})) map.setPaintProperty(layer.id, k, v)
      for (const [k, v] of Object.entries(layer.layout ?? {})) map.setLayoutProperty(layer.id, k, v)
    }
  }, [map, paintKey, styleKey])

  return null
}
