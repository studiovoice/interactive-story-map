import "server-only"

import type { DataStore } from "./repository"
import { createJsonStore } from "./json/json-store"

/**
 * Pick the persistence driver. Only "json" exists today.
 *
 * Adding Postgres later:
 *   1. `pnpm add drizzle-orm postgres && pnpm add -D drizzle-kit`
 *   2. create `src/lib/data/drizzle/schema.ts` (tables mirror `DbFile` in json/file-db.ts)
 *   3. implement `createDrizzleStore(): DataStore` in `src/lib/data/drizzle/drizzle-store.ts`
 *   4. add a `case "drizzle"` below and set DATA_DRIVER=drizzle
 */
function createStore(): DataStore {
  const driver = process.env.DATA_DRIVER ?? "json"
  switch (driver) {
    case "json":
      return createJsonStore()
    default:
      throw new Error(`Unknown DATA_DRIVER "${driver}"`)
  }
}

export const store: DataStore = createStore()

export { NotFoundError } from "./repository"
