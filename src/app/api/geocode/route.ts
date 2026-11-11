import type { NextRequest } from "next/server"
import { lngLatFromParams } from "@/lib/geo"
import { searchPlaces } from "@/lib/geocoding"

/** GET /api/geocode?q=cadman+plaza&lat=40.7&lng=-74 → { results: PlaceResult[] } */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = sp.get("q") ?? ""
  const near = lngLatFromParams(sp)
  try {
    const results = await searchPlaces({
      q,
      near: near && { lng: near[0], lat: near[1] },
      limit: Number(sp.get("limit")) || undefined,
    })
    return Response.json({ results })
  } catch (err) {
    console.error("geocode failed", err)
    return Response.json({ results: [], error: "Place search is unavailable right now." }, { status: 502 })
  }
}
