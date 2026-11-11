import "server-only"

import {
  chapterDraftSchema,
  collectionInputSchema,
  pointInputSchema,
  storyInputSchema,
  type Chapter,
  type ChapterPoint,
  type CollectionSummary,
  type MapPoint,
  type Point,
  type PointUsage,
  type StoryDetail,
  type StorySummary,
} from "@/lib/domain/schema"
import { newId } from "@/lib/data/ids"
import { distance } from "@/lib/geo"
import { normalizePointLocation } from "@/lib/location"
import { matchesQuery } from "@/lib/points/match"
import { NotFoundError, type DataStore } from "@/lib/data/repository"
import { readDb, writeDb, type DbFile } from "./file-db"

const now = () => new Date().toISOString()
const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position

function must<T>(value: T | undefined, entity: string, id: string): T {
  if (!value) throw new NotFoundError(entity, id)
  return value
}

/* ───────────── read-model helpers (these become joins in SQL) ───────────── */

/** Stories/chapters using each point (or only `onlyId`), keyed by point id. */
function usageMap(db: DbFile, onlyId?: string): Record<string, PointUsage[]> {
  const stories = new Map(db.stories.map((s) => [s.id, s]))
  const collections = new Map(db.collections.map((c) => [c.id, c]))
  const chapters = new Map(db.chapters.map((c) => [c.id, c]))
  const chapterIndex = new Map<string, number>()
  for (const s of db.stories) {
    db.chapters
      .filter((c) => c.storyId === s.id)
      .sort(byPosition)
      .forEach((c, i) => chapterIndex.set(c.id, i))
  }
  const out: Record<string, PointUsage[]> = {}
  for (const cp of db.chapterPoints) {
    if (onlyId && cp.pointId !== onlyId) continue
    const chapter = chapters.get(cp.chapterId)
    const story = chapter && stories.get(chapter.storyId)
    const collection = story && collections.get(story.collectionId)
    if (!chapter || !story || !collection) continue
    ;(out[cp.pointId] ??= []).push({
      storyId: story.id,
      storyTitle: story.title,
      storyStatus: story.status,
      collectionId: collection.id,
      collectionTitle: collection.title,
      chapterId: chapter.id,
      chapterIndex: chapterIndex.get(chapter.id) ?? 0,
      chapterTitle: chapter.title,
    })
  }
  return out
}


function storyDetail(db: DbFile, storyId: string): StoryDetail | null {
  const story = db.stories.find((s) => s.id === storyId)
  if (!story) return null
  const collection = must(
    db.collections.find((c) => c.id === story.collectionId),
    "Collection",
    story.collectionId,
  )
  const pointsById = new Map(db.points.map((p) => [p.id, p]))
  const chapters = db.chapters
    .filter((c) => c.storyId === storyId)
    .sort(byPosition)
    .map((chapter) => ({
      ...chapter,
      points: db.chapterPoints
        .filter((cp) => cp.chapterId === chapter.id)
        .sort(byPosition)
        .flatMap((cp) => {
          const point = pointsById.get(cp.pointId)
          return point ? [{ ...cp, point }] : []
        }),
    }))
  return { ...story, collection, chapters }
}

function storyPointIds(db: DbFile, storyId: string) {
  const chapterIds = new Set(db.chapters.filter((c) => c.storyId === storyId).map((c) => c.id))
  return new Set(db.chapterPoints.filter((cp) => chapterIds.has(cp.chapterId)).map((cp) => cp.pointId))
}

function deleteStoryRows(db: DbFile, storyId: string) {
  const chapterIds = new Set(db.chapters.filter((c) => c.storyId === storyId).map((c) => c.id))
  db.chapterPoints = db.chapterPoints.filter((cp) => !chapterIds.has(cp.chapterId))
  db.chapters = db.chapters.filter((c) => c.storyId !== storyId)
  db.stories = db.stories.filter((s) => s.id !== storyId)
}

/* ───────────── the store ───────────── */

export function createJsonStore(): DataStore {
  return {
    points: {
      async list() {
        const db = await readDb()
        return [...db.points].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      },
      async get(id) {
        const db = await readDb()
        return db.points.find((p) => p.id === id) ?? null
      },
      async create(input) {
        const parsed = pointInputSchema.parse(input)
        const data = { ...parsed, ...normalizePointLocation(parsed) }
        return writeDb((db) => {
          const ts = now()
          const point: Point = { ...data, id: newId("pt"), createdAt: ts, updatedAt: ts }
          db.points.push(point)
          return point
        })
      },
      async update(id, input) {
        return writeDb((db) => {
          const i = db.points.findIndex((p) => p.id === id)
          if (i < 0) throw new NotFoundError("Point", id)
          const prev = db.points[i]
          const merged = pointInputSchema.parse({ ...prev, ...input })
          const location = normalizePointLocation(merged, prev)
          db.points[i] = { ...prev, ...merged, ...location, updatedAt: now() }
          return db.points[i]
        })
      },
      async delete(id) {
        return writeDb((db) => {
          db.points = db.points.filter((p) => p.id !== id)
          db.chapterPoints = db.chapterPoints.filter((cp) => cp.pointId !== id)
        })
      },
      async usage() {
        return usageMap(await readDb())
      },
      async mapList() {
        const db = await readDb()
        const used = new Set(db.chapterPoints.map((cp) => cp.pointId))
        return db.points.map(
          (p): MapPoint => ({
            id: p.id,
            title: p.title,
            kind: p.kind,
            location: p.location,
            locationPrecision: p.locationPrecision,
            locationRadiusM: p.locationRadiusM,
            inStory: used.has(p.id),
          }),
        )
      },
      async detail(id) {
        const db = await readDb()
        const point = db.points.find((p) => p.id === id)
        if (!point) return null
        return { point, usage: usageMap(db, id)[id] ?? [] }
      },
      async search({ q, near, limit = 5, maxIds = 5000 }) {
        const db = await readDb()
        const matches = db.points.filter((p) => matchesQuery(p, q))
        if (near) {
          const d = new Map(matches.map((p) => [p.id, distance(near, p.location)]))
          matches.sort((a, b) => d.get(a.id)! - d.get(b.id)!)
        }
        return {
          ids: matches.slice(0, maxIds).map((p) => p.id),
          total: matches.length,
          top: matches.slice(0, limit),
        }
      },
    },

    collections: {
      async list() {
        const db = await readDb()
        return db.collections
          .map((c): CollectionSummary => {
            const stories = db.stories.filter((s) => s.collectionId === c.id)
            const pointIds = new Set(stories.flatMap((s) => [...storyPointIds(db, s.id)]))
            return { ...c, storyCount: stories.length, pointCount: pointIds.size }
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      },
      async get(id) {
        const db = await readDb()
        return db.collections.find((c) => c.id === id) ?? null
      },
      async create(input) {
        const data = collectionInputSchema.parse(input)
        return writeDb((db) => {
          const ts = now()
          const collection = { ...data, id: newId("col"), createdAt: ts, updatedAt: ts }
          db.collections.push(collection)
          return collection
        })
      },
      async update(id, input) {
        return writeDb((db) => {
          const c = must(
            db.collections.find((x) => x.id === id),
            "Collection",
            id,
          )
          Object.assign(c, collectionInputSchema.parse({ ...c, ...input }), { updatedAt: now() })
          return c
        })
      },
      async delete(id) {
        return writeDb((db) => {
          for (const s of db.stories.filter((s) => s.collectionId === id)) deleteStoryRows(db, s.id)
          db.collections = db.collections.filter((c) => c.id !== id)
        })
      },
    },

    stories: {
      async listByCollection(collectionId) {
        const db = await readDb()
        return db.stories
          .filter((s) => s.collectionId === collectionId)
          .map((s): StorySummary => {
            const chapters = db.chapters.filter((c) => c.storyId === s.id)
            const ids = storyPointIds(db, s.id)
            const times = db.points
              .filter((p) => ids.has(p.id) && p.capturedAt)
              .map((p) => p.capturedAt!)
              .sort()
            return {
              ...s,
              chapterCount: chapters.length,
              pointCount: ids.size,
              startsAt: times[0] ?? null,
              endsAt: times.at(-1) ?? null,
            }
          })
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      },
      async get(id) {
        const db = await readDb()
        return db.stories.find((s) => s.id === id) ?? null
      },
      async getDetail(id) {
        return storyDetail(await readDb(), id)
      },
      async create(input) {
        const data = storyInputSchema.parse(input)
        return writeDb((db) => {
          must(
            db.collections.find((c) => c.id === data.collectionId),
            "Collection",
            data.collectionId,
          )
          const ts = now()
          const story = { ...data, id: newId("sty"), createdAt: ts, updatedAt: ts }
          db.stories.push(story)
          // Every story starts with one empty chapter so the editor has somewhere to put points.
          db.chapters.push({
            id: newId("ch"),
            storyId: story.id,
            position: 0,
            title: "Chapter 1",
            narrative: "",
            connection: "timeline",
            route: [],
            camera: null,
          })
          return story
        })
      },
      async update(id, input) {
        return writeDb((db) => {
          const s = must(
            db.stories.find((x) => x.id === id),
            "Story",
            id,
          )
          Object.assign(s, storyInputSchema.parse({ ...s, ...input, collectionId: s.collectionId }), {
            updatedAt: now(),
          })
          return s
        })
      },
      async delete(id) {
        return writeDb((db) => deleteStoryRows(db, id))
      },
      async saveChapters(storyId, drafts) {
        const parsed = drafts.map((d) => chapterDraftSchema.parse(d))
        return writeDb((db) => {
          const story = must(
            db.stories.find((s) => s.id === storyId),
            "Story",
            storyId,
          )
          const pointIds = new Set(db.points.map((p) => p.id))
          const oldIds = new Set(db.chapters.filter((c) => c.storyId === storyId).map((c) => c.id))
          db.chapters = db.chapters.filter((c) => c.storyId !== storyId)
          db.chapterPoints = db.chapterPoints.filter((cp) => !oldIds.has(cp.chapterId))

          parsed.forEach((d, position) => {
            const chapter: Chapter = {
              id: d.id,
              storyId,
              position,
              title: d.title,
              narrative: d.narrative,
              connection: d.connection,
              route: d.connection === "path" ? d.route : [],
              camera: d.camera,
            }
            db.chapters.push(chapter)
            const seen = new Set<string>()
            d.points
              .filter((p) => pointIds.has(p.pointId) && !seen.has(p.pointId) && seen.add(p.pointId))
              .forEach((p, i) => {
                const row: ChapterPoint = { chapterId: d.id, pointId: p.pointId, position: i, note: p.note }
                db.chapterPoints.push(row)
              })
          })
          story.updatedAt = now()
          return storyDetail(db, storyId)!
        })
      },
    },
  }
}
