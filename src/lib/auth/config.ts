/**
 * The Better Auth setup, as a factory so the app (`./server.ts`), scripts and Better Auth's
 * schema generator can each pass their own database. Pure: no `server-only`.
 *
 * Staff only, invite only: there is no sign-up. Admins create accounts (`pnpm admin:create` for
 * the first one); people sign in with a one-time code sent by email. No passwords.
 */
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, emailOTP } from "better-auth/plugins"
import * as authSchema from "../data/drizzle/auth-schema" // relative: the schema generator doesn't resolve @/
import { sendEmail, signInCodeEmail } from "./email"
import { ac, roles } from "./permissions"

export const APP_NAME = "VOICE Story Map"
/** How long a sign-in code works. */
export const SIGN_IN_CODE_MINUTES = 10

type CreateAuthOptions = {
  /**
   * Runs work after the response is sent. The app passes Next's `after()`, so a serverless
   * function stays alive until the email is out; scripts leave it unset and just start it.
   */
  runInBackground?: (task: Promise<unknown>) => void
}

const DAY = 60 * 60 * 24

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- any Drizzle Postgres database (postgres.js, PGlite)
export function createAuth(db: any, { runInBackground = (task) => void task }: CreateAuthOptions = {}) {
  return betterAuth({
    appName: APP_NAME,
    // BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from the environment.
    // Better Auth's tables live in their own Postgres schema, `auth` (ours are in `public`).
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, usePlural: true, schemaName: "auth" }),
    // Only email codes. No passwords, and no social sign-in.
    emailAndPassword: { enabled: false },
    session: {
      // Sliding 7-day sessions, renewed at most once a day while in use.
      expiresIn: 7 * DAY,
      updateAge: DAY,
      // Changing roles, banning, and other sensitive actions need a sign-in from the last day.
      freshAge: DAY,
      // No cookie cache: a ban or role change applies on the next request.
    },
    rateLimit: {
      // Kept in Postgres: in-memory counters don't work across serverless instances.
      storage: "database",
    },
    plugins: [
      emailOTP({
        // Invite only: a code is never sent to an address without an account.
        disableSignUp: true,
        expiresIn: SIGN_IN_CODE_MINUTES * 60,
        allowedAttempts: 3,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in") return
          // Not awaited (Better Auth's advice, against timing attacks); errors are logged.
          runInBackground(
            sendEmail(signInCodeEmail(email, otp, APP_NAME, SIGN_IN_CODE_MINUTES)).catch((err) =>
              console.error("Sending the sign-in code failed:", err),
            ),
          )
        },
      }),
      admin({
        ac,
        roles,
        defaultRole: "curator",
        adminRoles: ["admin"],
        bannedUserMessage: "This account has been disabled. Ask an admin if you think this is a mistake.",
      }),
      // Must be last: lets server actions set the session cookie.
      nextCookies(),
    ],
  })
}

export type Auth = ReturnType<typeof createAuth>
