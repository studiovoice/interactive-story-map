/**
 * Domain model + validation.
 *
 * Hierarchy:
 *   Point       a single upload (photo, video, audio, note) at a place and time.
 *               Points live on their own and can be reused by any number of stories.
 *   Collection  a big umbrella project, e.g. a campaign or movement ("Spring Mobilization").
 *   Story       a sub-event inside a collection, e.g. "March over the Brooklyn Bridge".
 *   Chapter     an ordered section of a story. Groups points and says how they connect:
 *               `path` (a drawn route, e.g. a march) or `timeline` (just chronological).
 *
 * The shapes below are deliberately relational (chapters and chapter_points are their
 * own tables) so they map 1:1 onto Drizzle/Postgres tables later.
 */
import { z } from "zod"

export const idSchema = z.string().min(1)

/** [lng, lat] — GeoJSON order. */
export const lngLatSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])
export type LngLat = z.infer<typeof lngLatSchema>

/**
 * Wall-clock local time at the place where it happened, without an offset:
 * "2026-03-14T10:05" (seconds optional). All timeline math treats it as UTC so the
 * displayed time is always the local time of the event, whatever the viewer's zone.
 * Later: store `timestamptz` + an IANA `timezone` column instead.
 */
export const localDateTimeSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "Use YYYY-MM-DDTHH:mm")

/* ───────────────────────── Media ───────────────────────── */

export const mediaKinds = ["image", "video", "audio", "document"] as const
export const mediaKindSchema = z.enum(mediaKinds)
export type MediaKind = z.infer<typeof mediaKindSchema>

/**
 * A file attached to a point. `source` says where the bytes live:
 * - `external`: a plain URL (works today, no storage needed)
 * - `storage`: an object in our bucket (S3/MinIO), addressed by `storageKey`;
 *   resolve it to a URL through `getStorage().getUrl(key)`.
 */
export const mediaAssetSchema = z.object({
  id: idSchema,
  kind: mediaKindSchema,
  source: z.enum(["external", "storage"]).default("external"),
  url: z.string().url().optional(),
  storageKey: z.string().optional(),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  /** For video/audio. */
  durationSec: z.number().nonnegative().optional(),
})
export type MediaAsset = z.infer<typeof mediaAssetSchema>

/* ───────────────────────── Points ───────────────────────── */

export const pointKinds = ["photo", "video", "audio", "note"] as const
export const pointKindSchema = z.enum(pointKinds)
export type PointKind = z.infer<typeof pointKindSchema>

export const timePrecisions = ["exact", "approximate"] as const
export const timePrecisionSchema = z.enum(timePrecisions)
export type TimePrecision = z.infer<typeof timePrecisionSchema>

/**
 * How exact a point's location is:
 * - `exact`: the pin is where it happened.
 * - `approximate`: somewhere within `locationRadiusM` of the pin (the contributor isn't sure).
 * - `obscured`: deliberately blurred for safety. The server stores a randomly shifted center
 *   (see lib/location.ts); the true spot is never saved or sent to the browser.
 */
export const locationPrecisions = ["exact", "approximate", "obscured"] as const
export const locationPrecisionSchema = z.enum(locationPrecisions)
export type LocationPrecision = z.infer<typeof locationPrecisionSchema>

export const pointInputSchema = z.object({
  title: z.string().trim().min(1, "Give the point a title").max(200),
  description: z.string().trim().max(5000).default(""),
  kind: pointKindSchema.default("photo"),
  location: lngLatSchema,
  locationPrecision: locationPrecisionSchema.default("exact"),
  /** Radius of the area in metres; null when the location is exact. */
  locationRadiusM: z.number().positive().max(50_000).nullable().default(null),
  placeName: z.string().trim().max(200).default(""),
  /** null when the time was not recorded. */
  capturedAt: localDateTimeSchema.nullable().default(null),
  timePrecision: timePrecisionSchema.default("exact"),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  contributor: z.string().trim().max(120).default(""),
  media: z.array(mediaAssetSchema).max(20).default([]),
})
export type PointInput = z.input<typeof pointInputSchema>

export const pointSchema = pointInputSchema.extend({
  id: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Point = z.infer<typeof pointSchema>

/* ───────────────────────── Collections ───────────────────────── */

export const collectionInputSchema = z.object({
  title: z.string().trim().min(1, "Give the collection a title").max(200),
  description: z.string().trim().max(5000).default(""),
})
export type CollectionInput = z.input<typeof collectionInputSchema>

export const collectionSchema = collectionInputSchema.extend({
  id: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Collection = z.infer<typeof collectionSchema>

/* ───────────────────────── Stories ───────────────────────── */

export const storyStatuses = ["draft", "published"] as const
export const storyStatusSchema = z.enum(storyStatuses)
export type StoryStatus = z.infer<typeof storyStatusSchema>

export const storyInputSchema = z.object({
  collectionId: idSchema,
  title: z.string().trim().min(1, "Give the story a title").max(200),
  summary: z.string().trim().max(5000).default(""),
  status: storyStatusSchema.default("draft"),
})
export type StoryInput = z.input<typeof storyInputSchema>

export const storySchema = storyInputSchema.extend({
  id: idSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Story = z.infer<typeof storySchema>

/* ───────────────────────── Chapters ───────────────────────── */

export const chapterConnections = ["timeline", "path"] as const
export const chapterConnectionSchema = z.enum(chapterConnections)
export type ChapterConnection = z.infer<typeof chapterConnectionSchema>

export const cameraSchema = z.object({
  center: lngLatSchema,
  zoom: z.number().min(0).max(24),
  bearing: z.number().default(0),
  pitch: z.number().min(0).max(85).default(45),
})
export type Camera = z.infer<typeof cameraSchema>

export const chapterSchema = z.object({
  id: idSchema,
  storyId: idSchema,
  position: z.number().int().nonnegative(),
  title: z.string().trim().max(200),
  narrative: z.string().trim().max(5000).default(""),
  connection: chapterConnectionSchema.default("timeline"),
  /** Only used when connection = "path". A LineString's coordinates. */
  route: z.array(lngLatSchema).default([]),
  /** null = fit the chapter's points automatically. */
  camera: cameraSchema.nullable().default(null),
})
export type Chapter = z.infer<typeof chapterSchema>

/** Join table: which points are in which chapter, in what order. */
export const chapterPointSchema = z.object({
  chapterId: idSchema,
  pointId: idSchema,
  position: z.number().int().nonnegative(),
  /** Optional editor's note shown with the point in playback ("Meanwhile, two blocks west…"). */
  note: z.string().trim().max(500).default(""),
})
export type ChapterPoint = z.infer<typeof chapterPointSchema>

/**
 * What the story editor saves in one go: the whole chapter list, in order.
 * `id` is kept for existing chapters so references stay stable.
 */
export const chapterDraftSchema = z.object({
  id: idSchema,
  title: z.string().trim().max(200),
  narrative: z.string().trim().max(5000).default(""),
  connection: chapterConnectionSchema.default("timeline"),
  route: z.array(lngLatSchema).default([]),
  camera: cameraSchema.nullable().default(null),
  points: z.array(z.object({ pointId: idSchema, note: z.string().trim().max(500).default("") })).default([]),
})
export type ChapterDraft = z.input<typeof chapterDraftSchema>

/* ───────────────────────── Composite read models ───────────────────────── */

export type ChapterWithPoints = Chapter & {
  points: (ChapterPoint & { point: Point })[]
}

export type StoryDetail = Story & {
  collection: Collection
  chapters: ChapterWithPoints[]
}

export type CollectionSummary = Collection & {
  storyCount: number
  pointCount: number
}

export type StorySummary = Story & {
  chapterCount: number
  pointCount: number
  /** Earliest / latest capturedAt of the story's points. */
  startsAt: string | null
  endsAt: string | null
}

/** Where a point is used, for the "Part of a story" panel. */
export type PointUsage = {
  storyId: string
  storyTitle: string
  storyStatus: StoryStatus
  collectionId: string
  collectionTitle: string
  chapterId: string
  chapterIndex: number
  chapterTitle: string
}
