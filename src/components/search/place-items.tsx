"use client"

import type { Map as MlMap } from "maplibre-gl"
import { BuildingIcon, MapPinIcon, RouteIcon, TreesIcon } from "lucide-react"
import type { PlaceResult } from "@/lib/geocoding/types"
import type { SearchGroup } from "./search-combobox"

export function placeIcon(kind: string) {
  if (kind === "park") return <TreesIcon />
  if (kind === "street") return <RouteIcon />
  if (["city", "district", "locality", "county", "state", "country"].includes(kind)) return <BuildingIcon />
  return <MapPinIcon />
}

/** Fly to a place: fit its extent when it has one, otherwise zoom to its center. */
export function flyToPlace(map: MlMap, place: PlaceResult) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const duration = reduced ? 0 : 1600
  const [w, s, e, n] = place.bbox ?? [0, 0, 0, 0]
  // Tiny extents (a single building) look better as a point zoom.
  if (place.bbox && (e - w > 0.0015 || n - s > 0.0015)) {
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 60, maxZoom: 17, duration },
    )
  } else {
    map.flyTo({ center: place.center, zoom: Math.max(map.getZoom(), 16), duration })
  }
}

/** Build the "Places" group for a SearchCombobox from usePlaceSearch() output. */
export function placesGroup(
  search: { results: PlaceResult[]; loading: boolean; error: string | null; active: boolean },
  onPick: (place: PlaceResult) => void,
  label = "Places",
): SearchGroup {
  return {
    label,
    loading: search.active && search.loading && !search.results.length,
    empty: !search.active ? "Type 3+ letters to search places" : (search.error ?? "No places found"),
    items: search.results.map((p) => ({
      id: `place-${p.id}`,
      title: p.name,
      subtitle: p.context,
      icon: placeIcon(p.kind),
      onSelect: () => onPick(p),
    })),
  }
}

/** Required credit for the OpenStreetMap-based geocoder. */
export const GEOCODER_CREDIT = "Place search by Photon · © OpenStreetMap contributors"
