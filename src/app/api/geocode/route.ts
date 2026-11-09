import type { NextRequest } from "next/server"
import { searchPlaces } from "@/lib/geocoding"

/** GET /api/geocode?q=cadman+plaza&lat=40.7&lng=-74 → { results: PlaceResult[] } */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get("q") ?? ""
  const lat = Number(sp.get("lat"))
  const lng = Number(sp.get("lng"))
  const near =
    sp.has("lat") &&
    sp.has("lng") &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
      ? { lat, lng }
      : undefined
  try {
    const results = await searchPlaces({ q, near, limit: Number(sp.get("limit")) || undefined })
    return Response.json({ results })
  } catch (err) {
    console.error("geocode failed", err)
    return Response.json({ results: [], error: "Place search is unavailable right now." }, { status: 502 })
  }
}
