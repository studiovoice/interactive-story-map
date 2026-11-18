import "server-only"

import { z } from "zod"
import { newId } from "@/lib/ids"
import type { MediaAsset, MediaKind } from "@/lib/domain/schema"
import type { PresignedUpload, StorageProvider } from "./index"
import { mediaIdFromKey, mediaKindForMime, storageKeyFor } from "./rules"

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
  /** The new asset, ready to add to the point once the upload has finished. */
  asset: MediaAsset & { source: "storage"; storageKey: string }
  upload: PresignedUpload
}

/** Check a file the browser wants to upload and presign a PUT for it. */
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
  const storageKey = storageKeyFor(id, fileName)
  const upload = await storage.createUpload({ storageKey, mimeType, size })
  return { asset: { id, kind, source: "storage", storageKey, fileName, mimeType }, upload }
}

const sameStored = (a: MediaAsset, b: MediaAsset) =>
  a.id === b.id && a.source === "storage" && b.source === "storage" && a.storageKey === b.storageKey

/**
 * Before saving a point: check every stored file that wasn't on the point before. It must be one
 * of our keys, belong to its asset's id, exist, and have an allowed type and size. The type and
 * kind are taken from the bucket, not from the browser. Bad files are deleted.
 *
 * Returns the media list to save.
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
      if (mediaIdFromKey(key) !== asset.id)
        throw new MediaError("An uploaded file isn't valid. Remove it and upload it again.")
      const head = await storage.head(key)
      if (!head) throw new MediaError(`“${asset.fileName ?? key}” hasn't finished uploading. Try again in a moment.`)

      const contentType = head.contentType?.split(";")[0].trim().toLowerCase() ?? ""
      const kind = mediaKindForMime(contentType)
      const problem = !kind
        ? `“${asset.fileName ?? key}” has a file type that isn't allowed.`
        : head.size > maxBytes
          ? `“${asset.fileName ?? key}” is too big (the limit is ${formatMb(maxBytes)}).`
          : null
      if (problem) {
        await deleteStoredMedia(storage, [key])
        throw new MediaError(problem)
      }
      return { ...asset, kind: kind as MediaKind, mimeType: contentType }
    }),
  )
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
