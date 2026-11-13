/**
 * The json driver's file format (`data/seed.json`, `data/db.json`), validated. Used to seed or
 * import into Postgres. Pure: no `server-only`, so scripts and tests can use it.
 */
import { z } from "zod"
import { chapterPointSchema, chapterSchema, collectionSchema, pointSchema, storySchema } from "@/lib/domain/schema"

export const snapshotSchema = z.object({
  version: z.literal(1).optional(),
  points: z.array(pointSchema).default([]),
  collections: z.array(collectionSchema).default([]),
  stories: z.array(storySchema).default([]),
  chapters: z.array(chapterSchema).default([]),
  chapterPoints: z.array(chapterPointSchema).default([]),
})
export type Snapshot = z.infer<typeof snapshotSchema>

/** Parse and check references, so a broken file fails before anything is written. */
export function parseSnapshot(json: unknown): Snapshot {
  const snap = snapshotSchema.parse(json)
  const ids = (rows: { id: string }[]) => new Set(rows.map((r) => r.id))
  const collectionIds = ids(snap.collections)
  const storyIds = ids(snap.stories)
  const chapterIds = ids(snap.chapters)
  const pointIds = ids(snap.points)
  const problems: string[] = []
  for (const s of snap.stories)
    if (!collectionIds.has(s.collectionId)) problems.push(`story ${s.id} → missing collection ${s.collectionId}`)
  for (const c of snap.chapters) if (!storyIds.has(c.storyId)) problems.push(`chapter ${c.id} → missing story ${c.storyId}`)
  for (const cp of snap.chapterPoints) {
    if (!chapterIds.has(cp.chapterId)) problems.push(`chapter point → missing chapter ${cp.chapterId}`)
    if (!pointIds.has(cp.pointId)) problems.push(`chapter point → missing point ${cp.pointId}`)
  }
  if (problems.length) throw new Error(`Snapshot has broken references:\n  ${problems.slice(0, 20).join("\n  ")}`)
  return snap
}
