import { describe, expect, it } from "vitest"
import type { ChapterWithPoints, Point } from "@/lib/domain/schema"
import { activeItemAt, buildTimeline } from "../timeline"

const point = (id: string, capturedAt: string | null): Point => ({
  id,
  title: id,
  description: "",
  location: [0, 0],
  locationPrecision: "exact",
  source: "staff",
  createdBy: null,
  locationRadiusM: null,
  placeName: "",
  capturedAt,
  timePrecision: "exact",
  tags: [],
  contributor: "",
  media: [],
  createdAt: "",
  updatedAt: "",
})

const chapter = (id: string, points: Point[]): ChapterWithPoints =>
  ({
    id,
    storyId: "sty_x",
    position: 0,
    title: id,
    narrative: "",
    connection: "timeline",
    route: [],
    points: points.map((p, i) => ({ chapterId: id, pointId: p.id, position: i, note: "", point: p })),
  }) as unknown as ChapterWithPoints

describe("buildTimeline", () => {
  it("gives points that share a time their own spot, so each can be jumped to", () => {
    // An untimed point borrows its neighbour's time, so both land on 12:09.
    const tl = buildTimeline({
      chapters: [
        chapter("ch_a", [
          point("untimed", null),
          point("timed", "2026-11-23T12:09"),
          point("same", "2026-11-23T12:09"),
        ]),
      ],
    })
    const pos = tl.items.map((it) => it.pos)
    expect(new Set(pos).size).toBe(3)
    for (const it of tl.items) expect(activeItemAt(tl, it.pos + 1e-4)?.point.id).toBe(it.point.id)
  })

  it("keeps spread points inside their chapter", () => {
    const many = Array.from({ length: 30 }, (_, i) => point(`p${i}`, "2026-11-23T12:00"))
    const tl = buildTimeline({ chapters: [chapter("ch_a", many), chapter("ch_b", [point("q", "2026-11-23T12:30")])] })
    const [a, b] = tl.chapters
    for (const it of tl.items.filter((x) => x.chapterIndex === 0)) {
      expect(it.pos).toBeGreaterThanOrEqual(a.p0)
      expect(it.pos).toBeLessThan(a.p1)
      expect(activeItemAt(tl, it.pos + 1e-4)?.point.id).toBe(it.point.id)
    }
    expect(b.p0).toBe(a.p1)
  })
})
