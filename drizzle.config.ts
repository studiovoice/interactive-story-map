import "./scripts/load-env"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  // Our tables, and Better Auth's (users, sessions, …).
  schema: ["./src/lib/data/drizzle/schema.ts", "./src/lib/data/drizzle/auth-schema.ts"],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://story:story@localhost:5432/story_map",
  },
  // PostGIS adds its own tables and views; keep drizzle-kit to ours.
  extensionsFilters: ["postgis"],
  // Our tables are in `public`, Better Auth's in `auth`.
  schemaFilter: ["public", "auth"],
  strict: true,
  verbose: true,
})
