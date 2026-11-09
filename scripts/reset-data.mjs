// Reset local data to the sample seed: copies data/seed.json → data/db.json (or $DATA_FILE).
import { copyFileSync, mkdirSync } from "node:fs"
import path from "node:path"

const target = path.resolve(process.env.DATA_FILE ?? "data/db.json")
mkdirSync(path.dirname(target), { recursive: true })
copyFileSync(path.resolve("data/seed.json"), target)
console.log(`Reset ${path.relative(process.cwd(), target)} from data/seed.json`)
