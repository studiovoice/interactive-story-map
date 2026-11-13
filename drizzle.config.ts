import "./scripts/load-env"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/data/drizzle/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://story:story@localhost:5432/story_map",
  },
  // PostGIS adds its own tables and views; keep drizzle-kit to ours.
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
})
