import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { parseSnapshot } from "@/lib/data/snapshot"
import type { StoreHarness } from "./contract"
import { pgliteHarness } from "./pg-harness"

const seed = parseSnapshot(JSON.parse(readFileSync(path.resolve(__dirname, "../../../../data/seed.json"), "utf8")))

describe("seed.json → Postgres", () => {
  let h: StoreHarness
  beforeAll(async () => {
    h = await pgliteHarness()
    await h.seed!(seed)
  })
  afterAll(() => h.close?.())

  it("reads every point back unchanged", async () => {
    const byId = new Map((await h.store.points.list()).map((p) => [p.id, p]))
    expect(byId.size).toBe(seed.points.length)
    for (const p of seed.points) expect(byId.get(p.id)).toEqual(p)
  })

  it("reads every story back with its chapters in order", async () => {
    for (const s of seed.stories) {
      const detail = await h.store.stories.getDetail(s.id)
      const chapters = seed.chapters.filter((c) => c.storyId === s.id).sort((a, b) => a.position - b.position)
      expect(detail!.chapters.map((c) => c.id)).toEqual(chapters.map((c) => c.id))
      for (const c of detail!.chapters) {
        const { points, ...chapter } = c
        expect(chapter).toEqual(chapters.find((x) => x.id === c.id))
        const members = seed.chapterPoints.filter((cp) => cp.chapterId === c.id).sort((a, b) => a.position - b.position)
        expect(points.map(({ chapterId, pointId, position, note }) => ({ chapterId, pointId, position, note }))).toEqual(members)
      }
    }
  })

  it("rejects broken references", () => {
    expect(() => parseSnapshot({ ...seed, chapterPoints: [{ chapterId: "ch_x", pointId: "pt_x", position: 0 }] })).toThrow(
      /broken references/,
    )
  })
})
