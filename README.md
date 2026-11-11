# Interactive Story Map

Upload points (photos, videos, notes) at a place and time, group them into stories, and play the stories back on a map.

A proof of concept and prototpying of an interactive map with story playback capabilities, exploring the integration of geographic navigation and narrative experiences.

This is in relation to the VOICE platform being worked on at https://github.com/studiovoice/web.

## Concepts

| Thing          | What it is                                                                                                                                                                              |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Point**      | One upload at a place and time: photo, video, audio or note, plus description, tags, contributor and media links. Points stand on their own and can be reused by any number of stories. |
| **Collection** | A big umbrella project, such as a campaign or movement ("Spring Mobilization 2026"). Holds stories.                                                                                     |
| **Story**      | One event inside a collection ("March over the Brooklyn Bridge"). Draft or published.                                                                                                   |
| **Chapter**    | An ordered section of a story. Groups points and sets how they connect: **Path** (a drawn route revealed as it plays, e.g. a march) or **Timeline** (chronological, no line).           |

A point's location can be **exact**, **approximate** (somewhere within a radius) or **hidden for privacy**. For
hidden points the server stores a center moved to a random spot inside the circle, and the exact spot is never
saved (see [`src/lib/location.ts`](src/lib/location.ts)). Fuzzy points are drawn as dashed circles (can be turned off in
the header's settings menu), and routes don't snap to them.

Within a story a point belongs to at most one chapter. Chapters can each have a saved camera view; otherwise they fit
their points.

## Getting started

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

On first run `data/db.json` is created from `data/seed.json` (the prototype's fictional Brooklyn Bridge story plus 26
unrelated nearby points). `pnpm data:reset` puts it back to the seed. `db.json` is git-ignored.

Other scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format`.

## Screens

| Route                              | What it does                                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                | Map of every point (clustered when zoomed out). Search, click for details, "Play from here" into any story that uses the point, drop a new point on the map.                    |
| `/points`                          | Table of points with search, edit, delete.                                                                                                                                      |
| `/points/new`, `/points/[id]/edit` | Point form with a map location picker (`?lng=&lat=` pre-fills the pin).                                                                                                         |
| `/collections`                     | Collections grid; create.                                                                                                                                                       |
| `/collections/[id]`                | Collection detail: edit/delete it, list/create/delete its stories.                                                                                                              |
| `/stories/[id]`                    | Playback: the prototype's story view, driven by real data. `?at=<pointId>` starts at a point, `&autoplay=1` plays.                                                              |
| `/stories/[id]/edit`               | Story editor: chapters (add, reorder, delete), points per chapter (from the map or a searchable list), path/timeline, route drawing, camera, notes. Save with the button or ⌘S. |

## Project layout

```
src/
  app/                      routes (thin: fetch data inside <Suspense>, render a component)
  components/
    map/                    MapLibre wrapper: <MapView>, <PointsLayer> (many points, WebGL, clustering), <MapLayer> (GeoJSON),
                            <MapMarker> (one DOM marker, React portal), camera helpers, marker CSS
    points/                 explore map, detail panel, table, form, location picker, media/placeholder
    collections/            dialogs and actions for collections/stories
    stories/                player, timeline track, editor, chapter card, point browser
    ui/                     shadcn/ui components (generated)
  lib/
    domain/schema.ts        zod schemas + types for everything (single source of truth)
    data/                   persistence: DataStore interface + json driver
    storage/                object-storage interface (no uploads yet)
    story/timeline.ts       pure: story → playback timeline (chapter spans, compressed gaps, positions, clock, route front)
    actions.ts              server actions (all mutations)
    queries.ts              server-side reads for pages
    time.ts, geo.ts         helpers
data/seed.json              sample data
prototype/                  original HTML prototypes
```

## Persistence: JSON file now, Drizzle + Postgres later

Pages and server actions only use `store` from `src/lib/data`, which implements the `DataStore` interface in
[`src/lib/data/repository.ts`](src/lib/data/repository.ts). Today the `json` driver keeps one file with one array per
future table (`points`, `collections`, `stories`, `chapters`, `chapterPoints`). Writes are queued and written atomically.

To move to Postgres:

1. `pnpm add drizzle-orm postgres && pnpm add -D drizzle-kit`, and run Postgres (e.g. Docker).
2. Write `src/lib/data/drizzle/schema.ts`. The tables mirror `DbFile` in `src/lib/data/json/file-db.ts` and the zod
   schemas in `src/lib/domain/schema.ts`:
   - `points`: id text pk, title, description, kind, `location` (two doubles or PostGIS `geometry(Point,4326)`),
     location_precision, location_radius_m, place_name, captured_at, time_precision, tags `text[]`, contributor, media `jsonb`, timestamps
   - `collections`: id, title, description, timestamps
   - `stories`: id, collection_id → collections (cascade), title, summary, status, timestamps
   - `chapters`: id, story_id → stories (cascade), position, title, narrative, connection, route `jsonb`, camera `jsonb`
   - `chapter_points`: chapter_id → chapters (cascade), point_id → points (cascade), position, note; pk (chapter_id, point_id)
3. Implement `createDrizzleStore(): DataStore` in `src/lib/data/drizzle/`. `saveChapters` becomes one transaction
   (delete the story's chapters, insert the new ones).
4. Add a `case "drizzle"` in `src/lib/data/index.ts` and set `DATA_DRIVER=drizzle`.
5. Optional: a one-off script that reads `data/db.json` and inserts it.

IDs are prefixed strings (`pt_…`, `col_…`), so they work as text primary keys as they are.

**Times:** `capturedAt` is stored as the local wall-clock time at the place (`2026-03-14T10:05`, no offset), and all
math treats it as UTC. Playback then always shows the event's local time, whatever the viewer's timezone. In Postgres,
use `timestamptz` plus a `timezone` column if you need real instants.

## Media and storage: URLs now, S3/MinIO later

`MediaAsset` has a `source`: `external` (a plain URL, which works today) or `storage` (an object key in our bucket).
Points without media get a generated placeholder scene, like the prototype.
[`src/lib/storage/index.ts`](src/lib/storage/index.ts) defines `StorageProvider` (`getUrl`, `createUploadUrl`,
`delete`). The current `none` provider sets `canUpload = false`, so the form's "Upload file" button is disabled.

To add MinIO/S3: implement the interface with `@aws-sdk/client-s3` (presigned PUT), select it with
`NEXT_PUBLIC_STORAGE_DRIVER=s3`, add a server action that returns `createUploadUrl()`, upload from the point form, and
save `{ source: "storage", storageKey }`.

## Loading points on maps

Maps that show many points (explore, the point form's location picker, the story editor) draw them with
[`<PointsLayer>`](src/components/map/points-layer.tsx): one GPU-drawn GeoJSON layer instead of a DOM element per point,
with hover labels and click handling. On the explore map nearby points merge into numbered clusters when zoomed out
(click one to zoom in), and approximate areas only show from street level.

The explore map gets a small `MapPoint` per point (`getMapPoints()` → `store.points.mapList()`: id, title, kind,
location, precision, in-a-story). Everything else is loaded when a point is opened (`GET /api/points/:id`), and the
search box asks the server (`GET /api/points/search?q=&lat=&lng=`), which returns every matching id (to filter the map)
and the closest few in full. This holds up to tens of thousands of points: with 10,000 the page is about 200 KB
gzipped and panning stays at 60 fps.

Next step, when that's not enough: make `mapList` take a map tile (`/api/points/tiles/{z}/{x}/{y}`) and load tiles as
the map moves, then move the query to PostGIS (a GiST index, and eventually `ST_AsMVT` vector tiles). `PointsLayer`
only needs its data source changed. Still loading everything today: the points table (`/points`) and the story
editor (it needs full points for its chapter lists); both should page or search on the server once data grows.

## Place search

The map search boxes also find places (streets, parks, neighbourhoods, cities) and fly the map there. On the explore
map one box does both: typing filters the points and lists matching points and places together. The point form uses
it to jump to a spot (dropping the pin and filling the place name if they're empty), and the story editor has a
"Jump to a place" box.

The browser calls `GET /api/geocode?q=…&lat=…&lng=…`, which calls [`src/lib/geocoding`](src/lib/geocoding). Results
are biased toward the current map center and cached for a day with `"use cache"`. The default provider is the public
[Photon](https://photon.komoot.io) instance (OpenStreetMap data, fair use, made for search-as-you-type). For real
traffic, self-host Photon and set `PHOTON_URL`, or add another provider (Pelias, MapTiler, Mapbox) as a new
`GEOCODER` case. The public Nominatim server isn't used because its policy forbids autocomplete.

## Notes

- Next.js 16 with Cache Components: data reads call `connection()` and render inside `<Suspense>`. Mutations call
  `revalidatePath("/", "layout")`. See `AGENTS.md` and `node_modules/next/dist/docs/` for this version's APIs.
- Maps: MapLibre GL 5 with OpenFreeMap tiles (Positron / Dark, following the theme). HTML markers are fine for
  hundreds of points; switch to a clustered GeoJSON layer when the data grows.
- Viewer preferences (theme, map display options) live in the header's settings menu and are stored in localStorage via
  [`src/lib/settings.ts`](src/lib/settings.ts). Add a setting there and a row in `src/components/settings-menu.tsx`.
- There's no auth yet. Every server action has a `TODO(auth)` spot (see the top of `src/lib/actions.ts`).
