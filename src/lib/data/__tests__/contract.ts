/**
 * Behaviour every `DataStore` driver must have. Each driver's test file calls
 * `describeStoreContract` with a way to get a fresh, empty store.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest"
import type { ChapterDraft, PointInput } from "@/lib/domain/schema"
import { NotFoundError, type DataStore } from "@/lib/data/repository"
import { distance } from "@/lib/geo"
import { MIN_OBSCURED_RADIUS } from "@/lib/location"

export type StoreHarness = {
  store: DataStore
  /** Remove every row. */
  reset(): Promise<void>
  /** Load a json-driver snapshot (drizzle harnesses only). */
  seed?(snapshot: import("@/lib/data/snapshot").Snapshot): Promise<void>
  close?(): Promise<void>
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const pointInput = (overrides: Partial<PointInput> = {}): PointInput => ({
  title: "A point",
  location: [-73.99, 40.7],
  ...overrides,
})

export function describeStoreContract(name: string, setup: () => Promise<StoreHarness>) {
  describe(`DataStore contract: ${name}`, () => {
    let h: StoreHarness
    let store: DataStore

    beforeAll(async () => {
      h = await setup()
      store = h.store
    })
    beforeEach(async () => {
      await h.reset()
    })
    afterAll(async () => {
      await h?.close?.()
    })

    /* ───────────── points ───────────── */

    describe("points", () => {
      it("creates a point with defaults and timestamps", async () => {
        const p = await store.points.create(pointInput())
        expect(p.id).toMatch(/^pt_[a-z0-9]{12}$/)
        expect(p).toMatchObject({
          title: "A point",
          description: "",
          kind: "photo",
          location: [-73.99, 40.7],
          locationPrecision: "exact",
          locationRadiusM: null,
          placeName: "",
          capturedAt: null,
          timePrecision: "exact",
          tags: [],
          contributor: "",
          media: [],
        })
        expect(p.createdAt).toMatch(ISO)
        expect(p.updatedAt).toBe(p.createdAt)
        expect(await store.points.get(p.id)).toEqual(p)
      })

      it("keeps every field exactly as given", async () => {
        const p = await store.points.create(
          pointInput({
            title: "Full",
            description: "Desc",
            kind: "video",
            location: [2.352222, 48.856613],
            placeName: "Paris",
            capturedAt: "2026-03-14T10:05",
            timePrecision: "approximate",
            tags: ["a", "b c"],
            contributor: "M. R.",
            media: [
              { id: "med_aaaaaaaaaaaa", kind: "video", source: "external", url: "https://x.test/v.mp4", durationSec: 18 },
              {
                id: "med_bbbbbbbbbbbb",
                kind: "image",
                source: "storage",
                storageKey: "points/med_bbbbbbbbbbbb/a.jpg",
                fileName: "a.jpg",
                mimeType: "image/jpeg",
              },
            ],
          }),
        )
        const got = await store.points.get(p.id)
        expect(got).toEqual(p)
        expect(got!.capturedAt).toBe("2026-03-14T10:05")
        expect(got!.location).toEqual([2.352222, 48.856613])
        expect(got!.media).toHaveLength(2)

        const withSeconds = await store.points.create(pointInput({ capturedAt: "2026-03-14T10:05:30" }))
        expect((await store.points.get(withSeconds.id))!.capturedAt).toBe("2026-03-14T10:05:30")
      })

      it("returns null for a missing point", async () => {
        expect(await store.points.get("pt_missing")).toBeNull()
        expect(await store.points.detail("pt_missing")).toBeNull()
      })

      it("rejects invalid input", async () => {
        await expect(store.points.create(pointInput({ title: "  " }))).rejects.toThrow()
      })

      it("updates and bumps updatedAt", async () => {
        const p = await store.points.create(pointInput())
        await sleep(5)
        const u = await store.points.update(p.id, { title: "Renamed", tags: ["x"] })
        expect(u.title).toBe("Renamed")
        expect(u.tags).toEqual(["x"])
        expect(u.location).toEqual(p.location)
        expect(u.createdAt).toBe(p.createdAt)
        expect(u.updatedAt > p.updatedAt).toBe(true)
        expect(await store.points.get(p.id)).toEqual(u)
      })

      it("throws NotFoundError when updating a missing point", async () => {
        await expect(store.points.update("pt_missing", { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
      })

      it("lists newest first", async () => {
        const a = await store.points.create(pointInput({ title: "A" }))
        await sleep(5)
        await store.points.create(pointInput({ title: "B" }))
        await sleep(5)
        await store.points.update(a.id, { title: "A2" })
        expect((await store.points.list()).map((p) => p.title)).toEqual(["A2", "B"])
      })

      it("normalizes approximate and exact locations", async () => {
        const approx = await store.points.create(pointInput({ locationPrecision: "approximate" }))
        expect(approx.locationRadiusM).toBe(100)
        expect(approx.location).toEqual([-73.99, 40.7])
        const exact = await store.points.update(approx.id, { locationPrecision: "exact", locationRadiusM: 300 })
        expect(exact.locationRadiusM).toBeNull()
      })

      it("obscures hidden locations and doesn't drift on re-save", async () => {
        const truth: [number, number] = [-73.99, 40.7]
        const p = await store.points.create(
          pointInput({ location: truth, locationPrecision: "obscured", locationRadiusM: 100 }),
        )
        expect(p.locationRadiusM).toBe(MIN_OBSCURED_RADIUS)
        expect(distance(truth, p.location)).toBeLessThanOrEqual(MIN_OBSCURED_RADIUS * 0.7 + 1)
        const again = await store.points.update(p.id, { location: p.location, title: "Edited" })
        expect(again.location).toEqual(p.location)
      })

      it("deletes a point and removes it from chapters", async () => {
        const { story, points } = await storyWithPoints(2)
        await store.points.delete(points[0].id)
        expect(await store.points.get(points[0].id)).toBeNull()
        const detail = await store.stories.getDetail(story.id)
        expect(detail!.chapters[0].points.map((cp) => cp.pointId)).toEqual([points[1].id])
      })
    })

    /* ───────────── map list, usage, detail ───────────── */

    describe("map list and usage", () => {
      it("returns slim rows with inStory", async () => {
        const { points } = await storyWithPoints(1)
        const loose = await store.points.create(
          pointInput({ title: "Loose", locationPrecision: "approximate", locationRadiusM: 250 }),
        )
        const rows = await store.points.mapList()
        expect(rows).toHaveLength(2)
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
        expect(byId[points[0].id]).toEqual({
          id: points[0].id,
          title: points[0].title,
          kind: "photo",
          location: points[0].location,
          locationPrecision: "exact",
          locationRadiusM: null,
          inStory: true,
        })
        expect(byId[loose.id]).toMatchObject({ inStory: false, locationPrecision: "approximate", locationRadiusM: 250 })
      })

      it("reports where each point is used", async () => {
        const { collection, story, points } = await storyWithPoints(2)
        const second = await store.points.create(pointInput({ title: "Only in chapter 2" }))
        await store.stories.saveChapters(story.id, [
          { id: "ch_one000000000", title: "One", points: [{ pointId: points[0].id }] },
          {
            id: "ch_two000000000",
            title: "Two",
            points: [{ pointId: points[0].id }, { pointId: second.id }],
          },
        ])
        const usage = await store.points.usage()
        expect(usage[points[1].id]).toBeUndefined()
        expect(usage[second.id]).toEqual([
          {
            storyId: story.id,
            storyTitle: story.title,
            storyStatus: "draft",
            collectionId: collection.id,
            collectionTitle: collection.title,
            chapterId: "ch_two000000000",
            chapterIndex: 1,
            chapterTitle: "Two",
          },
        ])
        expect(usage[points[0].id].map((u) => u.chapterIndex).sort()).toEqual([0, 1])

        const detail = await store.points.detail(second.id)
        expect(detail!.point.id).toBe(second.id)
        expect(detail!.usage).toEqual(usage[second.id])
        expect((await store.points.detail(points[1].id))!.usage).toEqual([])
      })
    })

    /* ───────────── search ───────────── */

    describe("search", () => {
      it("matches title, description, place name and tags, case-insensitively", async () => {
        const a = await store.points.create(pointInput({ title: "Bridge crossing" }))
        const b = await store.points.create(pointInput({ title: "x", description: "On the BRIDGE" }))
        const c = await store.points.create(pointInput({ title: "y", placeName: "Brooklyn Bridge Park" }))
        const d = await store.points.create(pointInput({ title: "z", tags: ["bridges"] }))
        await store.points.create(pointInput({ title: "Unrelated" }))
        const res = await store.points.search({ q: "bridge" })
        expect(res.total).toBe(4)
        expect(new Set(res.ids)).toEqual(new Set([a.id, b.id, c.id, d.id]))
      })

      it("treats % and _ literally", async () => {
        await store.points.create(pointInput({ title: "100% sure" }))
        await store.points.create(pointInput({ title: "plain" }))
        expect((await store.points.search({ q: "%" })).total).toBe(1)
        expect((await store.points.search({ q: "_" })).total).toBe(0)
      })

      it("orders by distance from `near` and caps results", async () => {
        const far = await store.points.create(pointInput({ title: "match far", location: [-73.9, 40.8] }))
        const near = await store.points.create(pointInput({ title: "match near", location: [-73.99, 40.7] }))
        const mid = await store.points.create(pointInput({ title: "match mid", location: [-73.95, 40.75] }))
        const res = await store.points.search({ q: "match", near: [-73.99, 40.701], limit: 2, maxIds: 3 })
        expect(res.total).toBe(3)
        expect(res.ids).toEqual([near.id, mid.id, far.id])
        expect(res.top.map((p) => p.id)).toEqual([near.id, mid.id])
        expect(res.top[0]).toEqual(near)

        const capped = await store.points.search({ q: "match", maxIds: 1 })
        expect(capped.ids).toHaveLength(1)
        expect(capped.total).toBe(3)
      })

      it("matches everything for an empty query", async () => {
        await store.points.create(pointInput())
        await store.points.create(pointInput())
        expect((await store.points.search({ q: "  " })).total).toBe(2)
      })
    })

    /* ───────────── collections ───────────── */

    describe("collections", () => {
      it("creates, gets, updates", async () => {
        const c = await store.collections.create({ title: "Spring" })
        expect(c.id).toMatch(/^col_/)
        expect(c).toMatchObject({ title: "Spring", description: "" })
        expect(await store.collections.get(c.id)).toEqual(c)
        await sleep(5)
        const u = await store.collections.update(c.id, { description: "About" })
        expect(u).toMatchObject({ title: "Spring", description: "About" })
        expect(u.updatedAt > c.updatedAt).toBe(true)
        await expect(store.collections.update("col_missing", { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
        expect(await store.collections.get("col_missing")).toBeNull()
      })

      it("lists with story and distinct point counts", async () => {
        const { collection, points } = await storyWithPoints(2)
        const other = await store.stories.create({ collectionId: collection.id, title: "Second" })
        await store.stories.saveChapters(other.id, [
          { id: "ch_other0000000", title: "x", points: [{ pointId: points[0].id }] },
        ])
        await store.collections.create({ title: "Empty" })
        const list = await store.collections.list()
        const byId = Object.fromEntries(list.map((c) => [c.id, c]))
        expect(byId[collection.id]).toMatchObject({ storyCount: 2, pointCount: 2 })
        expect(list.find((c) => c.title === "Empty")).toMatchObject({ storyCount: 0, pointCount: 0 })
      })

      it("deletes stories and chapters with the collection, but not points", async () => {
        const { collection, story, points } = await storyWithPoints(1)
        await store.collections.delete(collection.id)
        expect(await store.collections.get(collection.id)).toBeNull()
        expect(await store.stories.get(story.id)).toBeNull()
        expect(await store.points.get(points[0].id)).not.toBeNull()
        expect((await store.points.mapList())[0].inStory).toBe(false)
      })
    })

    /* ───────────── stories ───────────── */

    describe("stories", () => {
      it("needs an existing collection", async () => {
        await expect(store.stories.create({ collectionId: "col_missing", title: "x" })).rejects.toBeInstanceOf(
          NotFoundError,
        )
      })

      it("starts with one empty chapter", async () => {
        const c = await store.collections.create({ title: "C" })
        const s = await store.stories.create({ collectionId: c.id, title: "S" })
        expect(s).toMatchObject({ collectionId: c.id, title: "S", summary: "", status: "draft" })
        expect(s.id).toMatch(/^sty_/)
        const detail = await store.stories.getDetail(s.id)
        expect(detail!.collection).toEqual(c)
        expect(detail!.chapters).toHaveLength(1)
        expect(detail!.chapters[0]).toMatchObject({
          storyId: s.id,
          position: 0,
          title: "Chapter 1",
          narrative: "",
          connection: "timeline",
          route: [],
          camera: null,
          points: [],
        })
        expect(detail!.chapters[0].id).toMatch(/^ch_/)
      })

      it("updates without moving collections", async () => {
        const { story } = await storyWithPoints(0)
        const u = await store.stories.update(story.id, { title: "New", status: "published" })
        expect(u).toMatchObject({ title: "New", status: "published", collectionId: story.collectionId })
        expect(await store.stories.get(story.id)).toEqual(u)
        await expect(store.stories.update("sty_missing", { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
      })

      it("summarizes stories in a collection", async () => {
        const c = await store.collections.create({ title: "C" })
        const s = await store.stories.create({ collectionId: c.id, title: "S" })
        const p1 = await store.points.create(pointInput({ capturedAt: "2026-03-14T12:00" }))
        const p2 = await store.points.create(pointInput({ capturedAt: "2026-03-14T09:30" }))
        const p3 = await store.points.create(pointInput({ capturedAt: null }))
        await store.stories.saveChapters(s.id, [
          { id: "ch_a00000000000", title: "A", points: [{ pointId: p1.id }, { pointId: p3.id }] },
          { id: "ch_b00000000000", title: "B", points: [{ pointId: p2.id }, { pointId: p1.id }] },
        ])
        await sleep(5)
        const empty = await store.stories.create({ collectionId: c.id, title: "Empty" })
        const list = await store.stories.listByCollection(c.id)
        expect(list.map((x) => x.id)).toEqual([empty.id, s.id])
        expect(list[1]).toMatchObject({
          chapterCount: 2,
          pointCount: 3,
          startsAt: "2026-03-14T09:30",
          endsAt: "2026-03-14T12:00",
        })
        expect(list[0]).toMatchObject({ chapterCount: 1, pointCount: 0, startsAt: null, endsAt: null })
        expect(await store.stories.listByCollection("col_missing")).toEqual([])
      })

      it("deletes a story and its chapters", async () => {
        const { story, points } = await storyWithPoints(1)
        await store.stories.delete(story.id)
        expect(await store.stories.get(story.id)).toBeNull()
        expect(await store.stories.getDetail(story.id)).toBeNull()
        expect(await store.points.usage()).toEqual({})
        expect(await store.points.get(points[0].id)).not.toBeNull()
      })
    })

    /* ───────────── saveChapters ───────────── */

    describe("saveChapters", () => {
      it("replaces chapters in order, with points, notes, routes and cameras", async () => {
        const { story, points } = await storyWithPoints(3)
        await sleep(5)
        const drafts: ChapterDraft[] = [
          {
            id: "ch_path00000000",
            title: "March",
            narrative: "We walk",
            connection: "path",
            route: [
              [-73.99, 40.7],
              [-73.98, 40.71],
            ],
            camera: { center: [-73.99, 40.7], zoom: 15, bearing: 10, pitch: 30 },
            points: [
              { pointId: points[2].id, note: "First" },
              { pointId: points[0].id },
            ],
          },
          { id: "ch_time00000000", title: "After", points: [{ pointId: points[1].id }] },
        ]
        const detail = await store.stories.saveChapters(story.id, drafts)
        expect(detail.updatedAt > story.updatedAt).toBe(true)
        expect(detail.chapters.map((c) => [c.id, c.position, c.title])).toEqual([
          ["ch_path00000000", 0, "March"],
          ["ch_time00000000", 1, "After"],
        ])
        const march = detail.chapters[0]
        expect(march).toMatchObject({
          storyId: story.id,
          narrative: "We walk",
          connection: "path",
          route: drafts[0].route,
          camera: { center: [-73.99, 40.7], zoom: 15, bearing: 10, pitch: 30 },
        })
        expect(march.points.map((cp) => [cp.pointId, cp.position, cp.note])).toEqual([
          [points[2].id, 0, "First"],
          [points[0].id, 1, ""],
        ])
        expect(march.points[0].point).toEqual(points[2])
        expect(detail.chapters[1]).toMatchObject({ connection: "timeline", route: [], camera: null })
        expect(await store.stories.getDetail(story.id)).toEqual(detail)
      })

      it("clears routes on timeline chapters, drops unknown and duplicate points", async () => {
        const { story, points } = await storyWithPoints(2)
        const detail = await store.stories.saveChapters(story.id, [
          {
            id: "ch_x00000000000",
            title: "X",
            connection: "timeline",
            route: [
              [0, 0],
              [1, 1],
            ],
            points: [
              { pointId: points[0].id },
              { pointId: "pt_doesnotexist" },
              { pointId: points[0].id, note: "dup" },
              { pointId: points[1].id },
            ],
          },
        ])
        expect(detail.chapters[0].route).toEqual([])
        expect(detail.chapters[0].points.map((cp) => [cp.pointId, cp.position])).toEqual([
          [points[0].id, 0],
          [points[1].id, 1],
        ])
      })

      it("can save zero chapters, and re-save the same ids", async () => {
        const { story, points } = await storyWithPoints(1)
        const first = await store.stories.saveChapters(story.id, [
          { id: "ch_keep00000000", title: "Keep", points: [{ pointId: points[0].id }] },
        ])
        const again = await store.stories.saveChapters(story.id, [
          { id: "ch_new000000000", title: "New" },
          { id: "ch_keep00000000", title: "Keep, moved", points: [{ pointId: points[0].id }] },
        ])
        expect(again.chapters.map((c) => [c.id, c.position])).toEqual([
          ["ch_new000000000", 0],
          ["ch_keep00000000", 1],
        ])
        expect(first.chapters).toHaveLength(1)
        const none = await store.stories.saveChapters(story.id, [])
        expect(none.chapters).toEqual([])
      })

      it("throws NotFoundError for a missing story", async () => {
        await expect(store.stories.saveChapters("sty_missing", [])).rejects.toBeInstanceOf(NotFoundError)
      })
    })

    /** A collection with one story whose first chapter holds `n` new points. */
    async function storyWithPoints(n: number) {
      const collection = await store.collections.create({ title: "Collection" })
      const story = await store.stories.create({ collectionId: collection.id, title: "Story" })
      const points = []
      for (let i = 0; i < n; i++) points.push(await store.points.create(pointInput({ title: `P${i}` })))
      const detail = await store.stories.getDetail(story.id)
      await store.stories.saveChapters(story.id, [
        { id: detail!.chapters[0].id, title: "Chapter 1", points: points.map((p) => ({ pointId: p.id })) },
      ])
      return { collection, story: (await store.stories.get(story.id))!, points }
    }
  })
}
