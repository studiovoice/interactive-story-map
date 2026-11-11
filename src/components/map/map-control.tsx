"use client"

import type { ControlPosition, IControl } from "maplibre-gl"
import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useMap } from "./map-view"

/**
 * A button group in MapLibre's control stack (e.g. under the zoom buttons), with React children.
 * Use plain <button>s inside; MapLibre styles them like its own controls.
 */
export function MapControl({ position = "top-left", children }: { position?: ControlPosition; children: ReactNode }) {
  const { map } = useMap()
  const [el] = useState(() => {
    const div = document.createElement("div")
    div.className = "maplibregl-ctrl maplibregl-ctrl-group"
    return div
  })

  useEffect(() => {
    const control: IControl = { onAdd: () => el, onRemove: () => el.remove() }
    map.addControl(control, position)
    return () => {
      try {
        map.removeControl(control)
      } catch {
        // Map already removed.
      }
    }
  }, [map, el, position])

  return createPortal(children, el)
}
