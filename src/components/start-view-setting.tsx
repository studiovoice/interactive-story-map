"use client"

import { CrosshairIcon, FrameIcon, MapPinIcon, XIcon } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { useActiveMap } from "@/components/map/active-map"
import {
  defaultAreaLabel,
  flyToView,
  placeView,
  savedPlaceFromMap,
  savedPlaceFromResult,
} from "@/components/map/start-view"
import { flyToPlace, GEOCODER_CREDIT, placesGroup } from "@/components/search/place-items"
import { SearchCombobox } from "@/components/search/search-combobox"
import { usePlaceSearch } from "@/components/search/use-place-search"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { updateSettings, useSettings, type SavedPlace, type StartView } from "@/lib/settings"

const OPTIONS: { value: StartView; label: string }[] = [
  { value: "default", label: "Default area" },
  { value: "last", label: "Where I left off" },
  { value: "place", label: "A place I choose" },
]

/** Settings row: where the explore map and the new-point map open, and where ⌂ goes. */
export function StartViewSetting() {
  const { startView, startPlace } = useSettings()
  const defaultName = defaultAreaLabel ?? "all points"
  const home = startPlace ? startPlace.label : defaultName
  const hint =
    startView === "default"
      ? defaultAreaLabel
        ? `Opens on ${defaultAreaLabel}, this site's default area.`
        : "Opens fitted to all points (this site has no default area set)."
      : `Opens wherever you last left the map, in this browser. ⌂ goes to ${home}.`
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="setting-start-view" className="text-sm font-normal">
          Map starts at
        </Label>
        <Select value={startView} onValueChange={(v) => updateSettings({ startView: v as StartView })}>
          <SelectTrigger id="setting-start-view" size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {startView === "place" ? (
        <PlacePicker place={startPlace} defaultName={defaultName} />
      ) : (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function PlacePicker({ place, defaultName }: { place: SavedPlace | null; defaultName: string }) {
  const map = useActiveMap()
  const [query, setQuery] = useState("")
  const search = usePlaceSearch(query, () => {
    const c = map?.getCenter().wrap()
    return c ? { lng: c.lng, lat: c.lat } : null
  })

  function save(p: SavedPlace) {
    updateSettings({ startPlace: p })
    toast.success(`The map will start at ${p.label}`)
  }

  function pickMyLocation() {
    if (!navigator.geolocation) return toast.error("Location isn't available in this browser")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p: SavedPlace = {
          label: "Near my location",
          center: [+pos.coords.longitude.toFixed(4), +pos.coords.latitude.toFixed(4)],
          zoom: 14,
        }
        save(p)
        if (map) flyToView(map, placeView(p))
      },
      () => toast.error("Couldn't get your location"),
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {place ? (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 py-1 pr-1 pl-2 text-xs">
          <MapPinIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate" title={place.label}>
            {place.label}
          </span>
          {map && (
            <Button variant="ghost" size="xs" onClick={() => flyToView(map, placeView(place))}>
              Go there
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Clear start place"
            onClick={() => updateSettings({ startPlace: null })}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Pick a place below. It becomes your home (⌂). Until then the map opens on {defaultName}.
        </p>
      )}
      <SearchCombobox
        value={query}
        onValueChange={setQuery}
        ariaLabel="Search for a start place"
        placeholder={place ? "Change place…" : "Search for a place"}
        inputClassName="h-8"
        groups={[
          placesGroup(search, (result) => {
            setQuery("")
            save(savedPlaceFromResult(result))
            if (map) flyToPlace(map, result)
          }),
        ]}
        footer={GEOCODER_CREDIT}
      />
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="xs"
          disabled={!map}
          title={map ? undefined : "Open the map first"}
          onClick={() => map && save(savedPlaceFromMap(map))}
        >
          <FrameIcon /> Use current map view
        </Button>
        <Button variant="outline" size="xs" onClick={pickMyLocation}>
          <CrosshairIcon /> Use my location
        </Button>
      </div>
    </div>
  )
}
