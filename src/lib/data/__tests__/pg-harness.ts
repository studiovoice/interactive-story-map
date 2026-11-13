/**
 * Test databases for the drizzle driver: PGlite (in-process Postgres with PostGIS, no Docker)
 * or a real Postgres from TEST_DATABASE_URL. Both get the real migrations from `drizzle/`.
 */
import path from "node:path"
import { createDrizzleStore, insertSnapshot, truncateAll, type Db } from "@/lib/data/drizzle/drizzle-store"
import { schema } from "@/lib/data/drizzle/schema"
import type { StoreHarness } from "./contract"

const migrationsFolder = path.resolve(__dirname, "../../../../drizzle")

export async function pgliteHarness(): Promise<StoreHarness> {
  const { PGlite } = await import("@electric-sql/pglite")
  const { postgis } = await import("@electric-sql/pglite-postgis")
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm")
  const { drizzle } = await import("drizzle-orm/pglite")
  const { migrate } = await import("drizzle-orm/pglite/migrator")

  const client = await PGlite.create({ extensions: { postgis, pg_trgm } })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return harness(db as unknown as Db, () => client.close())
}

export async function postgresHarness(url: string): Promise<StoreHarness> {
  const { default: postgres } = await import("postgres")
  const { drizzle } = await import("drizzle-orm/postgres-js")
  const { migrate } = await import("drizzle-orm/postgres-js/migrator")

  const client = postgres(url, { max: 1, onnotice: () => {} })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })
  return harness(db as unknown as Db, () => client.end())
}

function harness(db: Db, close: () => Promise<void>): StoreHarness {
  return {
    store: createDrizzleStore(db),
    reset: () => truncateAll(db),
    seed: (snapshot) => db.transaction((tx) => insertSnapshot(tx, snapshot)),
    close,
  }
}
