"use server"

/*
 * All mutations. Each action validates with the same zod schemas the repositories use,
 * talks to `store` only, and revalidates the whole app (data is small; keeps every
 * page fresh after any write).
 *
 * TODO(auth): check the session here before every mutation once auth exists.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { store, NotFoundError } from "@/lib/data"
import {
  chapterDraftSchema,
  collectionInputSchema,
  pointInputSchema,
  storyInputSchema,
  type ChapterDraft,
  type Collection,
  type CollectionInput,
  type Point,
  type PointInput,
  type Story,
  type StoryDetail,
  type StoryInput,
} from "@/lib/domain/schema"

export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string[]> }

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    revalidatePath("/", "layout")
    return { ok: true, data }
  } catch (err) {
    if (err instanceof z.ZodError) {
      return {
        ok: false,
        error: err.issues[0]?.message ?? "Some fields are invalid",
        fieldErrors: z.flattenError(err).fieldErrors as Record<string, string[]>,
      }
    }
    if (err instanceof NotFoundError) return { ok: false, error: err.message }
    console.error(err)
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

/* ───────────── points ───────────── */

export async function createPoint(input: PointInput): Promise<ActionResult<Point>> {
  return run(() => store.points.create(pointInputSchema.parse(input)))
}

export async function updatePoint(id: string, input: PointInput): Promise<ActionResult<Point>> {
  return run(() => store.points.update(id, pointInputSchema.parse(input)))
}

export async function deletePoint(id: string): Promise<ActionResult> {
  return run(async () => {
    await store.points.delete(id)
    return undefined
  })
}

/* ───────────── collections ───────────── */

export async function createCollection(input: CollectionInput): Promise<ActionResult<Collection>> {
  return run(() => store.collections.create(collectionInputSchema.parse(input)))
}

export async function updateCollection(id: string, input: CollectionInput): Promise<ActionResult<Collection>> {
  return run(() => store.collections.update(id, collectionInputSchema.parse(input)))
}

export async function deleteCollection(id: string): Promise<ActionResult> {
  return run(async () => {
    await store.collections.delete(id)
    return undefined
  })
}

/* ───────────── stories ───────────── */

export async function createStory(input: StoryInput): Promise<ActionResult<Story>> {
  return run(() => store.stories.create(storyInputSchema.parse(input)))
}

export async function updateStory(id: string, input: Omit<StoryInput, "collectionId">): Promise<ActionResult<Story>> {
  return run(() => store.stories.update(id, storyInputSchema.omit({ collectionId: true }).parse(input)))
}

export async function deleteStory(id: string): Promise<ActionResult> {
  return run(async () => {
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
    await store.stories.update(id, story)
    return store.stories.saveChapters(id, chapters)
  })
}
