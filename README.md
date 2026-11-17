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

### With Postgres and file uploads (Docker)

`docker-compose.yml` runs Postgres (with PostGIS) and [RustFS](https://github.com/rustfs/rustfs), an S3-compatible
object store. The app itself still runs with `pnpm dev`.

```bash
cp .env.example .env.local   # then set DATA_DRIVER=drizzle and NEXT_PUBLIC_STORAGE_DRIVER=s3
pnpm services:up             # start Postgres + RustFS, create the bucket
pnpm db:migrate              # create the tables
pnpm db:seed                 # load data/seed.json (or: pnpm db:seed data/db.json to import your local data)
pnpm dev
```

The RustFS console is at http://localhost:9001 (log in with `rustfs-dev` / `rustfs-dev-secret`). `pnpm services:down`
stops the services and keeps the data; `pnpm services:reset` wipes it. `pnpm db:reset` re-seeds the database.

Other scripts: `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm format`, `pnpm test` (see "Tests"),
`pnpm db:generate` (new migration after changing the schema), `pnpm db:studio`.

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
    data/                   persistence: DataStore interface, json and drizzle (Postgres) drivers, contract tests
    storage/                object storage: S3 provider, upload rules, client-safe media URLs
    story/timeline.ts       pure: story → playback timeline (chapter spans, compressed gaps, positions, clock, route front)
    actions.ts              server actions (all mutations)
    queries.ts              server-side reads for pages
    time.ts, geo.ts         helpers
data/seed.json              sample data
drizzle/                    SQL migrations (generated by drizzle-kit)
scripts/                    seed/reset scripts, bucket CORS rules
docker-compose.yml          local Postgres + RustFS
docs/plans/                 plans and decisions
prototype/                  original HTML prototypes
```

## Persistence: JSON file or Postgres

Pages and server actions only use `store` from `src/lib/data`, which implements the `DataStore` interface in
[`src/lib/data/repository.ts`](src/lib/data/repository.ts). `DATA_DRIVER` picks the driver:

- `json` (default): one file (`DATA_FILE`, default `data/db.json`) with one array per table (`points`, `collections`,
  `stories`, `chapters`, `chapterPoints`). Writes are queued and written atomically. No setup.
- `drizzle`: Postgres via [Drizzle](https://orm.drizzle.team) and `postgres.js` (`DATABASE_URL`). Tables are in
  [`src/lib/data/drizzle/schema.ts`](src/lib/data/drizzle/schema.ts), migrations in `drizzle/`. Locations are PostGIS
  `geometry(Point, 4326)`; search uses a trigram-indexed `search_text` column; `saveChapters` and other multi-step
  writes run in one transaction.

Both drivers pass the same contract tests, so they behave the same. To change the schema: edit `schema.ts`,
`pnpm db:generate`, review the SQL in `drizzle/`, `pnpm db:migrate`. (drizzle-kit 0.31 drops the SRID from geometry
columns; check new geometry columns say `geometry(point, 4326)`.)

IDs are prefixed strings (`pt_…`, `col_…`), used as text primary keys.

**Times:** `capturedAt` is stored as the local wall-clock time at the place (`2026-03-14T10:05`, no offset), and all
math treats it as UTC. Playback then always shows the event's local time, whatever the viewer's timezone. In Postgres
it's a `timestamp` without time zone. Add a `timezone` column if you need real instants.

See [`docs/plans/postgres-and-s3.md`](docs/plans/postgres-and-s3.md) for the decisions and what's left.

## Tests

`pnpm test` runs [Vitest](https://vitest.dev). The `DataStore` contract suite
([`src/lib/data/__tests__/contract.ts`](src/lib/data/__tests__/contract.ts)) runs against the json driver and against
the drizzle driver on [PGlite](https://pglite.dev) (Postgres with PostGIS compiled to WASM, in-process, no Docker).
Set `TEST_DATABASE_URL` to also run it against a real Postgres (it wipes that database). A second test checks that
`data/seed.json` loads into Postgres and reads back unchanged. Storage tests cover the upload rules and URL signing.

## Media and storage

`MediaAsset` has a `source`: `external` (a plain URL) or `storage` (an object key in our bucket). Points without media
get a generated placeholder scene, like the prototype.

`NEXT_PUBLIC_STORAGE_DRIVER` picks the storage:

- `none` (default): media are linked by URL only; "Upload files" is disabled.
- `s3`: any S3-compatible bucket: RustFS locally, Amazon S3 or Cloudflare R2 in production (set the `S3_*` variables,
  see `.env.example`).

Upload flow: the point form calls the `createMediaUpload` server action, which checks the file's type and size and
returns a presigned PUT. The browser uploads straight to the bucket (no bytes go through Next.js), then adds
`{ source: "storage", storageKey: "points/<mediaId>/<file>" }` to the point. When the point is saved, the server checks
each new file in the bucket (exists, allowed type, under `MEDIA_MAX_BYTES`) and deletes bad ones. Files removed from a
point, or of a deleted point, are deleted from the bucket.

The bucket stays private. Stored media are shown through `/api/media/<storageKey>`, which redirects to a short-lived
presigned URL; that's also where access checks go once there's auth. Code: [`src/lib/storage`](src/lib/storage)
(`client.ts` is the browser half, `index.ts` / `s3-storage.ts` / `media.ts` the server half).

A production bucket needs CORS for the app's origin (`PUT`, `GET`, `HEAD`, header `Content-Type`); see
[`scripts/storage/cors.json`](scripts/storage/cors.json).

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
- Maps: MapLibre GL 5 with OpenFreeMap tiles (Positron / Dark, following the theme), in globe projection (flat from city
  zoom; pass `projection="mercator"` to `<MapView>` for an always-flat map), with 3D buildings from zoom 14
  (`buildings={false}` turns them off; see [`src/components/map/buildings.ts`](src/components/map/buildings.ts)). Points are drawn by `<PointsLayer>`
  (see "Loading points on maps"); `<MapMarker>` is for a handful of special markers.
- Viewer preferences (theme, map display options) live in the header's settings menu and are stored in localStorage via
  [`src/lib/settings.ts`](src/lib/settings.ts). Add a setting there and a row in `src/components/settings-menu.tsx`.
- **Home area and start view:** every viewer has a home area: the place they picked in the settings menu, or else
  the site's default area (`NEXT_PUBLIC_DEFAULT_VIEW` in `.env`, e.g. a city), or else, if that isn't set, a fit of
  all points. The explore map's ⌂ button goes there. "Map starts at" opens the explore and new-point maps on the
  default area, where you left off, or your chosen place. Story screens follow the story; links with a location
  (`?lng=&lat=`) still win. See [`src/components/map/start-view.ts`](src/components/map/start-view.ts).
- There's no auth yet. Every server action has a `TODO(auth)` spot (see the top of `src/lib/actions.ts`).
