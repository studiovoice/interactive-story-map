/**
 * Load data into Postgres from a json-driver file.
 *
 *   pnpm db:seed                      data/seed.json → empty database
 *   pnpm db:seed data/db.json         import your local json data instead
 *   pnpm db:seed --reset [file]       empty every table first
 *
 * Uses DATABASE_URL (from the environment, .env.local or .env). Run `pnpm db:migrate` first.
 */
import "./load-env"
import { readFileSync } from "node:fs"
import path from "node:path"
import { count } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { insertSnapshot, truncateAll, type Db } from "@/lib/data/drizzle/drizzle-store"
import { points, schema } from "@/lib/data/drizzle/schema"
import { parseSnapshot } from "@/lib/data/snapshot"

const args = process.argv.slice(2)
const reset = args.includes("--reset")
const file = path.resolve(args.find((a) => !a.startsWith("--")) ?? "data/seed.json")
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. See .env.example.")
  process.exit(1)
}

async function main(url: string) {
  const snapshot = parseSnapshot(JSON.parse(readFileSync(file, "utf8")))
  const client = postgres(url, { max: 1, onnotice: () => {} })
  const db = drizzle(client, { schema }) as unknown as Db

  try {
    await db.transaction(async (tx) => {
      if (reset) await truncateAll(tx)
      const [{ n }] = await tx.select({ n: count() }).from(points)
      if (n > 0) throw new Error("The database already has points. Run with --reset to replace everything.")
      await insertSnapshot(tx, snapshot)
    })
    console.log(
      `Loaded ${path.relative(process.cwd(), file)}: ${snapshot.points.length} points, ${snapshot.collections.length} collections, ` +
        `${snapshot.stories.length} stories, ${snapshot.chapters.length} chapters.`,
    )
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

void main(url)
