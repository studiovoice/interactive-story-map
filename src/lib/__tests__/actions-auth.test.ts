/**
 * Every server action checks who's calling before it does anything. Server actions are public
 * endpoints (anyone can POST to them), so this is the real protection, not the hidden buttons.
 *
 * The session lookup and the store are mocked; the permission logic (`getViewer`,
 * `requirePermission`, `can`) is the real one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Role } from "@/lib/auth/permissions"

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, unknown> } }))
const store = vi.hoisted(() => {
  const point = { id: "pt_1", media: [], source: "staff", createdBy: null }
  const story = { id: "sty_1", status: "draft" }
  return {
    points: {
      create: vi.fn(async () => point),
      get: vi.fn(async () => point),
      update: vi.fn(async () => point),
      delete: vi.fn(async () => {}),
    },
    collections: {
      create: vi.fn(async () => ({ id: "col_1" })),
      update: vi.fn(async () => ({ id: "col_1" })),
      delete: vi.fn(async () => {}),
    },
    stories: {
      get: vi.fn(async () => story),
      create: vi.fn(async () => story),
      update: vi.fn(async () => story),
      delete: vi.fn(async () => {}),
      saveChapters: vi.fn(async () => story),
    },
  }
})

vi.mock("@/lib/auth/config", () => ({ createAuth: () => ({ api: { getSession: async () => session.current } }) }))
vi.mock("@/lib/data/drizzle/client", () => ({ getDb: () => ({}) }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/cache", () => ({ revalidatePath: () => {} }))
vi.mock("@/lib/data", async () => ({ store, NotFoundError: (await import("@/lib/data/repository")).NotFoundError }))
vi.mock("@/lib/storage", () => ({ getStorage: () => ({}), mediaMaxBytes: () => 1000 }))
vi.mock("@/lib/storage/media", () => ({
  MediaError: class extends Error {},
  createMediaUpload: async () => ({ url: "https://bucket/put", asset: {} }),
  saveWithStoredMedia: async (_s: unknown, _m: unknown, media: unknown, _p: unknown, save: (m: unknown) => unknown) =>
    save(media),
  deleteStoredMedia: async () => {},
  removedStorageKeys: () => [],
}))

const actions = await import("@/lib/actions")

function signInAs(role: Role | null, extra: Record<string, unknown> = {}) {
  session.current = role
    ? { user: { id: `usr_${role}`, name: role, email: `${role}@example.org`, role, banned: false, ...extra } }
    : null
}

const pointInput = { title: "A point", location: [-73.99, 40.7] as [number, number] }
const story = { title: "A story", status: "draft" as const }

/** Each action, called the way the UI calls it. */
const calls: Record<string, () => Promise<{ ok: boolean; error?: string }>> = {
  createPoint: () => actions.createPoint(pointInput),
  updatePoint: () => actions.updatePoint("pt_1", pointInput),
  updatePointMetadata: () =>
    actions.updatePointMetadata("pt_1", { tags: ["march"], capturedAt: null, timePrecision: "approximate" }),
  deletePoint: () => actions.deletePoint("pt_1"),
  createMediaUpload: () => actions.createMediaUpload({ fileName: "a.jpg", mimeType: "image/jpeg", size: 10 }),
  createCollection: () => actions.createCollection({ title: "C" }),
  updateCollection: () => actions.updateCollection("col_1", { title: "C" }),
  deleteCollection: () => actions.deleteCollection("col_1"),
  createStory: () => actions.createStory({ collectionId: "col_1", ...story }),
  updateStory: () => actions.updateStory("sty_1", story),
  publishStory: () => actions.updateStory("sty_1", { ...story, status: "published" }),
  deleteStory: () => actions.deleteStory("sty_1"),
  saveStory: () => actions.saveStory("sty_1", { story, chapters: [] }),
}

/** Who may call what (docs/plans/auth-and-roles.md). */
const allowed: Record<string, Role[]> = {
  createPoint: ["curator", "admin"],
  updatePoint: ["admin"],
  updatePointMetadata: ["curator", "admin"],
  deletePoint: ["admin"],
  createMediaUpload: ["curator", "admin"],
  createCollection: ["curator", "admin"],
  updateCollection: ["curator", "admin"],
  deleteCollection: ["curator", "admin"],
  createStory: ["curator", "admin"],
  updateStory: ["curator", "admin"],
  publishStory: ["curator", "admin"],
  deleteStory: ["curator", "admin"],
  saveStory: ["curator", "admin"],
}

beforeEach(() => vi.clearAllMocks())

describe("server actions check permissions", () => {
  it("covers every exported action", () => {
    const exported = Object.keys(actions).filter((k) => typeof (actions as Record<string, unknown>)[k] === "function")
    const tested = new Set(Object.keys(calls))
    expect(exported.filter((k) => !tested.has(k))).toEqual([])
  })

  for (const [name, call] of Object.entries(calls)) {
    describe(name, () => {
      it("refuses the public and changes nothing", async () => {
        signInAs(null)
        const res = await call()
        expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/sign in/i) })
        expectNoWrites()
      })

      for (const role of ["curator", "admin"] as const) {
        const ok = allowed[name].includes(role)
        it(`${ok ? "allows" : "refuses"} a ${role}`, async () => {
          signInAs(role)
          const res = await call()
          if (ok) expect(res).toMatchObject({ ok: true })
          else {
            expect(res).toMatchObject({ ok: false, error: expect.stringMatching(/permission/i) })
            expectNoWrites()
          }
        })
      }

      it("refuses a banned admin", async () => {
        signInAs("admin", { banned: true })
        expect(await call()).toMatchObject({ ok: false })
        expectNoWrites()
      })
    })
  }

  it("records the staff member who created a point", async () => {
    signInAs("curator")
    await actions.createPoint(pointInput)
    expect(store.points.create).toHaveBeenCalledWith(expect.anything(), { source: "staff", createdBy: "usr_curator" })
  })

  it("lets curators change only a point's metadata", async () => {
    signInAs("curator")
    await actions.updatePointMetadata("pt_1", {
      tags: ["a"],
      capturedAt: "2026-03-14T10:05",
      timePrecision: "exact",
      // Not allowed for curators; must be dropped, not saved.
      ...({ title: "Hijacked", location: [0, 0] } as object),
    })
    expect(store.points.update).toHaveBeenCalledWith("pt_1", {
      tags: ["a"],
      capturedAt: "2026-03-14T10:05",
      timePrecision: "exact",
    })
  })
})

function expectNoWrites() {
  for (const repo of Object.values(store)) {
    for (const [method, fn] of Object.entries(repo)) {
      if (method === "get") continue
      expect(fn, method).not.toHaveBeenCalled()
    }
  }
}
