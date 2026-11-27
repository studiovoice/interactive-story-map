import { connection, type NextRequest } from "next/server"
import { getViewer } from "@/lib/auth/server"
import { listStaff } from "@/lib/auth/staff"
import { store } from "@/lib/data"
import { addedByLabel, toPublicPointDetail } from "@/lib/points/public"

/**
 * GET /api/points/:id → PointDetail (the point plus the stories that use it), for the details panel.
 * Staff also get `addedBy`; the public gets the point without its staff-only fields.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/points/[pointId]">) {
  await connection()
  const { pointId } = await ctx.params
  // TODO(auth): once there are private points, check the viewer may see this one.
  const [detail, viewer] = await Promise.all([store.points.detail(pointId), getViewer()])
  if (!detail) return Response.json({ error: "Point not found" }, { status: 404 })
  if (!viewer) return Response.json(toPublicPointDetail(detail))
  const names = new Map((await listStaff()).map((m) => [m.id, m.name]))
  return Response.json({ ...detail, addedBy: addedByLabel(detail.point, (id) => names.get(id)) })
}
