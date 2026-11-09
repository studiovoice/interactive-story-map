"use client"

import type { Map as MlMap, MapMouseEvent } from "maplibre-gl"
import { MapPinPlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { MapMarker } from "@/components/map/map-marker"
import { MapView } from "@/components/map/map-view"
import { Button } from "@/components/ui/button"
import { flyToPlace, GEOCODER_CREDIT, placesGroup } from "@/components/search/place-items"
import { PlaceMarker } from "@/components/search/place-marker"
import { SearchCombobox } from "@/components/search/search-combobox"
import { usePlaceSearch } from "@/components/search/use-place-search"
import type { Point, PointUsage } from "@/lib/domain/schema"
import { boundsOf } from "@/lib/geo"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { AreaLayer } from "@/components/map/area-layer"
import { isFuzzy } from "@/lib/location"
import type { PlaceResult } from "@/lib/geocoding/types"
import { formatCaptured } from "@/lib/time"
import { PointDetailPanel } from "./point-detail-panel"
import { PointMedia } from "./point-media"

export function matchesQuery(p: Point, q: string) {
  if (!q) return true
  const s = q.toLowerCase()
  return (
    p.title.toLowerCase().includes(s) ||
    p.description.toLowerCase().includes(s) ||
    p.placeName.toLowerCase().includes(s) ||
    p.tags.some((t) => t.toLowerCase().includes(s))
  )
}

export function ExploreMap({ points, usage }: { points: Point[]; usage: Record<string, PointUsage[]> }) {
  const router = useRouter()
  const [map, setMap] = useState<MlMap | null>(null)
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [nearbyIds, setNearbyIds] = useState<string[]>([])
  const [dropMode, setDropMode] = useState(false)
  const { showApproxAreas } = useSettings()
  const [place, setPlace] = useState<PlaceResult | null>(null)
  const placeSearch = usePlaceSearch(query, () => {
    const c = map?.getCenter()
    return c ? { lng: c.lng, lat: c.lat } : null
  })

  const visible = useMemo(() => points.filter((p) => matchesQuery(p, query)), [points, query])
  const selected = selectedId ? (points.find((p) => p.id === selectedId) ?? null) : null
  const index = selected ? visible.findIndex((p) => p.id === selected.id) : -1

  const [initialView] = useState(() => {
    const b = boundsOf(points.map((p) => p.location))
    return b ? { bounds: b, padding: 60 } : { center: [-40, 30] as [number, number], zoom: 1.6 }
  })

  function select(id: string, keepNearby = false) {
    const point = points.find((p) => p.id === id)
    if (!map || !point) return
    if (!keepNearby) {
      // Markers overlap when zoomed out, so also list every point stacked at that spot.
      const o = map.project(point.location)
      setNearbyIds(
        visible
          .filter((p) => {
            const q = map.project(p.location)
            return Math.hypot(q.x - o.x, q.y - o.y) <= 16
          })
          .map((p) => p.id),
      )
    }
    setSelectedId(id)
    const wide = window.matchMedia("(min-width: 768px)").matches
    map.easeTo({
      center: point.location,
      padding: { top: 0, bottom: wide ? 0 : 260, left: 0, right: wide ? 344 : 0 },
      duration: 600,
    })
  }

  function close() {
    setSelectedId(null)
    map?.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 400 })
  }

  function step(delta: number) {
    if (!visible.length) return
    const i = index < 0 ? 0 : (index + delta + visible.length) % visible.length
    select(visible[i].id)
  }

  function onMapClick(e: MapMouseEvent) {
    if (dropMode) {
      setDropMode(false)
      router.push(`/points/new?lng=${e.lngLat.lng.toFixed(6)}&lat=${e.lngLat.lat.toFixed(6)}`)
      return
    }
    close()
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input,textarea")) return
      if (e.key === "Escape") {
        setDropMode(false)
        if (selectedId) close()
      }
      if (!selectedId) return
      if (e.key === "ArrowRight") step(1)
      if (e.key === "ArrowLeft") step(-1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div className="relative h-[calc(100dvh-3.5rem)] w-full">
      <MapView
        initialView={initialView}
        className="absolute inset-0"
        onReady={setMap}
        onClick={onMapClick}
        cursor={dropMode ? "crosshair" : undefined}
      >
        <AreaLayer id="explore-areas" points={visible} highlightId={selectedId} />
        {place && <PlaceMarker place={place} onClear={() => setPlace(null)} />}
        {visible.map((p) => {
          const inStory = (usage[p.id]?.length ?? 0) > 0
          return (
            <MapMarker
              key={p.id}
              lngLat={p.location}
              title={p.title}
              className={cn("pt", inStory && "filled", isFuzzy(p) && "fuzzy", p.id === selectedId && "sel")}
              onClick={() => select(p.id)}
            >
              <i className="pulse" />
              <i className="body" />
            </MapMarker>
          )
        })}
      </MapView>

      {/* Top-left: search + counts */}
      <div className="absolute top-3 right-3 left-14 z-10 flex flex-wrap items-center gap-2 md:right-auto">
        <SearchCombobox
          value={query}
          onValueChange={setQuery}
          ariaLabel="Search points or places"
          placeholder="Search points or places"
          className="w-full max-w-sm"
          inputClassName="h-8 bg-popover/95 shadow-sm backdrop-blur"
          groups={[
            {
              label: `Points${visible.length > 5 ? ` (showing 5 of ${visible.length})` : ""}`,
              empty: "No points match",
              items: visible.slice(0, 5).map((p) => ({
                id: p.id,
                title: p.title,
                subtitle: [formatCaptured(p.capturedAt, p.timePrecision === "approximate"), p.placeName]
                  .filter(Boolean)
                  .join(" · "),
                icon: <PointMedia point={p} badge={false} className="size-full" />,
                onSelect: () => {
                  setQuery("")
                  select(p.id)
                },
              })),
            },
            placesGroup(placeSearch, (place) => {
              setQuery("")
              setPlace(place)
              if (map) flyToPlace(map, place)
            }),
          ]}
          footer={placeSearch.active ? GEOCODER_CREDIT : "Typing filters the points on the map."}
        />
        <span className="rounded-full border bg-popover/95 px-2.5 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {visible.length === points.length
            ? `${points.length} points`
            : `${visible.length} of ${points.length} points`}
          <span className="hidden sm:inline"> · Click one to see its details</span>
        </span>
      </div>

      {/* Bottom-left: legend + drop-a-point */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-2">
        <Button
          size="sm"
          variant={dropMode ? "default" : "outline"}
          className={cn(!dropMode && "bg-popover/95 shadow-sm backdrop-blur")}
          onClick={() => setDropMode((v) => !v)}
        >
          <MapPinPlusIcon />
          {dropMode ? "Click the map to place it (Esc to cancel)" : "Add a point here"}
        </Button>
        <div className="flex items-center gap-3 rounded-lg border bg-popover/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-full bg-primary" /> In a story
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-full border-[1.5px] border-foreground" /> Not in a story
          </span>
          {showApproxAreas && (
            <span className="flex items-center gap-1.5">
              <i className="inline-block size-2.5 rounded-full border-[1.5px] border-dashed border-primary bg-primary/10" />{" "}
              Approx. area
            </span>
          )}
        </div>
      </div>

      {selected && (
        <PointDetailPanel
          key={selected.id}
          point={selected}
          usage={usage[selected.id] ?? []}
          nearby={nearbyIds.map((id) => points.find((p) => p.id === id)!).filter(Boolean)}
          index={Math.max(0, index)}
          total={visible.length}
          onSelect={(id) => select(id, true)}
          onClose={close}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          className="absolute inset-x-3 bottom-3 z-20 max-h-[55%] md:inset-x-auto md:top-3 md:right-3 md:max-h-none md:w-80"
        />
      )}
    </div>
  )
}
