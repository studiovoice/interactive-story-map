import "server-only"

import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { schema } from "./schema"

/*
 * One connection pool per server process. In dev, Next re-evaluates modules on every change,
 * so the pool is kept on globalThis; otherwise each reload would open a new pool and Postgres
 * would run out of connections.
 */
const globalForDb = globalThis as unknown as { storyMapSql?: postgres.Sql }

export function getDb() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set (needed for DATA_DRIVER=drizzle). See .env.example.")
  const client = (globalForDb.storyMapSql ??= postgres(url, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    // Connections are opened lazily, on the first query.
    onnotice: () => {},
  }))
  return drizzle(client, { schema })
}
