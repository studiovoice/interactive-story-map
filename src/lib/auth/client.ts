"use client"

import { adminClient, emailOTPClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import { ac, roles } from "./permissions"

/** Better Auth in the browser: sign in with an email code, sign out, read the session. */
export const authClient = createAuthClient({
  // Same origin as the app, so no baseURL is needed.
  plugins: [emailOTPClient(), adminClient({ ac, roles })],
})

export const { useSession, signOut } = authClient
