/**
 * Only for Better Auth's schema generator, which needs an `auth` instance to read the tables
 * from. Regenerate `src/lib/data/drizzle/auth-schema.ts` after changing auth plugins:
 *
 *   pnpm auth:schema && pnpm db:generate
 */
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { createAuth } from "../src/lib/auth/config"

// Never connects: the generator only reads the configuration.
export const auth = createAuth(drizzle(postgres("postgres://localhost/unused")))
