import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth/server"

/** Better Auth's endpoints: sending sign-in codes, signing in and out, sessions, admin. */
export const { GET, POST } = toNextJsHandler(auth)
