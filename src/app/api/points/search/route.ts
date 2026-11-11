import type { NextRequest } from "next/server"
import { store } from "@/lib/data"
import type { PointSearchResult } from "@/lib/domain/schema"
import { lngLatFromParams } from "@/lib/geo"

/**
 * GET /api/points/search?q=bridge&lat=40.7&lng=-74&limit=5
 * → PointSearchResult: every matching id (to filter the map) and the closest few in full.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get("q") ?? "").trim().slice(0, 200)
  if (!q) return Response.json({ ids: [], total: 0, top: [] } satisfies PointSearchResult)
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 5, 1), 50)
  // TODO(auth): once there are private points, filter to what the viewer may see.
  const result = await store.points.search({ q, near: lngLatFromParams(sp), limit })
  return Response.json(result)
}
