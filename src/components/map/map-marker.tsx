"use client"

import type { Marker, PositionAnchor } from "maplibre-gl"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import type { LngLat } from "@/lib/domain/schema"
import { useMap } from "./map-view"

/** An HTML marker whose contents are regular React children. */
export function MapMarker({
  lngLat,
  children,
  className,
  title,
  anchor = "center",
  draggable = false,
  onClick,
  onDragEnd,
}: {
  lngLat: LngLat
  children?: ReactNode
  className?: string
  title?: string
  anchor?: PositionAnchor
  draggable?: boolean
  onClick?: () => void
  onDragEnd?: (lngLat: LngLat) => void
}) {
  const { map, lib } = useMap()
  // The element MapLibre positions; React renders `children` into it through a portal.
  // Only rendered inside a loaded <MapView>, so `document` exists. Mutated only through markerRef.
  const [el] = useState(() => document.createElement("div"))
  const markerRef = useRef<Marker | null>(null)
  const handlers = useRef({ onClick, onDragEnd })
  useEffect(() => {
    handlers.current = { onClick, onDragEnd }
  })

  const [lng, lat] = lngLat
  const initial = useRef(lngLat)

  useEffect(() => {
    const marker = new lib.Marker({
      element: el,
      anchor,
      draggable,
      pitchAlignment: "viewport",
      rotationAlignment: "viewport",
    })
      .setLngLat(initial.current)
      .addTo(map)
    marker.on("dragend", () => {
      const p = marker.getLngLat()
      handlers.current.onDragEnd?.([+p.lng.toFixed(6), +p.lat.toFixed(6)])
    })
    const click = (e: MouseEvent) => {
      e.stopPropagation()
      handlers.current.onClick?.()
    }
    const element = marker.getElement()
    element.addEventListener("click", click)
    markerRef.current = marker
    return () => {
      element.removeEventListener("click", click)
      marker.remove()
      markerRef.current = null
    }
  }, [map, lib, el, anchor, draggable])

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat])
  }, [lng, lat])

  useEffect(() => {
    const element = markerRef.current?.getElement()
    if (!element) return
    // Keep MapLibre's own classes (maplibregl-marker …) and add ours.
    const own = [...element.classList].filter((c) => c.startsWith("maplibregl-"))
    element.className = [...own, className ?? ""].join(" ").trim()
    if (title) element.title = title
    else element.removeAttribute("title")
  }, [map, lib, el, anchor, draggable, className, title])

  return createPortal(children, el)
}
