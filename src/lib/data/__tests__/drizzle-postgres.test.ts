import { describe, it } from "vitest"
import { describeStoreContract } from "./contract"
import { postgresHarness } from "./pg-harness"

// Opt-in: point TEST_DATABASE_URL at a database you don't mind wiping (e.g. the compose
// Postgres with a `story_map_test` database). Every test truncates all tables.
const url = process.env.TEST_DATABASE_URL

if (url) describeStoreContract("drizzle (Postgres)", () => postgresHarness(url))
else describe.skip("DataStore contract: drizzle (Postgres) — set TEST_DATABASE_URL to run", () => it("skipped", () => {}))
