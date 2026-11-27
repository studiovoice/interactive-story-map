/**
 * Public responses never carry staff-only point fields: who added a point, where it came from, and
 * the old free-text contributor. Covers the helpers and the routes that use them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Point, PointDetail, StoryDetail } from "@/lib/domain/schema"
import { addedByLabel, toPublicPoint, toPublicPointDetail, toPublicSearchResult, toPublicStory } from "../public"

const point: Point = {
  id: "pt_1",
  title: "Crowd on the bridge",
  description: "",
  location: [-73.99, 40.7],
  locationPrecision: "exact",
  locationRadiusM: null,
  placeName: "Brooklyn Bridge",
  capturedAt: "2026-03-14T10:05",
  timePrecision: "exact",
  tags: ["march"],
  contributor: "J. Ortiz",
  media: [],
  source: "staff",
  createdBy: "usr_secret",
  createdAt: "2026-03-14T10:05:00.000Z",
  updatedAt: "2026-03-14T10:05:00.000Z",
}

const STAFF_ONLY = /usr_secret|J\. Ortiz|"source"|"createdBy"|"contributor"/

describe("public point helpers", () => {
  it("drop staff-only fields and keep the rest", () => {
    const pub = toPublicPoint(point)
    expect(pub).not.toHaveProperty("createdBy")
    expect(pub).not.toHaveProperty("source")
    expect(pub).not.toHaveProperty("contributor")
    expect(pub).toMatchObject({ id: "pt_1", title: "Crowd on the bridge", tags: ["march"] })
    expect(point.createdBy).toBe("usr_secret") // the input isn't changed
  })

  it("cover details, search results and stories", () => {
    const detail: PointDetail = { point, usage: [], addedBy: "Cora Curator" }
    const story = {
      id: "sty_1",
      chapters: [{ id: "ch_1", points: [{ chapterId: "ch_1", pointId: "pt_1", position: 0, note: "", point }] }],
    } as unknown as StoryDetail
    for (const value of [
      toPublicPointDetail(detail),
      toPublicSearchResult({ ids: ["pt_1"], total: 1, top: [point] }),
      toPublicStory(story),
    ]) {
      expect(JSON.stringify(value)).not.toMatch(STAFF_ONLY)
      expect(JSON.stringify(value)).not.toMatch(/Cora Curator/)
    }
  })

  it("label who added a point", () => {
    const names = (id: string) => (id === "usr_1" ? "Cora Curator" : undefined)
    expect(addedByLabel({ source: "public", createdBy: null }, names)).toBe("Public")
    expect(addedByLabel({ source: "staff", createdBy: null }, names)).toBe("Staff (before sign-in)")
    expect(addedByLabel({ source: "staff", createdBy: "usr_1" }, names)).toBe("Cora Curator")
    expect(addedByLabel({ source: "staff", createdBy: "usr_gone" }, names)).toBe("Staff")
  })
})

const viewer = vi.hoisted(() => ({ current: null as null | { id: string; role: string } }))
vi.mock("@/lib/auth/server", () => ({ getViewer: async () => viewer.current }))
vi.mock("@/lib/auth/staff", () => ({ listStaff: async () => [{ id: "usr_secret", name: "Cora Curator" }] }))
vi.mock("next/server", () => ({ connection: async () => {} }))
vi.mock("@/lib/data", () => ({
  store: {
    points: {
      detail: async () => ({ point, usage: [] }),
      search: async () => ({ ids: ["pt_1"], total: 1, top: [point] }),
    },
  },
}))

describe("point API routes", () => {
  beforeEach(() => {
    viewer.current = null
  })

  const detail = async () => {
    const { GET } = await import("@/app/api/points/[pointId]/route")
    const res = await GET({} as never, { params: Promise.resolve({ pointId: "pt_1" }) } as never)
    return res.text()
  }

  it("give the public a point without staff-only fields", async () => {
    const body = await detail()
    expect(body).toContain("Crowd on the bridge")
    expect(body).not.toMatch(STAFF_ONLY)
    expect(body).not.toMatch(/Cora Curator|addedBy/)
  })

  it("tell staff who added it", async () => {
    viewer.current = { id: "usr_admin", role: "admin" }
    expect(JSON.parse(await detail())).toMatchObject({ addedBy: "Cora Curator", point: { createdBy: "usr_secret" } })
  })

  it("keep staff-only fields out of search results, for everyone", async () => {
    const { GET } = await import("@/app/api/points/search/route")
    for (const who of [null, { id: "usr_admin", role: "admin" }]) {
      viewer.current = who
      const res = await GET({ nextUrl: new URL("http://x/api/points/search?q=bridge") } as never)
      expect(await res.text()).not.toMatch(STAFF_ONLY)
    }
  })
})
