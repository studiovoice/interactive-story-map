import { connection, type NextRequest } from "next/server"
import { store } from "@/lib/data"

/** GET /api/points/:id → PointDetail (the point plus the stories that use it), for the details panel. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/points/[pointId]">) {
  await connection()
  const { pointId } = await ctx.params
  // TODO(auth): once there are private points, check the viewer may see this one.
  const detail = await store.points.detail(pointId)
  if (!detail) return Response.json({ error: "Point not found" }, { status: 404 })
  return Response.json(detail)
}
