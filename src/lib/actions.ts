"use server"

/*
 * All mutations. Each action first checks that the viewer may do it (`requirePermission`; server
 * actions are public endpoints, so hiding a button is never enough), validates with the same zod
 * schemas the repositories use, talks to `store` only, and revalidates the whole app (data is
 * small; keeps every page fresh after any write).
 *
 * Who may do what: src/lib/auth/permissions.ts.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { can, type Permissions } from "@/lib/auth/permissions"
import { AuthError, getViewer, requirePermission } from "@/lib/auth/server"
import { store, NotFoundError } from "@/lib/data"
import { getStorage, mediaMaxBytes } from "@/lib/storage"
import {
  createMediaUpload as presignMediaUpload,
  deleteStoredMedia,
  MediaError,
  removedStorageKeys,
  saveWithStoredMedia,
  type MediaUpload,
  type MediaUploadRequest,
} from "@/lib/storage/media"
import {
  chapterDraftSchema,
  collectionInputSchema,
  pointInputSchema,
  pointMetadataSchema,
  storyInputSchema,
  type ChapterDraft,
  type Collection,
  type CollectionInput,
  type Point,
  type PointInput,
  type PointMetadata,
  type Story,
  type StoryDetail,
  type StoryInput,
} from "@/lib/domain/schema"

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

async function run<T>(fn: () => Promise<T>, { revalidate = true } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    if (revalidate) revalidatePath("/", "layout")
    return { ok: true, data }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        error: err.issues[0]?.message ?? "Some fields are invalid",
        fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>,
      }
    }
    if (err instanceof NotFoundError || err instanceof MediaError || err instanceof AuthError) {
      return { ok: false, error: err.message }
    }
    console.error(err)
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

/* ───────────── points ───────────── */

export async function createPoint(input: PointInput): Promise<ActionResult<Point>> {
  return run(async () => {
    const viewer = await requirePermission({ point: ["create"] })
    const data = pointInputSchema.parse(input)
    return saveWithStoredMedia(getStorage(), mediaMaxBytes(), data.media, [], (media) =>
      store.points.create({ ...data, media }, { source: "staff", createdBy: viewer.id }),
    )
  })
}

/** Every field of a point, including its location and files. Admins only. */
export async function updatePoint(id: string, input: PointInput): Promise<ActionResult<Point>> {
  return run(async () => {
    await requirePermission({ point: ["edit"] })
    const data = pointInputSchema.parse(input)
    const previous = await store.points.get(id)
    if (!previous) throw new NotFoundError("Point", id)
    const storage = getStorage()
    const point = await saveWithStoredMedia(storage, mediaMaxBytes(), data.media, previous.media, (media) =>
      store.points.update(id, { ...data, media }),
    )
    // Only after the point no longer references them.
    await deleteStoredMedia(storage, removedStorageKeys(previous.media, point.media))
    return point
  })
}

/**
 * Only a point's metadata: tags, time and time precision. What curators may change; everything
 * else about the point stays as it is.
 */
export async function updatePointMetadata(id: string, input: PointMetadata): Promise<ActionResult<Point>> {
  return run(async () => {
    await requirePermission({ point: ["edit-metadata"] })
    const data = pointMetadataSchema.parse(input)
    return store.points.update(id, data)
  })
}

export async function deletePoint(id: string): Promise<ActionResult> {
  return run(async () => {
    await requirePermission({ point: ["delete"] })
    const previous = await store.points.get(id)
    await store.points.delete(id)
    if (previous) await deleteStoredMedia(getStorage(), removedStorageKeys(previous.media, []))
    return undefined
  })
}

/* ───────────── media uploads ───────────── */

/**
 * Step 1 of an upload: check the file and get a presigned PUT to a `tmp/` key. The browser then PUTs
 * the file to `upload.url` and adds `asset` to the point; saving the point verifies the stored file
 * and moves it to `points/`.
 */
export async function createMediaUpload(input: MediaUploadRequest): Promise<ActionResult<MediaUpload>> {
  // Nothing changes until the point is saved, so no revalidation.
  return run(
    async () => {
      // Uploads are only for adding a point or editing its files.
      await requireAny([{ point: ["create"] }, { point: ["edit"] }])
      return presignMediaUpload(getStorage(), mediaMaxBytes(), input)
    },
    { revalidate: false },
  )
}

/* ───────────── collections ───────────── */

export async function createCollection(input: CollectionInput): Promise<ActionResult<Collection>> {
  return run(async () => {
    await requirePermission({ collection: ["create"] })
    return store.collections.create(collectionInputSchema.parse(input))
  })
}

export async function updateCollection(id: string, input: CollectionInput): Promise<ActionResult<Collection>> {
  return run(async () => {
    await requirePermission({ collection: ["edit"] })
    return store.collections.update(id, collectionInputSchema.parse(input))
  })
}

/** Also deletes the collection's stories (never its points). */
export async function deleteCollection(id: string): Promise<ActionResult> {
  return run(async () => {
    await requirePermission({ collection: ["delete"] })
    await store.collections.delete(id)
    return undefined
  })
}

/* ───────────── stories ───────────── */

export async function createStory(input: StoryInput): Promise<ActionResult<Story>> {
  return run(async () => {
    const data = storyInputSchema.parse(input)
    await requirePermission(data.status === "published" ? { story: ["create", "publish"] } : { story: ["create"] })
    return store.stories.create(data)
  })
}

export async function updateStory(id: string, input: Omit<StoryInput, "collectionId">): Promise<ActionResult<Story>> {
  return run(async () => {
    const data = storyInputSchema.omit({ collectionId: true }).parse(input)
    await requireStoryEdit(id, data.status)
    return store.stories.update(id, data)
  })
}

export async function deleteStory(id: string): Promise<ActionResult> {
  return run(async () => {
    await requirePermission({ story: ["delete"] })
    await store.stories.delete(id)
    return undefined
  })
}

/** Save the editor's chapter list (and optionally the story's own fields) in one go. */
export async function saveStory(
  id: string,
  input: { story: Omit<StoryInput, "collectionId">; chapters: ChapterDraft[] },
): Promise<ActionResult<StoryDetail>> {
  return run(async () => {
    const story = storyInputSchema.omit({ collectionId: true }).parse(input.story)
    const chapters = z.array(chapterDraftSchema).parse(input.chapters)
    await requireStoryEdit(id, story.status)
    await store.stories.update(id, story)
    return store.stories.saveChapters(id, chapters)
  })
}

/** Editing a story; publishing or unpublishing it (a status change) needs `story:publish` too. */
async function requireStoryEdit(id: string, status: StoryInput["status"]) {
  const current = await store.stories.get(id)
  if (!current) throw new NotFoundError("Story", id)
  const statusChanges = status !== undefined && status !== current.status
  await requirePermission(statusChanges ? { story: ["edit", "publish"] } : { story: ["edit"] })
}

/** Like `requirePermission`, but any one of these sets of permissions is enough. */
async function requireAny(options: Permissions[]) {
  const viewer = await getViewer()
  if (!viewer) throw new AuthError("signed-out")
  if (!options.some((p) => can(viewer.role, p))) throw new AuthError("forbidden")
  return viewer
}
