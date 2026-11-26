/**
 * Create a staff account, or change an existing one's role. Sign-up is closed, so this is how the
 * first admin gets in (later admins can invite people from the app).
 *
 *   pnpm admin:create you@example.org                      admin
 *   pnpm admin:create you@example.org --name "Your Name"
 *   pnpm admin:create someone@example.org --role curator
 *
 * Then sign in at /sign-in with that email: a code is emailed (or printed by `pnpm dev` when
 * RESEND_API_KEY isn't set). Uses DATABASE_URL; run `pnpm db:migrate` first.
 */
import "./load-env"
import { parseArgs } from "node:util"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createAuth } from "@/lib/auth/config"
import { isRole, roleNames, type Role } from "@/lib/auth/permissions"
import { users } from "@/lib/data/drizzle/auth-schema"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { name: { type: "string" }, role: { type: "string", default: "admin" } },
})

const email = positionals[0]?.trim().toLowerCase()
const role = values.role
const url = process.env.DATABASE_URL

if (!email || !email.includes("@")) fail("Usage: pnpm admin:create <email> [--name <name>] [--role admin|curator]")
if (!isRole(role)) fail(`Unknown role "${role}". Use one of: ${roleNames.join(", ")}.`)
if (!url) fail("DATABASE_URL is not set. See .env.example.")

async function main(email: string, role: Role, url: string) {
  const client = postgres(url, { max: 1, onnotice: () => {} })
  const db = drizzle(client)
  try {
    const [existing] = await db.select().from(users).where(eq(users.email, email))
    if (existing) {
      await db
        .update(users)
        .set({ role, banned: false, banReason: null, banExpires: null, ...(values.name ? { name: values.name } : {}) })
        .where(eq(users.id, existing.id))
      console.log(`Updated ${email}: role ${role}${existing.banned ? " (and un-banned)" : ""}.`)
    } else {
      const auth = createAuth(db)
      // Called on the server without a session, so no admin check applies.
      await auth.api.createUser({ body: { email, name: values.name ?? email.split("@")[0], role } })
      console.log(`Created ${email} with role ${role}. Sign in at /sign-in with this email.`)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

void main(email, role, url)
