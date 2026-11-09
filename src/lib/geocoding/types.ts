import type { LngLat } from "@/lib/domain/schema"

/** A place search result, normalized across providers. Safe to send to the browser. */
export type PlaceResult = {
  id: string
  name: string
  /** Secondary line: neighbourhood, city, country… */
  context: string
  center: LngLat
  /** [west, south, east, north] when the place has an extent (parks, neighbourhoods, cities). */
  bbox: [number, number, number, number] | null
  /** Rough category for the icon: "city", "street", "park", "address"… */
  kind: string
}
