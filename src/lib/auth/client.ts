"use client"

import { adminClient, emailOTPClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { ac, can, isRole, roles, type Permissions, type Role } from "./permissions"

/** Better Auth in the browser: sign in with an email code, sign out, read the session. */
export const authClient = createAuthClient({
  // Same origin as the app, so no baseURL is needed.
  plugins: [emailOTPClient(), adminClient({ ac, roles })],
})

export const { useSession, signOut } = authClient

/**
 * The signed-in staff member's role in the browser, or null (the public, or still loading).
 * For showing and hiding controls only: the server checks every action itself.
 */
export function useViewerRole(): Role | null {
  const { data } = useSession()
  const role = data?.user.role
  return data && !data.user.banned && isRole(role) ? role : null
}

/** Whether the viewer may do this, for hiding buttons (see `can`). False while the session loads. */
export function useCan(permissions: Permissions): boolean {
  return can(useViewerRole(), permissions)
}
