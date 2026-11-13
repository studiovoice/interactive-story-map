/**
 * Postgres tables for the drizzle driver. They mirror the zod schemas in
 * `src/lib/domain/schema.ts` (and the arrays of the json driver's `DbFile`).
 *
 * After changing this file: `pnpm db:generate` writes a new migration to `drizzle/`,
 * `pnpm db:migrate` applies it. Not `server-only`: scripts and tests import it too.
 */
import { sql, type SQL } from "drizzle-orm"
import {
  check,
  doublePrecision,
  geometry,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core"
import {
  chapterConnections,
  locationPrecisions,
  pointKinds,
  storyStatuses,
  timePrecisions,
  type Camera,
  type LngLat,
  type MediaAsset,
} from "../../domain/schema" // relative: drizzle-kit doesn't resolve the @/ alias

/** `CHECK (col IN (...))` from one of the domain's `as const` arrays. */
const oneOf = (col: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${col} in (${sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", "))})`

/** Real instants, read back as JS Dates (the mappers turn them into ISO strings). */
const instant = (name: string) => timestamp(name, { withTimezone: true, mode: "date", precision: 3 }).notNull()

export const points = pgTable(
  "points",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    kind: text("kind").$type<(typeof pointKinds)[number]>().notNull(),
    /** [lng, lat], SRID 4326. For obscured points this is the shifted center, never the true spot. */
    location: geometry("location", { type: "point", mode: "tuple", srid: 4326 }).$type<LngLat>().notNull(),
    locationPrecision: text("location_precision").$type<(typeof locationPrecisions)[number]>().notNull(),
    locationRadiusM: doublePrecision("location_radius_m"),
    placeName: text("place_name").notNull().default(""),
    /** Wall-clock time at the place, no zone (see `localDateTimeSchema`). */
    capturedAt: timestamp("captured_at", { withTimezone: false, mode: "string", precision: 0 }),
    timePrecision: text("time_precision").$type<(typeof timePrecisions)[number]>().notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    contributor: text("contributor").notNull().default(""),
    media: jsonb("media").$type<MediaAsset[]>().notNull().default(sql`'[]'::jsonb`),
    /**
     * Lower-cased title, description, place name and tags joined by U+001F, kept in sync by the
     * store. One trigram-indexed column makes `ILIKE '%q%'` search fast.
     */
    searchText: text("search_text").notNull().default(""),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (t) => [
    index("points_location_idx").using("gist", t.location),
    index("points_search_text_idx").using("gin", t.searchText.op("gin_trgm_ops")),
    index("points_updated_at_idx").on(t.updatedAt.desc()),
    check("points_kind_check", oneOf(t.kind, pointKinds)),
    check("points_location_precision_check", oneOf(t.locationPrecision, locationPrecisions)),
    check("points_time_precision_check", oneOf(t.timePrecision, timePrecisions)),
  ],
)

export const collections = pgTable(
  "collections",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (t) => [index("collections_updated_at_idx").on(t.updatedAt.desc())],
)

export const stories = pgTable(
  "stories",
  {
    id: text("id").primaryKey(),
    collectionId: text("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    status: text("status").$type<(typeof storyStatuses)[number]>().notNull(),
    createdAt: instant("created_at"),
    updatedAt: instant("updated_at"),
  },
  (t) => [index("stories_collection_id_idx").on(t.collectionId), check("stories_status_check", oneOf(t.status, storyStatuses))],
)

export const chapters = pgTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    storyId: text("story_id")
      .notNull()
      .references(() => stories.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    narrative: text("narrative").notNull().default(""),
    connection: text("connection").$type<(typeof chapterConnections)[number]>().notNull(),
    /** LineString coordinates; only used when connection = "path". */
    route: jsonb("route").$type<LngLat[]>().notNull().default(sql`'[]'::jsonb`),
    /** null = fit the chapter's points. */
    camera: jsonb("camera").$type<Camera>(),
  },
  (t) => [
    uniqueIndex("chapters_story_position_idx").on(t.storyId, t.position),
    check("chapters_connection_check", oneOf(t.connection, chapterConnections)),
  ],
)

export const chapterPoints = pgTable(
  "chapter_points",
  {
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    pointId: text("point_id")
      .notNull()
      .references(() => points.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [primaryKey({ columns: [t.chapterId, t.pointId] }), index("chapter_points_point_id_idx").on(t.pointId)],
)

export const schema = { points, collections, stories, chapters, chapterPoints }
