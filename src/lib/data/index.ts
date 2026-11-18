import "server-only"

import type { DataStore } from "./repository"
import { createJsonStore } from "./json/json-store"
import { createDrizzleStore } from "./drizzle/drizzle-store"
import { getDb } from "./drizzle/client"

/**
 * Pick the persistence driver with DATA_DRIVER:
 *   - "json" (default): one file on disk, no setup (`src/lib/data/json/`).
 *   - "drizzle": Postgres (`src/lib/data/drizzle/`). Needs DATABASE_URL and `pnpm db:migrate`.
 * Both implement `DataStore` and pass the same contract tests (`src/lib/data/__tests__/`).
 */
function createStore(): DataStore {
  const driver = process.env.DATA_DRIVER ?? "json"
  switch (driver) {
    case "json":
      return createJsonStore()
    case "drizzle":
      return createDrizzleStore(getDb())
    default:
      throw new Error(`Unknown DATA_DRIVER "${driver}"`)
  }
}

export const store: DataStore = createStore()

export { NotFoundError } from "./repository"
