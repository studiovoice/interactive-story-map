import { connection, type NextRequest } from "next/server"
import { getStorage } from "@/lib/storage"
import { mediaIdFromKey } from "@/lib/storage/rules"

/**
 * GET /api/media/points/<mediaId>/<file> → 302 to a short-lived presigned URL in the bucket.
 * The bucket stays private; `mediaUrl()` points stored media here.
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/media/[...key]">) {
  await connection()
  const { key } = await ctx.params
  const storageKey = key.join("/")
  const storage = getStorage()
  if (!storage.canUpload || !mediaIdFromKey(storageKey)) {
    return Response.json({ error: "Not found" }, { status: 404 })
  }
  // TODO(auth): once there are private points, check the viewer may see the point using this file.
  const url = await storage.getReadUrl(storageKey)
  return new Response(null, {
    status: 302,
    // Shorter than the signed URL's lifetime, so a cached redirect never points at an expired URL.
    headers: { Location: url, "Cache-Control": "private, max-age=60" },
  })
}
