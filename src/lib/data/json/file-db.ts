import "server-only"

import { existsSync } from "node:fs"
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import type { Chapter, ChapterPoint, Collection, Point, Story } from "@/lib/domain/schema"

/** One array per future SQL table. */
export type DbFile = {
  version: 1
  points: Point[]
  collections: Collection[]
  stories: Story[]
  chapters: Chapter[]
  chapterPoints: ChapterPoint[]
}

// turbopackIgnore: the path is only known at runtime; don't trace the whole project for it.
const DATA_FILE = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DATA_FILE ?? "data/db.json")
const SEED_FILE = path.join(process.cwd(), "data", "seed.json")

const EMPTY: DbFile = {
  version: 1,
  points: [],
  collections: [],
  stories: [],
  chapters: [],
  chapterPoints: [],
}

async function ensureFile() {
  if (existsSync(DATA_FILE)) return
  await mkdir(path.dirname(DATA_FILE), { recursive: true })
  if (existsSync(SEED_FILE)) await copyFile(SEED_FILE, DATA_FILE)
  else await writeFile(DATA_FILE, JSON.stringify(EMPTY, null, 2))
}

async function load(): Promise<DbFile> {
  await ensureFile()
  const raw = await readFile(DATA_FILE, "utf8")
  const db = { ...EMPTY, ...(JSON.parse(raw) as Partial<DbFile>) } as DbFile
  // Backfill fields added after a db.json was created (a tiny "migration").
  db.points = db.points.map((p) => ({
    ...p,
    locationPrecision: p.locationPrecision ?? "exact",
    locationRadiusM: p.locationRadiusM ?? null,
  }))
  return db
}

/* All writes go through one queue so concurrent server actions can't clobber each other. */
let queue: Promise<unknown> = Promise.resolve()

export function readDb(): Promise<DbFile> {
  // Reads wait for pending writes so a redirect after a mutation sees fresh data.
  return queue.then(load, load)
}

/**
 * Run `fn` against a fresh copy of the db and persist the result atomically
 * (write to a temp file, then rename). Think of it as a transaction.
 */
export function writeDb<T>(fn: (db: DbFile) => T | Promise<T>): Promise<T> {
  const run = async () => {
    const db = await load()
    const result = await fn(db)
    const tmp = `${DATA_FILE}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(db, null, 2))
    await rename(tmp, DATA_FILE)
    return result
  }
  const next = queue.then(run, run)
  queue = next.catch(() => undefined)
  return next
}
