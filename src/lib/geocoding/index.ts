import "server-only"

import { cacheLife } from "next/cache"
import type { PlaceResult } from "./types"

/**
 * Place search ("geocoding"). Only `photon` exists today: a free OpenStreetMap-based
 * geocoder built for search-as-you-type (https://photon.komoot.io, fair use).
 * Swap via GEOCODER=… (e.g. a self-hosted Photon, Pelias, Mapbox, MapTiler) by adding a case below.
 * The public Nominatim server is deliberately not used: its policy forbids autocomplete.
 */
export type GeocodeQuery = {
  q: string
  /** Bias results toward this spot (usually the map center). */
  near?: { lng: number; lat: number }
  limit?: number
}

export async function searchPlaces(query: GeocodeQuery): Promise<PlaceResult[]> {
  const q = query.q.trim().slice(0, 200)
  if (q.length < 2) return []
  // Round the bias so nearby map positions share cache entries.
  const near = query.near ? { lng: +query.near.lng.toFixed(1), lat: +query.near.lat.toFixed(1) } : undefined
  const limit = Math.min(Math.max(query.limit ?? 6, 1), 10)
  const provider = process.env.GEOCODER ?? "photon"
  switch (provider) {
    case "photon":
      return photon(q.toLowerCase(), near?.lng, near?.lat, limit)
    default:
      throw new Error(`Unknown GEOCODER "${provider}"`)
  }
}

const PHOTON_URL = process.env.PHOTON_URL ?? "https://photon.komoot.io"

type PhotonFeature = {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_type?: string
    osm_id?: number
    osm_key?: string
    osm_value?: string
    type?: string
    name?: string
    housenumber?: string
    street?: string
    locality?: string
    district?: string
    city?: string
    county?: string
    state?: string
    country?: string
    extent?: [number, number, number, number] // [minLon, maxLat, maxLon, minLat]
  }
}

async function photon(q: string, lng: number | undefined, lat: number | undefined, limit: number) {
  "use cache"
  cacheLife("days")
  const url = new URL("/api/", PHOTON_URL)
  url.searchParams.set("q", q)
  url.searchParams.set("limit", String(limit))
  url.searchParams.set("lang", "en")
  if (lng !== undefined && lat !== undefined) {
    url.searchParams.set("lon", String(lng))
    url.searchParams.set("lat", String(lat))
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "VOICE-Story-Map/0.1 (+https://github.com/studiovoice/web)" },
    signal: AbortSignal.timeout(6000),
  })
  if (!res.ok) throw new Error(`Photon responded ${res.status}`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  return (
    data.features
      // The same OSM object can come back once per role (e.g. as a square and a locality).
      .filter((f) => {
        const key = `${f.properties.osm_type}${f.properties.osm_id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((f): PlaceResult => {
        const p = f.properties
        const street = [p.housenumber, p.street].filter(Boolean).join(" ")
        const name = p.name || street || p.city || p.state || "Unnamed place"
        const context = [
          p.name && street && street !== name ? street : null,
          p.locality,
          p.district,
          p.city !== name ? p.city : null,
          p.state !== name ? p.state : null,
          p.country !== name ? p.country : null,
        ]
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join(", ")
        const e = p.extent
        return {
          id: `${p.osm_type ?? "x"}${p.osm_id ?? `${f.geometry.coordinates.join(",")}`}`,
          name,
          context,
          center: f.geometry.coordinates,
          bbox: e ? [e[0], e[3], e[2], e[1]] : null,
          kind: p.osm_value === "park" ? "park" : (p.type ?? p.osm_value ?? "place"),
        }
      })
  )
}

export type { PlaceResult } from "./types"
