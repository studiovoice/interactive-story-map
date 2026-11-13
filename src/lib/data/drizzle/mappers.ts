/**
 * Postgres rows ↔ domain objects. The domain types (and so the UI) see exactly what the
 * json driver returns: ISO strings for instants, "YYYY-MM-DDTHH:mm[:ss]" for capturedAt.
 */
import type { Chapter, ChapterPoint, Collection, Point, Story } from "@/lib/domain/schema"
import type { chapterPoints, chapters, collections, points, stories } from "./schema"

type PointRow = typeof points.$inferSelect
type CollectionRow = typeof collections.$inferSelect
type StoryRow = typeof stories.$inferSelect
type ChapterRow = typeof chapters.$inferSelect
type ChapterPointRow = typeof chapterPoints.$inferSelect

/** Instants come back as Dates (mode "date"); some drivers hand back strings for raw SQL. */
export const toIso = (v: Date | string) => (v instanceof Date ? v : new Date(v)).toISOString()

/**
 * Postgres `timestamp` text ("2026-03-14 10:05:00", maybe with fractions) → "2026-03-14T10:05",
 * keeping seconds only when they aren't :00.
 */
export function toLocalDateTime(v: string | null): string | null {
  if (!v) return null
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/.exec(v)
  if (!m) throw new Error(`Unexpected timestamp "${v}"`)
  const [, date, hm, sec] = m
  return sec && sec !== "00" ? `${date}T${hm}:${sec}` : `${date}T${hm}`
}

/** "2026-03-14T10:05" → "2026-03-14 10:05:00", what a `timestamp` column takes. */
export function fromLocalDateTime(v: string | null): string | null {
  if (!v) return null
  const [date, time] = v.split("T")
  return `${date} ${time.length === 5 ? `${time}:00` : time}`
}

const SEP = "\u001f"

/**
 * The text `search` matches against. Fields are joined with a control character the search box
 * can't produce, so a query never matches across two fields (same as `matchesQuery`).
 */
export function searchText(p: Pick<Point, "title" | "description" | "placeName" | "tags">): string {
  return [p.title, p.description, p.placeName, ...p.tags].join(SEP).toLowerCase()
}

/** Escape LIKE wildcards so the query is matched literally. */
export const likePattern = (q: string) => `%${q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`

export function toPoint(r: PointRow): Point {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    kind: r.kind,
    location: [r.location[0], r.location[1]],
    locationPrecision: r.locationPrecision,
    locationRadiusM: r.locationRadiusM,
    placeName: r.placeName,
    capturedAt: toLocalDateTime(r.capturedAt),
    timePrecision: r.timePrecision,
    tags: r.tags,
    contributor: r.contributor,
    media: r.media,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

export function fromPoint(p: Point): PointRow {
  return {
    ...p,
    capturedAt: fromLocalDateTime(p.capturedAt),
    searchText: searchText(p),
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  }
}

export function toCollection(r: CollectionRow): Collection {
  return { id: r.id, title: r.title, description: r.description, createdAt: toIso(r.createdAt), updatedAt: toIso(r.updatedAt) }
}

export function fromCollection(c: Collection): CollectionRow {
  return { ...c, createdAt: new Date(c.createdAt), updatedAt: new Date(c.updatedAt) }
}

export function toStory(r: StoryRow): Story {
  return {
    id: r.id,
    collectionId: r.collectionId,
    title: r.title,
    summary: r.summary,
    status: r.status,
    createdAt: toIso(r.createdAt),
    updatedAt: toIso(r.updatedAt),
  }
}

export function fromStory(s: Story): StoryRow {
  return { ...s, createdAt: new Date(s.createdAt), updatedAt: new Date(s.updatedAt) }
}

export function toChapter(r: ChapterRow): Chapter {
  return {
    id: r.id,
    storyId: r.storyId,
    position: r.position,
    title: r.title,
    narrative: r.narrative,
    connection: r.connection,
    route: r.route,
    camera: r.camera ?? null,
  }
}

export function toChapterPoint(r: ChapterPointRow): ChapterPoint {
  return { chapterId: r.chapterId, pointId: r.pointId, position: r.position, note: r.note }
}
