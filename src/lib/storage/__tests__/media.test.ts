import { describe, expect, it, vi } from "vitest"
import type { MediaAsset } from "@/lib/domain/schema"
import type { StorageProvider } from "@/lib/storage"
import {
  createMediaUpload,
  deleteStoredMedia,
  MediaError,
  removedStorageKeys,
  saveWithStoredMedia,
  verifyStoredMedia,
} from "@/lib/storage/media"
import {
  mediaIdFromKey,
  mediaKindForMime,
  parseStorageKey,
  sanitizeFileName,
  storageKeyFor,
  uploadKeyFor,
} from "@/lib/storage/rules"

const MB = 1024 * 1024

/** An in-memory bucket. */
function fakeBucket(objects: Record<string, { size: number; contentType: string | null }> = {}) {
  const storage = {
    name: "fake",
    canUpload: true,
    createUpload: vi.fn(async ({ storageKey }: { storageKey: string }) => ({
      url: `https://bucket.test/${storageKey}?sig`,
      method: "PUT" as const,
      headers: { "Content-Type": "x" },
      expiresIn: 600,
    })),
    getReadUrl: vi.fn(async (k: string) => `https://bucket.test/${k}`),
    head: vi.fn(async (k: string) => objects[k] ?? null),
    copy: vi.fn(async (from: string, to: string) => {
      if (!objects[from]) throw new Error(`no such key ${from}`)
      objects[to] = { ...objects[from] }
    }),
    delete: vi.fn(async (k: string) => {
      delete objects[k]
    }),
  } satisfies StorageProvider
  return { storage, objects }
}

const fakeStorage = (objects: Parameters<typeof fakeBucket>[0] = {}) => fakeBucket(objects).storage

/** A file already on a saved point. */
const stored = (id: string, file = "a.jpg", extra: Partial<MediaAsset> = {}): MediaAsset => ({
  id,
  kind: "image",
  source: "storage",
  storageKey: `points/${id}/${file}`,
  fileName: file,
  ...extra,
})

/** A fresh upload, not saved on a point yet. */
const uploaded = (id: string, file = "a.jpg", extra: Partial<MediaAsset> = {}): MediaAsset =>
  stored(id, file, { storageKey: `tmp/${id}/${file}`, ...extra })

describe("rules", () => {
  it("sanitizes file names for keys", () => {
    expect(sanitizeFileName("Crowd at the Bridge (1).JPG")).toBe("Crowd-at-the-Bridge-1.jpg")
    expect(sanitizeFileName("café.png")).toBe("cafe.png")
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd")
    expect(sanitizeFileName("C:\\photos\\me.png")).toBe("me.png")
    expect(sanitizeFileName("???")).toBe("file")
    expect(sanitizeFileName(".env")).toBe("env")
  })

  it("builds and parses keys", () => {
    const key = storageKeyFor("med_abcdefghijkl", "My photo.jpeg")
    expect(key).toBe("points/med_abcdefghijkl/My-photo.jpeg")
    expect(mediaIdFromKey(key)).toBe("med_abcdefghijkl")
    expect(mediaIdFromKey("points/med_abcdefghijkl/../x")).toBeNull()
    expect(mediaIdFromKey("other/med_abcdefghijkl/x.jpg")).toBeNull()
    expect(() => storageKeyFor("nope", "x")).toThrow()

    const tmp = uploadKeyFor("med_abcdefghijkl", "My photo.jpeg")
    expect(tmp).toBe("tmp/med_abcdefghijkl/My-photo.jpeg")
    expect(parseStorageKey(tmp)).toEqual({ prefix: "tmp", mediaId: "med_abcdefghijkl", fileName: "My-photo.jpeg" })
    expect(parseStorageKey(key)?.prefix).toBe("points")
    expect(parseStorageKey("tmp/med_abcdefghijkl/../x")).toBeNull()
    expect(() => uploadKeyFor("nope", "x")).toThrow()
  })

  it("maps MIME types to media kinds", () => {
    expect(mediaKindForMime("image/JPEG")).toBe("image")
    expect(mediaKindForMime("video/mp4")).toBe("video")
    expect(mediaKindForMime("application/x-msdownload")).toBeNull()
  })
})

describe("createMediaUpload", () => {
  it("presigns a PUT for an allowed file, to a tmp/ key", async () => {
    const s = fakeStorage()
    const res = await createMediaUpload(s, 10 * MB, { fileName: "Bridge.jpg", mimeType: "image/jpeg", size: 1000 })
    expect(res.asset).toMatchObject({
      kind: "image",
      source: "storage",
      fileName: "Bridge.jpg",
      mimeType: "image/jpeg",
    })
    expect(res.asset.id).toMatch(/^med_[a-z0-9]{12}$/)
    expect(res.asset.storageKey).toBe(`tmp/${res.asset.id}/Bridge.jpg`)
    expect(s.createUpload).toHaveBeenCalledWith({
      storageKey: res.asset.storageKey,
      mimeType: "image/jpeg",
      size: 1000,
    })
    expect(res.upload.method).toBe("PUT")
  })

  it("rejects disallowed types, big files, and missing storage", async () => {
    const s = fakeStorage()
    await expect(
      createMediaUpload(s, MB, { fileName: "x.exe", mimeType: "application/x-msdownload", size: 1 }),
    ).rejects.toBeInstanceOf(MediaError)
    await expect(createMediaUpload(s, MB, { fileName: "x.mp4", mimeType: "video/mp4", size: 2 * MB })).rejects.toThrow(
      /too big/,
    )
    await expect(
      createMediaUpload({ ...s, canUpload: false }, MB, { fileName: "x.jpg", mimeType: "image/jpeg", size: 1 }),
    ).rejects.toBeInstanceOf(MediaError)
    expect(s.createUpload).not.toHaveBeenCalled()
  })
})

describe("verifyStoredMedia", () => {
  const external: MediaAsset = { id: "med_ext", kind: "image", source: "external", url: "https://x.test/a.jpg" }

  it("accepts uploaded files and takes type and kind from the bucket", async () => {
    const asset = uploaded("med_aaaaaaaaaaaa", "a.mp4", { kind: "image", mimeType: "image/jpeg" })
    const s = fakeStorage({ [asset.storageKey!]: { size: 100, contentType: "video/mp4" } })
    const media = await verifyStoredMedia(s, MB, [external, asset])
    expect(media).toEqual([external, { ...asset, kind: "video", mimeType: "video/mp4" }])
  })

  it("doesn't re-check files the point already had", async () => {
    const asset = stored("med_aaaaaaaaaaaa")
    const s = fakeStorage()
    expect(await verifyStoredMedia(s, MB, [asset], [asset])).toEqual([asset])
    expect(s.head).not.toHaveBeenCalled()
  })

  it("rejects missing files and keys that don't match the asset", async () => {
    const s = fakeStorage({ "tmp/med_bbbbbbbbbbbb/a.jpg": { size: 1, contentType: "image/jpeg" } })
    await expect(verifyStoredMedia(s, MB, [uploaded("med_aaaaaaaaaaaa")])).rejects.toThrow(/isn't in storage/)
    await expect(
      verifyStoredMedia(s, MB, [{ ...uploaded("med_aaaaaaaaaaaa"), storageKey: "tmp/med_bbbbbbbbbbbb/a.jpg" }]),
    ).rejects.toThrow(/isn't valid/)
    // Same id but a swapped key counts as new, and is checked.
    const prev = stored("med_aaaaaaaaaaaa")
    await expect(
      verifyStoredMedia(s, MB, [{ ...prev, storageKey: "tmp/med_aaaaaaaaaaaa/b.jpg" }], [prev]),
    ).rejects.toThrow()
  })

  it("won't let a point claim a file that's on another point", async () => {
    // The file exists and is valid, but it's a saved file (points/), not a fresh upload.
    const other = stored("med_aaaaaaaaaaaa")
    const s = fakeStorage({ [other.storageKey!]: { size: 1, contentType: "image/jpeg" } })
    await expect(verifyStoredMedia(s, MB, [other])).rejects.toThrow(/isn't valid/)
    expect(s.head).not.toHaveBeenCalled()
  })

  it("deletes and rejects files that are too big or of the wrong type", async () => {
    const big = uploaded("med_aaaaaaaaaaaa")
    const bad = uploaded("med_bbbbbbbbbbbb", "a.html")
    const s = fakeStorage({
      [big.storageKey!]: { size: 2 * MB, contentType: "image/jpeg" },
      [bad.storageKey!]: { size: 1, contentType: "text/html" },
    })
    await expect(verifyStoredMedia(s, MB, [big])).rejects.toThrow(/too big/)
    await expect(verifyStoredMedia(s, MB, [bad])).rejects.toThrow(/type/)
    expect(s.delete).toHaveBeenCalledWith(big.storageKey)
    expect(s.delete).toHaveBeenCalledWith(bad.storageKey)
  })

  it("skips checks without a bucket", async () => {
    const s = { ...fakeStorage(), canUpload: false }
    const asset = stored("med_aaaaaaaaaaaa")
    expect(await verifyStoredMedia(s, MB, [asset])).toEqual([asset])
  })
})

describe("saveWithStoredMedia", () => {
  const file = { size: 1, contentType: "image/jpeg" }

  it("moves new uploads from tmp/ to points/ and saves the points/ keys", async () => {
    const kept = stored("med_aaaaaaaaaaaa")
    const fresh = uploaded("med_bbbbbbbbbbbb", "b.jpg")
    const { storage, objects } = fakeBucket({ [kept.storageKey!]: file, [fresh.storageKey!]: file })
    const save = vi.fn(async (media: MediaAsset[]) => media)

    const saved = await saveWithStoredMedia(storage, MB, [kept, fresh], [kept], save)

    expect(saved.map((m) => m.storageKey)).toEqual([kept.storageKey, "points/med_bbbbbbbbbbbb/b.jpg"])
    expect(Object.keys(objects).sort()).toEqual([kept.storageKey, "points/med_bbbbbbbbbbbb/b.jpg"])
    expect(storage.copy).toHaveBeenCalledOnce()
  })

  it("removes the copies and keeps the uploads when the save fails", async () => {
    const fresh = uploaded("med_bbbbbbbbbbbb")
    const { storage, objects } = fakeBucket({ [fresh.storageKey!]: file })
    const fail = new Error("db down")
    await expect(saveWithStoredMedia(storage, MB, [fresh], [], () => Promise.reject(fail))).rejects.toBe(fail)
    // The upload is still in tmp/, so saving again works.
    expect(Object.keys(objects)).toEqual([fresh.storageKey])
  })

  it("doesn't save when a copy fails, and removes the copies that worked", async () => {
    const a = uploaded("med_aaaaaaaaaaaa")
    const b = uploaded("med_bbbbbbbbbbbb")
    const { storage, objects } = fakeBucket({ [a.storageKey!]: file, [b.storageKey!]: file })
    storage.copy.mockImplementationOnce(async () => {
      throw new Error("copy failed")
    })
    const save = vi.fn()
    await expect(saveWithStoredMedia(storage, MB, [a, b], [], save)).rejects.toThrow(/copy failed/)
    expect(save).not.toHaveBeenCalled()
    expect(Object.keys(objects).sort()).toEqual([a.storageKey, b.storageKey])
  })

  it("just saves without a bucket", async () => {
    const storage = { ...fakeStorage(), canUpload: false }
    const asset = stored("med_aaaaaaaaaaaa")
    const save = vi.fn(async (media: MediaAsset[]) => media)
    expect(await saveWithStoredMedia(storage, MB, [asset], [], save)).toEqual([asset])
    expect(storage.copy).not.toHaveBeenCalled()
  })
})

describe("cleanup", () => {
  it("finds removed stored files", () => {
    const a = stored("med_aaaaaaaaaaaa")
    const b = stored("med_bbbbbbbbbbbb")
    const devFile: MediaAsset = { id: "med_dev", kind: "image", source: "storage", storageKey: "sample.jpg" }
    expect(removedStorageKeys([a, b, devFile], [b])).toEqual([a.storageKey])
    expect(removedStorageKeys([a], [])).toEqual([a.storageKey])
  })

  it("deletes best effort", async () => {
    const s = fakeStorage()
    s.delete.mockRejectedValueOnce(new Error("boom"))
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    await deleteStoredMedia(s, ["k1", "k2"])
    expect(s.delete).toHaveBeenCalledTimes(2)
    expect(log).toHaveBeenCalledOnce()
    log.mockRestore()
  })
})
