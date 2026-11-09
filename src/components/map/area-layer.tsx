"use client"

import { useMemo } from "react"
import type { Point } from "@/lib/domain/schema"
import { areaFeatures } from "@/lib/location"
import { useSettings } from "@/lib/settings"
import { MapLayer } from "./map-layer"
import { useThemeColors } from "./use-theme-colors"

/** Soft circles for points whose location is approximate or hidden for privacy. */
export function AreaLayer({
  id,
  points,
  highlightId,
  alwaysShow = false,
}: {
  id: string
  points: Pick<Point, "id" | "location" | "locationPrecision" | "locationRadiusM">[]
  highlightId?: string | null
  /** Ignore the "Show approximate areas" setting (e.g. while editing a point's area). */
  alwaysShow?: boolean
}) {
  const { showApproxAreas } = useSettings()
  const colors = useThemeColors()
  const visible = alwaysShow || showApproxAreas
  const data = useMemo(() => areaFeatures(visible ? points : []), [points, visible])
  const hl = highlightId ?? ""
  return (
    <MapLayer
      id={id}
      data={data}
      layers={[
        {
          id: `${id}-fill`,
          type: "fill",
          paint: {
            "fill-color": colors.primary,
            "fill-opacity": ["case", ["==", ["get", "id"], hl], 0.18, ["get", "obscured"], 0.1, 0.06],
          },
        },
        {
          id: `${id}-outline`,
          type: "line",
          paint: {
            "line-color": colors.primary,
            "line-width": ["case", ["==", ["get", "id"], hl], 2, 1.25],
            "line-opacity": 0.55,
            "line-dasharray": [2, 2],
          },
        },
      ]}
    />
  )
}
