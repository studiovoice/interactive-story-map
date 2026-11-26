import "server-only"

import type { DataStore } from "./repository"
import { createDrizzleStore } from "./drizzle/drizzle-store"
import { getDb } from "./drizzle/client"

/**
 * The app's data store: Postgres via Drizzle (`src/lib/data/drizzle/`). Locally:
 * `pnpm services:up`, then `pnpm db:migrate && pnpm db:seed`. In production DATABASE_URL must be set.
 * Everything else talks to the `DataStore` interface only, and the contract tests
 * (`src/lib/data/__tests__/`) pin down its behaviour.
 */
export const store: DataStore = createDrizzleStore(getDb())

export { NotFoundError } from "./repository"
