import "server-only"

import { headers } from "next/headers"
import { after } from "next/server"
import { cache } from "react"
import { getDb } from "@/lib/data/drizzle/client"
import { createAuth } from "./config"
import { can, isRole, type Permissions, type Role } from "./permissions"

/** The app's Better Auth instance. Its routes are mounted at /api/auth/* (src/app/api/auth). */
export const auth = createAuth(getDb(), { runInBackground: (task) => after(task) })

/** The signed-in staff member, narrowed to what pages and actions need. */
export type Viewer = { id: string; name: string; email: string; role: Role }

/**
 * Who is making this request, or null for the public. Reads the session cookie, so it's
 * request-time: call it inside a <Suspense> boundary, in a server action or a route handler.
 * Deduped per request. A user without a known role (or banned) counts as signed out.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return null
  const { id, name, email, role, banned } = session.user
  if (banned || !isRole(role)) return null
  return { id, name, email, role }
})

/** A mutation or read the viewer isn't allowed to do. Server actions turn it into an error message. */
export class AuthError extends Error {
  constructor(readonly reason: "signed-out" | "forbidden") {
    super(
      reason === "signed-out"
        ? "Your session has ended. Sign in again to continue."
        : "You don't have permission to do that.",
    )
    this.name = "AuthError"
  }
}

/**
 * The real check, for server actions and route handlers: returns the viewer if they may do
 * everything in `permissions`, otherwise throws an `AuthError`.
 */
export async function requirePermission(permissions: Permissions): Promise<Viewer> {
  const viewer = await getViewer()
  if (!viewer) throw new AuthError("signed-out")
  if (!can(viewer.role, permissions)) throw new AuthError("forbidden")
  return viewer
}
