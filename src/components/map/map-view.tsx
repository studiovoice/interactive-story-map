"use client"

import "maplibre-gl/dist/maplibre-gl.css"
import "./map.css"

import type { Map as MlMap, MapMouseEvent, LngLatBoundsLike } from "maplibre-gl"
import { useTheme } from "next-themes"
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react"
import type { Camera, LngLat } from "@/lib/domain/schema"
import { cn } from "@/lib/utils"

type MapLib = typeof import("maplibre-gl")

type MapContextValue = {
  map: MlMap
  lib: MapLib
  /** 0 until the base style has loaded; bumps on every (re)load so layers re-add themselves. */
  styleKey: number
  dark: boolean
  /**
   * Let a layer claim map clicks (e.g. a click on one of its points). The handler returns true
   * when it handled the click, and MapView's own `onClick` is then skipped. Returns an unsubscribe.
   */
  interceptClick: (handler: ClickInterceptor) => () => void
}

export type ClickInterceptor = (e: MapMouseEvent) => boolean

const MapContext = createContext<MapContextValue | null>(null)

export function useMap(): MapContextValue {
  const ctx = use(MapContext)
  if (!ctx) throw new Error("useMap must be used inside <MapView>")
  return ctx
}

export const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
}

export type InitialView =
  (Partial<Camera> & { center: LngLat; zoom: number }) | { bounds: LngLatBoundsLike; padding?: number }

export function MapView({
  initialView,
  className,
  children,
  onReady,
  onClick,
  cursor,
  maxPitch = 70,
  navigation = true,
}: {
  initialView: InitialView
  className?: string
  /** Markers and layers. Rendered as soon as the map exists (layers wait for the style). */
  children?: ReactNode
  onReady?: (map: MlMap) => void
  onClick?: (e: MapMouseEvent) => void
  cursor?: string
  maxPitch?: number
  navigation?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ctx, setCtx] = useState<MapContextValue | null>(null)
  const [failed, setFailed] = useState(false)
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === "dark"

  // Keep the latest callbacks without re-creating the map.
  const onClickRef = useRef(onClick)
  const onReadyRef = useRef(onReady)
  useEffect(() => {
    onClickRef.current = onClick
    onReadyRef.current = onReady
  })

  const interceptorsRef = useRef(new Set<ClickInterceptor>())
  const [interceptClick] = useState(() => (handler: ClickInterceptor) => {
    interceptorsRef.current.add(handler)
    return () => void interceptorsRef.current.delete(handler)
  })

  const initialViewRef = useRef(initialView)
  const darkRef = useRef(dark)

  useEffect(() => {
    let map: MlMap | null = null
    let cancelled = false
    let ro: ResizeObserver | null = null
    import("maplibre-gl")
      .then((lib) => {
        if (cancelled || !containerRef.current) return
        const view = initialViewRef.current
        map = new lib.Map({
          container: containerRef.current,
          style: darkRef.current ? MAP_STYLES.dark : MAP_STYLES.light,
          attributionControl: false,
          maxPitch,
          ...("bounds" in view
            ? { bounds: view.bounds, fitBoundsOptions: { padding: view.padding ?? 60, maxZoom: 16 } }
            : { center: view.center, zoom: view.zoom, bearing: view.bearing ?? 0, pitch: view.pitch ?? 0 }),
        })
        if (navigation) map.addControl(new lib.NavigationControl({ visualizePitch: true }), "top-left")
        map.addControl(new lib.AttributionControl({ compact: true }), "bottom-right")
        // Basemap styles sometimes reference sprite images they don't ship (OpenFreeMap Dark's
        // "wood-pattern"). Fill the gap with a transparent pixel instead of logging a warning.
        map.on("styleimagemissing", (e) => {
          if (!map || map.hasImage(e.id)) return
          map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) })
        })
        map.on("click", (e) => {
          for (const intercept of interceptorsRef.current) if (intercept(e)) return
          onClickRef.current?.(e)
        })
        map.on("error", (e) => {
          if (!map?.isStyleLoaded() && !("sourceId" in e)) setFailed(true)
        })
        const m = map
        // Markers can go on right away; layers wait for styleKey > 0 (style loaded).
        setCtx({ map: m, lib, styleKey: m.isStyleLoaded() ? 1 : 0, dark: darkRef.current, interceptClick })
        onReadyRef.current?.(m)
        map.once("load", () => {
          // Compact attribution opens itself on load; start collapsed.
          containerRef.current
            ?.querySelectorAll(".maplibregl-ctrl-attrib")
            .forEach((el) => el.classList.remove("maplibregl-compact-show"))
        })
        map.on("style.load", () => {
          setCtx((c) => (c ? { ...c, styleKey: c.styleKey + 1, dark: darkRef.current } : c))
        })
        ro = new ResizeObserver(() => m.resize())
        ro.observe(containerRef.current)
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      ro?.disconnect()
      map?.remove()
      setCtx(null)
    }
  }, [maxPitch, navigation, interceptClick])

  // Swap the basemap when the theme changes.
  useEffect(() => {
    if (darkRef.current === dark) return
    darkRef.current = dark
    ctx?.map.setStyle(dark ? MAP_STYLES.dark : MAP_STYLES.light)
  }, [dark, ctx?.map])

  useEffect(() => {
    if (ctx) ctx.map.getCanvas().style.cursor = cursor ?? ""
  }, [cursor, ctx])

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {/* size-full, not absolute: maplibre's unlayered `.maplibregl-map { position: relative }` beats Tailwind's layered utilities. */}
      <div ref={containerRef} className="size-full" />
      {failed && (
        <div className="absolute inset-0 z-[1] grid place-items-center p-6 text-center text-sm text-muted-foreground">
          The map needs a network connection to load its tiles.
        </div>
      )}
      {ctx && <MapContext value={ctx}>{children}</MapContext>}
    </div>
  )
}
