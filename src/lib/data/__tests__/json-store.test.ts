import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describeStoreContract } from "./contract"

const EMPTY = { version: 1, points: [], collections: [], stories: [], chapters: [], chapterPoints: [] }

describeStoreContract("json", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "story-map-json-"))
  const file = path.join(dir, "db.json")
  const reset = async () => writeFileSync(file, JSON.stringify(EMPTY))
  await reset()
  // file-db reads DATA_FILE when it's first imported.
  process.env.DATA_FILE = file
  const { createJsonStore } = await import("@/lib/data/json/json-store")
  return { store: createJsonStore(), reset, close: async () => rmSync(dir, { recursive: true, force: true }) }
})
