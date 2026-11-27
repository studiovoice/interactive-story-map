import "server-only"

import { redirect } from "next/navigation"
import { getViewer, type Viewer } from "./server"

/**
 * For staff pages: the signed-in staff member, or a redirect to /sign-in that comes back to `next`
 * afterwards. Call it inside the page's <Suspense> boundary (it reads the session cookie), then check
 * the specific permission with `can()` and render <NotAllowed /> if it's missing.
 *
 * The proxy (src/proxy.ts) already sends visitors without a session cookie to /sign-in; this is the
 * real check (a cookie can be stale, expired or for a banned account).
 */
export async function requireStaff(next: string): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) redirect(`/sign-in?next=${encodeURIComponent(next)}`)
  return viewer
}
