/**
 * `DataStore` on Postgres via Drizzle. Behaves like the json driver (the contract tests in
 * `src/lib/data/__tests__` check both). Takes the db so tests can pass PGlite or a test database;
 * the app gets its db from `./client.ts`.
 */
import { asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm"
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import {
  chapterDraftSchema,
  collectionInputSchema,
  pointInputSchema,
  storyInputSchema,
  type ChapterWithPoints,
  type CollectionSummary,
  type LngLat,
  type MapPoint,
  type Point,
  type PointUsage,
  type StoryDetail,
  type StorySummary,
} from "@/lib/domain/schema"
import { newId } from "@/lib/data/ids"
import { normalizePointLocation } from "@/lib/location"
import { NotFoundError, type DataStore } from "@/lib/data/repository"
import {
  fromCollection,
  fromPoint,
  fromStory,
  likePattern,
  toChapter,
  toChapterPoint,
  toCollection,
  toLocalDateTime,
  toPoint,
  toStory,
} from "./mappers"
import { chapterPoints, chapters, collections, points, schema, stories } from "./schema"

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- works with any pg driver (postgres.js, PGlite)
export type Db = PgDatabase<PgQueryResultHKT, typeof schema, any>

const now = () => new Date()

/** A `timestamp` aggregate as text, so no driver turns it into a zone-shifted Date. */
const localText = (expr: SQL) => sql<string | null>`to_char(${expr}, 'YYYY-MM-DD"T"HH24:MI:SS')`

const point4326 = ([lng, lat]: LngLat) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`

/**
 * `"table"."column"` for correlated subqueries. Drizzle prints `${table.column}` unqualified in
 * single-table selects, which would bind to the subquery's own table instead of the outer one.
 */
const outer = (table: "points" | "collections" | "stories" | "chapters", column: string) =>
  sql.raw(`"${table}"."${column}"`)

/* ───────────── read helpers (shared by reads and by writes inside transactions) ───────────── */

async function getPointRow(db: Db, id: string, forUpdate = false) {
  const q = db.select().from(points).where(eq(points.id, id))
  const [row] = forUpdate ? await q.for("update") : await q
  return row ?? null
}

/** Stories/chapters that use each point (or only `onlyId`), keyed by point id. */
async function usageMap(db: Db, onlyId?: string): Promise<Record<string, PointUsage[]>> {
  const rows = await db
    .select({
      pointId: chapterPoints.pointId,
      storyId: stories.id,
      storyTitle: stories.title,
      storyStatus: stories.status,
      collectionId: collections.id,
      collectionTitle: collections.title,
      chapterId: chapters.id,
      // Index among the story's chapters (positions are kept 0..n-1, but don't rely on it).
      chapterIndex: sql<number>`(select count(*) from ${chapters} c2 where c2.story_id = ${outer("chapters", "story_id")} and c2.position < ${outer("chapters", "position")})`.mapWith(
        Number,
      ),
      chapterTitle: chapters.title,
    })
    .from(chapterPoints)
    .innerJoin(chapters, eq(chapters.id, chapterPoints.chapterId))
    .innerJoin(stories, eq(stories.id, chapters.storyId))
    .innerJoin(collections, eq(collections.id, stories.collectionId))
    .where(onlyId ? eq(chapterPoints.pointId, onlyId) : undefined)
    .orderBy(asc(stories.createdAt), asc(stories.id), asc(chapters.position))

  const out: Record<string, PointUsage[]> = {}
  for (const { pointId, ...usage } of rows) (out[pointId] ??= []).push(usage)
  return out
}

async function storyDetail(db: Db, storyId: string): Promise<StoryDetail | null> {
  const [row] = await db
    .select({ story: stories, collection: collections })
    .from(stories)
    .innerJoin(collections, eq(collections.id, stories.collectionId))
    .where(eq(stories.id, storyId))
  if (!row) return null

  const chapterRows = await db.select().from(chapters).where(eq(chapters.storyId, storyId)).orderBy(asc(chapters.position))
  const memberRows = chapterRows.length
    ? await db
        .select({ cp: chapterPoints, point: points })
        .from(chapterPoints)
        .innerJoin(points, eq(points.id, chapterPoints.pointId))
        .where(
          inArray(
            chapterPoints.chapterId,
            chapterRows.map((c) => c.id),
          ),
        )
        .orderBy(asc(chapterPoints.position))
    : []

  const byChapter = new Map<string, ChapterWithPoints["points"]>()
  for (const { cp, point } of memberRows) {
    const list = byChapter.get(cp.chapterId) ?? []
    list.push({ ...toChapterPoint(cp), point: toPoint(point) })
    byChapter.set(cp.chapterId, list)
  }
  return {
    ...toStory(row.story),
    collection: toCollection(row.collection),
    chapters: chapterRows.map((c) => ({ ...toChapter(c), points: byChapter.get(c.id) ?? [] })),
  }
}

/* ───────────── the store ───────────── */

export function createDrizzleStore(db: Db): DataStore {
  return {
    points: {
      async list() {
        const rows = await db.select().from(points).orderBy(desc(points.updatedAt), asc(points.id))
        return rows.map(toPoint)
      },
      async get(id) {
        const row = await getPointRow(db, id)
        return row ? toPoint(row) : null
      },
      async create(input) {
        const parsed = pointInputSchema.parse(input)
        const ts = now().toISOString()
        const point: Point = {
          ...parsed,
          ...normalizePointLocation(parsed),
          id: newId("pt"),
          createdAt: ts,
          updatedAt: ts,
        }
        const [row] = await db.insert(points).values(fromPoint(point)).returning()
        return toPoint(row)
      },
      async update(id, input) {
        return db.transaction(async (tx) => {
          const prevRow = await getPointRow(tx, id, true)
          if (!prevRow) throw new NotFoundError("Point", id)
          const prev = toPoint(prevRow)
          const merged = pointInputSchema.parse({ ...prev, ...input })
          const next: Point = { ...prev, ...merged, ...normalizePointLocation(merged, prev), updatedAt: now().toISOString() }
          const row = fromPoint(next)
          const [updated] = await tx
            .update(points)
            .set({ ...row, id: undefined, createdAt: undefined })
            .where(eq(points.id, id))
            .returning()
          return toPoint(updated)
        })
      },
      async delete(id) {
        // chapter_points rows go with it (ON DELETE CASCADE).
        await db.delete(points).where(eq(points.id, id))
      },
      async usage() {
        return usageMap(db)
      },
      async mapList() {
        const rows = await db
          .select({
            id: points.id,
            title: points.title,
            kind: points.kind,
            location: points.location,
            locationPrecision: points.locationPrecision,
            locationRadiusM: points.locationRadiusM,
            inStory: sql<boolean>`exists (select 1 from ${chapterPoints} cp where cp.point_id = ${outer("points", "id")})`,
          })
          .from(points)
          .orderBy(asc(points.createdAt), asc(points.id))
        return rows.map((r): MapPoint => ({ ...r, location: [r.location[0], r.location[1]], inStory: !!r.inStory }))
      },
      async detail(id) {
        const row = await getPointRow(db, id)
        if (!row) return null
        return { point: toPoint(row), usage: (await usageMap(db, id))[id] ?? [] }
      },
      async search({ q, near, limit = 5, maxIds = 5000 }) {
        const where = q.trim() ? sql`${points.searchText} like ${likePattern(q)}` : undefined
        const order = near
          ? [sql`${points.location}::geography <-> ${point4326(near)}::geography`, asc(points.id)]
          : [asc(points.createdAt), asc(points.id)]
        const matches = await db
          .select({ id: points.id, total: sql<number>`count(*) over ()`.mapWith(Number) })
          .from(points)
          .where(where)
          .orderBy(...order)
          .limit(maxIds)
        const topIds = matches.slice(0, limit).map((m) => m.id)
        const topRows = topIds.length ? await db.select().from(points).where(inArray(points.id, topIds)) : []
        const byId = new Map(topRows.map((r) => [r.id, toPoint(r)]))
        return {
          ids: matches.map((m) => m.id),
          total: matches[0]?.total ?? 0,
          top: topIds.flatMap((id) => byId.get(id) ?? []),
        }
      },
    },

    collections: {
      async list() {
        const storyCount = sql<number>`(select count(*) from ${stories} s where s.collection_id = ${outer("collections", "id")})`
        const pointCount = sql<number>`(
          select count(distinct cp.point_id) from ${chapterPoints} cp
          join ${chapters} ch on ch.id = cp.chapter_id
          join ${stories} s on s.id = ch.story_id
          where s.collection_id = ${outer("collections", "id")})`
        const rows = await db
          .select({ c: collections, storyCount: storyCount.mapWith(Number), pointCount: pointCount.mapWith(Number) })
          .from(collections)
          .orderBy(desc(collections.updatedAt), asc(collections.id))
        return rows.map((r): CollectionSummary => ({ ...toCollection(r.c), storyCount: r.storyCount, pointCount: r.pointCount }))
      },
      async get(id) {
        const [row] = await db.select().from(collections).where(eq(collections.id, id))
        return row ? toCollection(row) : null
      },
      async create(input) {
        const data = collectionInputSchema.parse(input)
        const ts = now().toISOString()
        const [row] = await db
          .insert(collections)
          .values(fromCollection({ ...data, id: newId("col"), createdAt: ts, updatedAt: ts }))
          .returning()
        return toCollection(row)
      },
      async update(id, input) {
        return db.transaction(async (tx) => {
          const [prev] = await tx.select().from(collections).where(eq(collections.id, id)).for("update")
          if (!prev) throw new NotFoundError("Collection", id)
          const data = collectionInputSchema.parse({ ...toCollection(prev), ...input })
          const [row] = await tx
            .update(collections)
            .set({ title: data.title, description: data.description, updatedAt: now() })
            .where(eq(collections.id, id))
            .returning()
          return toCollection(row)
        })
      },
      async delete(id) {
        // Stories, their chapters and chapter_points cascade; points stay.
        await db.delete(collections).where(eq(collections.id, id))
      },
    },

    stories: {
      async listByCollection(collectionId) {
        const storyPoints = sql`(
          select distinct cp.point_id from ${chapterPoints} cp
          join ${chapters} ch on ch.id = cp.chapter_id
          where ch.story_id = ${outer("stories", "id")})`
        const rows = await db
          .select({
            s: stories,
            chapterCount: sql<number>`(select count(*) from ${chapters} ch where ch.story_id = ${outer("stories", "id")})`.mapWith(
              Number,
            ),
            pointCount: sql<number>`(select count(*) from ${storyPoints} sp)`.mapWith(Number),
            startsAt: sql<string | null>`(select ${localText(sql`min(p.captured_at)`)} from ${points} p where p.id in ${storyPoints})`,
            endsAt: sql<string | null>`(select ${localText(sql`max(p.captured_at)`)} from ${points} p where p.id in ${storyPoints})`,
          })
          .from(stories)
          .where(eq(stories.collectionId, collectionId))
          .orderBy(desc(stories.updatedAt), asc(stories.id))
        return rows.map(
          (r): StorySummary => ({
            ...toStory(r.s),
            chapterCount: r.chapterCount,
            pointCount: r.pointCount,
            startsAt: toLocalDateTime(r.startsAt),
            endsAt: toLocalDateTime(r.endsAt),
          }),
        )
      },
      async get(id) {
        const [row] = await db.select().from(stories).where(eq(stories.id, id))
        return row ? toStory(row) : null
      },
      async getDetail(id) {
        return storyDetail(db, id)
      },
      async create(input) {
        const data = storyInputSchema.parse(input)
        return db.transaction(async (tx) => {
          const [collection] = await tx
            .select({ id: collections.id })
            .from(collections)
            .where(eq(collections.id, data.collectionId))
          if (!collection) throw new NotFoundError("Collection", data.collectionId)
          const ts = now().toISOString()
          const [row] = await tx
            .insert(stories)
            .values(fromStory({ ...data, id: newId("sty"), createdAt: ts, updatedAt: ts }))
            .returning()
          // Every story starts with one empty chapter so the editor has somewhere to put points.
          await tx.insert(chapters).values({
            id: newId("ch"),
            storyId: row.id,
            position: 0,
            title: "Chapter 1",
            narrative: "",
            connection: "timeline",
            route: [],
            camera: null,
          })
          return toStory(row)
        })
      },
      async update(id, input) {
        return db.transaction(async (tx) => {
          const [prev] = await tx.select().from(stories).where(eq(stories.id, id)).for("update")
          if (!prev) throw new NotFoundError("Story", id)
          const data = storyInputSchema.parse({ ...toStory(prev), ...input, collectionId: prev.collectionId })
          const [row] = await tx
            .update(stories)
            .set({ title: data.title, summary: data.summary, status: data.status, updatedAt: now() })
            .where(eq(stories.id, id))
            .returning()
          return toStory(row)
        })
      },
      async delete(id) {
        await db.delete(stories).where(eq(stories.id, id))
      },
      async saveChapters(storyId, drafts) {
        const parsed = drafts.map((d) => chapterDraftSchema.parse(d))
        return db.transaction(async (tx) => {
          // Lock the story so two saves of the same story can't interleave.
          const [story] = await tx.select({ id: stories.id }).from(stories).where(eq(stories.id, storyId)).for("update")
          if (!story) throw new NotFoundError("Story", storyId)

          const wanted = [...new Set(parsed.flatMap((d) => d.points.map((p) => p.pointId)))]
          const existing = new Set(
            wanted.length
              ? (await tx.select({ id: points.id }).from(points).where(inArray(points.id, wanted))).map((r) => r.id)
              : [],
          )

          // chapter_points of the old chapters go with them (ON DELETE CASCADE).
          await tx.delete(chapters).where(eq(chapters.storyId, storyId))

          if (parsed.length) {
            await tx.insert(chapters).values(
              parsed.map((d, position) => ({
                id: d.id,
                storyId,
                position,
                title: d.title,
                narrative: d.narrative,
                connection: d.connection,
                route: d.connection === "path" ? d.route : [],
                camera: d.camera,
              })),
            )
            const members = parsed.flatMap((d) => {
              const seen = new Set<string>()
              return d.points
                .filter((p) => existing.has(p.pointId) && !seen.has(p.pointId) && seen.add(p.pointId))
                .map((p, position) => ({ chapterId: d.id, pointId: p.pointId, position, note: p.note }))
            })
            if (members.length) await tx.insert(chapterPoints).values(members)
          }

          await tx.update(stories).set({ updatedAt: now() }).where(eq(stories.id, storyId))
          return (await storyDetail(tx, storyId))!
        })
      },
    },
  }
}

/** Rows of `data/seed.json` (or a `db.json`) → tables, in foreign-key order. Used by the seed script. */
export async function insertSnapshot(
  db: Db,
  data: {
    points: Point[]
    collections: Parameters<typeof fromCollection>[0][]
    stories: Parameters<typeof fromStory>[0][]
    chapters: (typeof chapters.$inferInsert)[]
    chapterPoints: (typeof chapterPoints.$inferInsert)[]
  },
) {
  const chunks = <T>(rows: T[], size = 500) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size))
  for (const rows of chunks(data.collections)) await db.insert(collections).values(rows.map(fromCollection))
  for (const rows of chunks(data.stories)) await db.insert(stories).values(rows.map(fromStory))
  for (const rows of chunks(data.points)) await db.insert(points).values(rows.map(fromPoint))
  for (const rows of chunks(data.chapters)) await db.insert(chapters).values(rows)
  for (const rows of chunks(data.chapterPoints)) await db.insert(chapterPoints).values(rows)
}

/** Empty every table (tests and `db:seed --reset`). */
export async function truncateAll(db: Db) {
  await db.execute(sql`truncate ${chapterPoints}, ${chapters}, ${stories}, ${collections}, ${points}`)
}
