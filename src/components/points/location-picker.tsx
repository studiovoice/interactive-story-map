"use client"

import type { Map as MlMap } from "maplibre-gl"
import { CrosshairIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { AreaLayer } from "@/components/map/area-layer"
import { MapMarker } from "@/components/map/map-marker"
import { MapView } from "@/components/map/map-view"
import { PointsLayer, type PointLike } from "@/components/map/points-layer"
import { flyToPlace, GEOCODER_CREDIT, placesGroup } from "@/components/search/place-items"
import { SearchCombobox } from "@/components/search/search-combobox"
import { usePlaceSearch } from "@/components/search/use-place-search"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { LngLat } from "@/lib/domain/schema"
import type { PlaceResult } from "@/lib/geocoding/types"

const round = (v: number) => +v.toFixed(6)

/** Click the map or drag the pin to set a location. Other points are shown faintly for context. */
export function LocationPicker({
  value,
  onChange,
  context = [],
  invalid,
  radiusM = null,
  onPlacePicked,
}: {
  value: LngLat | null
  onChange: (v: LngLat) => void
  /** Other points, drawn faintly for orientation. */
  context?: PointLike[]
  invalid?: boolean
  /** Draw the approximate / obscured area around the pin. */
  radiusM?: number | null
  /** Called after a place search result is chosen (e.g. to fill in the place name). */
  onPlacePicked?: (place: PlaceResult) => void
}) {
  const [map, setMap] = useState<MlMap | null>(null)
  const [placeQuery, setPlaceQuery] = useState("")
  const placeSearch = usePlaceSearch(placeQuery, () => {
    const c = map?.getCenter().wrap()
    return c ? { lng: c.lng, lat: c.lat } : null
  })

  function pickPlace(place: PlaceResult) {
    setPlaceQuery("")
    if (map) flyToPlace(map, place)
    // Drop the pin there if there isn't one yet; otherwise just go there and let them click.
    if (!value) set(place.center)
    onPlacePicked?.(place)
  }
  const [initial] = useState(() =>
    value
      ? { center: value, zoom: 15 }
      : context.length
        ? { center: context[0].location, zoom: 13 }
        : { center: [-73.9985, 40.7052] as LngLat, zoom: 12 },
  )
  const [latText, setLatText] = useState(value ? String(value[1]) : "")
  const [lngText, setLngText] = useState(value ? String(value[0]) : "")

  function set(v: LngLat, fly = false) {
    const r: LngLat = [round(v[0]), round(v[1])]
    onChange(r)
    setLatText(String(r[1]))
    setLngText(String(r[0]))
    if (fly) map?.easeTo({ center: r, zoom: Math.max(map.getZoom(), 15) })
  }

  function commitText() {
    const lat = Number(latText),
      lng = Number(lngText)
    if (
      latText &&
      lngText &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    )
      set([lng, lat], true)
  }

  function locate() {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser")
    navigator.geolocation.getCurrentPosition(
      (pos) => set([pos.coords.longitude, pos.coords.latitude], true),
      () => toast.error("Couldn't get your location"),
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <SearchCombobox
        value={placeQuery}
        onValueChange={setPlaceQuery}
        ariaLabel="Search for a place"
        placeholder="Search for a place to jump there"
        groups={[placesGroup(placeSearch, pickPlace)]}
        footer={GEOCODER_CREDIT}
      />
      <MapView
        initialView={initial}
        className={`h-72 rounded-lg border sm:h-96 ${invalid ? "border-destructive" : ""}`}
        onReady={setMap}
        onClick={(e) => set([e.lngLat.lng, e.lngLat.lat])}
        cursor="crosshair"
      >
        <AreaLayer
          id="picker-area"
          points={
            value && radiusM
              ? [{ id: "picked", location: value, locationPrecision: "approximate", locationRadiusM: radiusM }]
              : []
          }
          highlightId="picked"
          alwaysShow
        />
        <PointsLayer id="picker-context" points={context} look={() => ({ faint: true })} />
        {value && (
          <MapMarker lngLat={value} anchor="bottom" draggable className="pin" onDragEnd={(v) => set(v)}>
            <svg viewBox="0 0 26 34" className="size-full">
              <path
                d="M13 33s11-11.6 11-20A11 11 0 0 0 2 13c0 8.4 11 20 11 20z"
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth="2"
              />
              <circle cx="13" cy="13" r="4" fill="var(--primary-foreground)" />
            </svg>
          </MapMarker>
        )}
      </MapView>
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor="lat" className="text-xs text-muted-foreground">
            Latitude
          </Label>
          <Input
            id="lat"
            inputMode="decimal"
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
            onBlur={commitText}
            className="w-36 font-mono text-xs"
            placeholder="40.70520"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="lng" className="text-xs text-muted-foreground">
            Longitude
          </Label>
          <Input
            id="lng"
            inputMode="decimal"
            value={lngText}
            onChange={(e) => setLngText(e.target.value)}
            onBlur={commitText}
            className="w-36 font-mono text-xs"
            placeholder="-73.99850"
          />
        </div>
        <Button type="button" variant="outline" onClick={locate}>
          <CrosshairIcon /> Use my location
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          {value ? "Drag the pin or click the map to move it." : "Click the map to drop a pin."}
        </p>
      </div>
    </div>
  )
}
