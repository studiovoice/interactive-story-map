"use client"

import type { ExpressionSpecification, GeoJSONSource, MapGeoJSONFeature, PointLike as ScreenPoint } from "maplibre-gl"
import { useEffect, useMemo, useRef, useState } from "react"
import type { LngLat, MapPoint } from "@/lib/domain/schema"
import { MapLayer, type SourceOptions } from "./map-layer"
import { MapMarker } from "./map-marker"
import { useMap } from "./map-view"
import { useThemeColors } from "./use-theme-colors"

/** The fields PointsLayer needs. Full `Point`s and `MapPoint`s both fit. */
export type PointLike = Pick<MapPoint, "id" | "title" | "location" | "locationPrecision">

/** How one point is drawn. */
export type PointLook = {
  /** Solid dot (e.g. "in a story"); otherwise a hollow ring. */
  filled?: boolean
  /** Drawn at reduced opacity (context points). */
  faint?: boolean
  /** Small number on the dot, e.g. its order in a chapter. */
  num?: number | null
  /** Hover text. Defaults to the title. */
  label?: string
}

const HIT_RADIUS = 7

type Hit =
  | { kind: "point"; id: string; label: string; at: LngLat }
  | { kind: "cluster"; clusterId: number; count: number; at: LngLat }

/**
 * Many points drawn by the GPU as one GeoJSON layer (instead of one DOM element each), so a map
 * can show thousands. With `cluster`, nearby points merge into numbered bubbles when zoomed out;
 * clicking one zooms in. Points in `litIds` (selected / highlighted) are drawn on top, unclustered, with a pulse.
 *
 * `look` decides how each point is drawn. Pass a stable function (the React Compiler memoizes
 * inline ones) since a new one rebuilds the layer's data.
 */
export function PointsLayer<P extends PointLike>({
  id,
  points,
  look,
  litIds = [],
  cluster = false,
  onPointClick,
}: {
  id: string
  points: P[]
  look?: (p: P) => PointLook
  litIds?: (string | null | undefined)[]
  cluster?: boolean
  /** Without it, points are display-only and clicks fall through to the map. */
  onPointClick?: (id: string) => void
}) {
  const { map, interceptClick } = useMap()
  const colors = useThemeColors()
  const [hover, setHover] = useState<Hit | null>(null)

  const features = useMemo(
    () =>
      points.map((p) => {
        const l = look?.(p) ?? {}
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: p.location },
          properties: {
            id: p.id,
            label: l.label ?? p.title,
            filled: !!l.filled,
            faint: !!l.faint,
            fuzzy: p.locationPrecision !== "exact",
            num: l.num ? String(l.num) : "",
            // Higher draws on top.
            sort: l.faint ? 0 : l.filled ? 2 : 1,
          },
        }
      }),
    [points, look],
  )
  const data = useMemo(() => ({ type: "FeatureCollection" as const, features }), [features])

  const litKey = litIds.filter(Boolean).join(",")
  const litData = useMemo(() => {
    const ids = new Set(litKey.split(","))
    return { type: "FeatureCollection" as const, features: features.filter((f) => ids.has(f.properties.id)) }
  }, [features, litKey])

  const [source] = useState<SourceOptions | undefined>(() =>
    cluster
      ? {
          cluster: true,
          clusterRadius: 30,
          // From zoom 15 every point is shown on its own.
          clusterMaxZoom: 14,
          // Two overlapping points stay as two dots; it takes three to make a bubble.
          clusterMinPoints: 3,
          // How many points in the cluster are "filled" (in a story), to colour the bubble.
          clusterProperties: { filled: ["+", ["case", ["get", "filled"], 1, 0]] },
        }
      : undefined,
  )

  const L = {
    cluster: `${id}-cluster`,
    count: `${id}-cluster-count`,
    ring: `${id}-fuzzy-ring`,
    dot: `${id}-dot`,
    num: `${id}-num`,
    litDot: `${id}-lit-dot`,
    litNum: `${id}-lit-num`,
  }
  const hoverId = hover?.kind === "point" ? hover.id : ""

  // Hit testing, hover and clicks. Refs keep the handlers current without re-subscribing.
  const onPointClickRef = useRef(onPointClick)
  useEffect(() => {
    onPointClickRef.current = onPointClick
  })

  useEffect(() => {
    const canvas = map.getCanvas()
    let prevCursor: string | null = null

    function hitTest(at: { x: number; y: number }): Hit | null {
      const layers = [L.litDot, L.dot, L.cluster].filter((l) => map.getLayer(l))
      if (!layers.length) return null
      const box: [ScreenPoint, ScreenPoint] = [
        [at.x - HIT_RADIUS, at.y - HIT_RADIUS],
        [at.x + HIT_RADIUS, at.y + HIT_RADIUS],
      ]
      let best: MapGeoJSONFeature | null = null
      let bestD = Infinity
      for (const f of map.queryRenderedFeatures(box, { layers })) {
        if (f.geometry.type !== "Point") continue
        const p = map.project(f.geometry.coordinates as LngLat)
        // Lit points win ties, they're drawn on top.
        const d = Math.hypot(p.x - at.x, p.y - at.y) - (f.layer.id === L.litDot ? 2 : 0)
        if (d < bestD) [best, bestD] = [f, d]
      }
      if (!best || best.geometry.type !== "Point") return null
      const coords = best.geometry.coordinates as LngLat
      const props = best.properties
      if (props.cluster) return { kind: "cluster", clusterId: props.cluster_id, count: props.point_count, at: coords }
      return { kind: "point", id: props.id, label: props.label, at: coords }
    }

    const interactive = (h: Hit | null) => !!h && (h.kind === "cluster" || !!onPointClickRef.current)

    function onMove(e: { point: { x: number; y: number } }) {
      const h = hitTest(e.point)
      setHover((cur) =>
        cur?.kind === h?.kind &&
        (cur?.kind === "point" ? cur.id : cur?.clusterId) === (h?.kind === "point" ? h.id : h?.clusterId)
          ? cur
          : h,
      )
      if (interactive(h)) {
        if (prevCursor === null) prevCursor = canvas.style.cursor
        canvas.style.cursor = "pointer"
      } else if (prevCursor !== null) {
        canvas.style.cursor = prevCursor
        prevCursor = null
      }
    }
    const clear = () => setHover(null)

    const unintercept = interceptClick((e) => {
      const h = hitTest(e.point)
      if (!h || !interactive(h)) return false
      if (h.kind === "cluster") {
        const src = map.getSource(id) as GeoJSONSource | undefined
        src
          ?.getClusterExpansionZoom(h.clusterId)
          .then((zoom) => map.easeTo({ center: h.at, zoom: Math.min(zoom, 18), duration: 500 }))
          .catch(() => {})
      } else {
        setHover(null)
        onPointClickRef.current?.(h.id)
      }
      return true
    })

    map.on("mousemove", onMove)
    map.on("movestart", clear)
    canvas.addEventListener("mouseleave", clear)
    return () => {
      unintercept()
      map.off("mousemove", onMove)
      map.off("movestart", clear)
      canvas.removeEventListener("mouseleave", clear)
      if (prevCursor !== null) canvas.style.cursor = prevCursor
    }
    // Layer ids derive from `id`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, id, interceptClick])

  const notCluster: ExpressionSpecification = ["!", ["has", "point_count"]]
  const hasNum: ExpressionSpecification = ["!=", ["get", "num"], ""]
  const tooltip = hover && map.project(hover.at)

  return (
    <>
      <MapLayer
        id={id}
        data={data}
        source={source}
        layers={[
          {
            id: L.cluster,
            type: "circle",
            filter: ["has", "point_count"],
            paint: {
              "circle-radius": ["step", ["get", "point_count"], 13, 10, 16, 50, 19, 200, 23],
              "circle-color": ["case", [">", ["get", "filled"], 0], colors.primary, colors.background],
              "circle-opacity": 0.92,
              "circle-stroke-color": ["case", [">", ["get", "filled"], 0], colors.background, colors.foreground],
              "circle-stroke-width": 2,
            },
          },
          {
            id: L.count,
            type: "symbol",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 11,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": ["case", [">", ["get", "filled"], 0], colors.primaryForeground, colors.foreground],
            },
          },
          {
            // Approximate / hidden locations get a soft outer ring.
            id: L.ring,
            type: "circle",
            filter: ["all", notCluster, ["get", "fuzzy"]],
            layout: { "circle-sort-key": ["get", "sort"] },
            paint: {
              "circle-radius": 10.5,
              "circle-opacity": 0,
              "circle-stroke-width": 1.25,
              "circle-stroke-color": ["case", ["get", "filled"], colors.primary, colors.foreground],
              "circle-stroke-opacity": ["case", ["get", "faint"], 0.25, 0.55],
            },
          },
          {
            id: L.dot,
            type: "circle",
            filter: notCluster,
            layout: { "circle-sort-key": ["get", "sort"] },
            paint: {
              "circle-radius": ["+", ["case", hasNum, 8.5, 6.5], ["case", ["==", ["get", "id"], hoverId], 2, 0]],
              "circle-color": [
                "case",
                ["all", ["get", "filled"], ["!", ["get", "fuzzy"]]],
                colors.primary,
                colors.background,
              ],
              "circle-opacity": ["case", ["get", "faint"], 0.45, ["get", "filled"], 1, 0.85],
              "circle-stroke-color": [
                "case",
                ["get", "filled"],
                ["case", ["get", "fuzzy"], colors.primary, colors.background],
                colors.foreground,
              ],
              "circle-stroke-width": ["case", ["get", "filled"], 2, 1.5],
              "circle-stroke-opacity": ["case", ["get", "faint"], 0.45, 1],
            },
          },
          {
            id: L.num,
            type: "symbol",
            filter: ["all", notCluster, hasNum],
            layout: {
              "text-field": ["get", "num"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 9,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: {
              "text-color": ["case", ["get", "fuzzy"], colors.foreground, colors.primaryForeground],
            },
          },
        ]}
      />
      <MapLayer
        id={`${id}-lit`}
        data={litData}
        layers={[
          {
            id: L.litDot,
            type: "circle",
            paint: {
              "circle-radius": ["case", hasNum, 9.5, 8.5],
              "circle-color": ["case", ["get", "fuzzy"], colors.background, colors.primary],
              "circle-stroke-color": ["case", ["get", "fuzzy"], colors.primary, colors.background],
              "circle-stroke-width": 2.5,
            },
          },
          {
            id: L.litNum,
            type: "symbol",
            filter: hasNum,
            layout: {
              "text-field": ["get", "num"],
              "text-font": ["Noto Sans Bold"],
              "text-size": 10,
              "text-allow-overlap": true,
              "text-ignore-placement": true,
            },
            paint: { "text-color": ["case", ["get", "fuzzy"], colors.foreground, colors.primaryForeground] },
          },
        ]}
      />
      {/* The selected point's pulse is a CSS animation on a tiny HTML overlay, so the map doesn't redraw every frame. */}
      {litData.features.map((f) => (
        <MapMarker key={f.properties.id} lngLat={f.geometry.coordinates} className="pt-pulse">
          <i />
        </MapMarker>
      ))}
      {hover && tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-[5] max-w-56 -translate-x-1/2 -translate-y-full truncate rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
          style={{ left: tooltip.x, top: tooltip.y - 14 }}
        >
          {hover.kind === "cluster" ? `${hover.count} points · click to zoom in` : hover.label}
        </div>
      )}
    </>
  )
}
