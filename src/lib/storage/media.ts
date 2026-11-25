import "server-only"

import { z } from "zod"
import { newId } from "@/lib/ids"
import type { MediaAsset, MediaKind } from "@/lib/domain/schema"
import type { PresignedUpload, StorageProvider } from "./index"
import { mediaIdFromKey, mediaKindForMime, parseStorageKey, storageKeyFor, storedFileName, uploadKeyFor } from "./rules"

/** A problem the user can fix (shown as the error message of the action). */
export class MediaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MediaError"
  }
}

const formatMb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`

export const mediaUploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().toLowerCase().min(1).max(100),
  size: z.number().int().positive(),
})
export type MediaUploadRequest = z.input<typeof mediaUploadRequestSchema>

export type MediaUpload = {
  /**
   * The new asset (with its `tmp/` key), ready to add to the point once the upload has finished.
   * No `fileName`: the uploader's file name is never saved (labels are public; see the point form).
   */
  asset: MediaAsset & { source: "storage"; storageKey: string }
  upload: PresignedUpload
}

/** Check a file the browser wants to upload and presign a PUT for it, to a `tmp/` key. */
export async function createMediaUpload(
  storage: StorageProvider,
  maxBytes: number,
  request: MediaUploadRequest,
): Promise<MediaUpload> {
  if (!storage.canUpload) throw new MediaError("File uploads are not configured. Add a URL instead.")
  const { fileName, mimeType, size } = mediaUploadRequestSchema.parse(request)
  const kind = mediaKindForMime(mimeType)
  if (!kind) throw new MediaError(`Files of type ${mimeType || "unknown"} can't be uploaded.`)
  if (size > maxBytes) throw new MediaError(`That file is too big (the limit is ${formatMb(maxBytes)}).`)

  const id = newId("med")
  const storageKey = uploadKeyFor(id, storedFileName(kind, fileName))
  const upload = await storage.createUpload({ storageKey, mimeType, size })
  return { asset: { id, kind, source: "storage", storageKey, mimeType }, upload }
}

const sameStored = (a: MediaAsset, b: MediaAsset) =>
  a.id === b.id && a.source === "storage" && b.source === "storage" && a.storageKey === b.storageKey

/**
 * Before saving a point: check every stored file that wasn't on the point before. It must be a fresh
 * upload (a `tmp/` key belonging to its asset's id), exist, and have an allowed type and size. The
 * type and kind are taken from the bucket, not from the browser. Bad files are deleted.
 *
 * Requiring `tmp/` means a point can't claim a file that's already on another point (a `points/`
 * key), so deleting one point can never delete another point's file.
 *
 * Returns the media list, still with `tmp/` keys; `saveWithStoredMedia` moves them.
 */
export async function verifyStoredMedia(
  storage: StorageProvider,
  maxBytes: number,
  next: MediaAsset[],
  previous: MediaAsset[] = [],
): Promise<MediaAsset[]> {
  // Without a bucket, "storage" assets point at files in /public/media (dev only); nothing to check.
  if (!storage.canUpload) return next

  return Promise.all(
    next.map(async (asset): Promise<MediaAsset> => {
      if (asset.source !== "storage") return asset
      if (previous.some((p) => sameStored(p, asset))) return asset

      const key = asset.storageKey ?? ""
      const parsed = parseStorageKey(key)
      if (parsed?.prefix !== "tmp" || parsed.mediaId !== asset.id)
        throw new MediaError("An uploaded file isn't valid. Remove it and upload it again.")
      // File names aren't saved, so errors name the file by its label or its kind.
      const name = asset.fileName ? `“${asset.fileName}”` : `An uploaded ${asset.kind}`
      const head = await storage.head(key)
      if (!head)
        throw new MediaError(
          `${name} isn't in storage. It may still be uploading, or it expired: remove it and upload it again.`,
        )

      const contentType = head.contentType?.split(";")[0].trim().toLowerCase() ?? ""
      const kind = mediaKindForMime(contentType)
      const problem = !kind
        ? `${name} has a file type that isn't allowed.`
        : head.size > maxBytes
          ? `${name} is too big (the limit is ${formatMb(maxBytes)}).`
          : null
      if (problem) {
        await deleteStoredMedia(storage, [key])
        throw new MediaError(problem)
      }
      return { ...asset, kind: kind as MediaKind, mimeType: contentType }
    }),
  )
}

/**
 * Save a point with its media: verify new uploads, move them from `tmp/` to `points/`, then call
 * `save` with the media list pointing at `points/`.
 *
 * Order: copy → save → delete the `tmp/` originals. The saved point never names a file that isn't
 * there yet. If the save fails, the copies are removed again and the `tmp/` originals are still
 * there, so the user can retry. Anything left in `tmp/` is removed by the bucket's lifecycle rule.
 */
export async function saveWithStoredMedia<T>(
  storage: StorageProvider,
  maxBytes: number,
  next: MediaAsset[],
  previous: MediaAsset[],
  save: (media: MediaAsset[]) => Promise<T>,
): Promise<T> {
  const verified = await verifyStoredMedia(storage, maxBytes, next, previous)
  if (!storage.canUpload) return save(verified)

  const moves: { from: string; to: string }[] = []
  const media = verified.map((asset) => {
    const parsed = asset.source === "storage" && asset.storageKey ? parseStorageKey(asset.storageKey) : null
    if (parsed?.prefix !== "tmp") return asset
    const to = storageKeyFor(parsed.mediaId, parsed.fileName)
    moves.push({ from: asset.storageKey!, to })
    return { ...asset, storageKey: to }
  })

  const copies = await Promise.allSettled(moves.map((m) => storage.copy(m.from, m.to)))
  const failed = copies.find((r) => r.status === "rejected")
  if (failed) {
    await deleteStoredMedia(
      storage,
      moves.filter((_, i) => copies[i].status === "fulfilled").map((m) => m.to),
    )
    throw failed.reason
  }

  let result: T
  try {
    result = await save(media)
  } catch (err) {
    await deleteStoredMedia(
      storage,
      moves.map((m) => m.to),
    )
    throw err
  }
  await deleteStoredMedia(
    storage,
    moves.map((m) => m.from),
  )
  return result
}

/** Keys that were on the point before but aren't any more. */
export function removedStorageKeys(previous: MediaAsset[], next: MediaAsset[]): string[] {
  const kept = new Set(next.flatMap((m) => (m.source === "storage" && m.storageKey ? [m.storageKey] : [])))
  return previous.flatMap((m) =>
    m.source === "storage" && m.storageKey && !kept.has(m.storageKey) && mediaIdFromKey(m.storageKey)
      ? [m.storageKey]
      : [],
  )
}

/** Best effort: a file that can't be deleted now is only wasted space, so log and move on. */
export async function deleteStoredMedia(storage: StorageProvider, keys: string[]): Promise<void> {
  if (!storage.canUpload || !keys.length) return
  const results = await Promise.allSettled(keys.map((k) => storage.delete(k)))
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error(`Couldn't delete stored media ${keys[i]}:`, r.reason)
  })
}
