/**
 * The client-safe half of storage: what the browser needs to show media and to know whether
 * uploads are on. No secrets, no SDK. The server half (`getStorage()`) is in `./index.ts`.
 */
import type { MediaAsset } from "@/lib/domain/schema"

export type StorageDriver = "none" | "s3"

/** Inlined at build time: restart `pnpm dev` / rebuild after changing it. */
export const storageDriver: StorageDriver = process.env.NEXT_PUBLIC_STORAGE_DRIVER === "s3" ? "s3" : "none"

/** Whether the point form can upload files (otherwise media are linked by URL only). */
export const uploadsEnabled = storageDriver === "s3"

/** URL path that serves a stored object. With S3 it redirects to a short-lived signed URL. */
export function storedMediaPath(storageKey: string): string {
  const path = storageKey.split("/").map(encodeURIComponent).join("/")
  // Without a bucket, `storage` assets point at files dropped in /public/media during development.
  return storageDriver === "s3" ? `/api/media/${path}` : `/media/${path}`
}

/** Resolve any media asset to something an <img>/<video> can load, or null. */
export function mediaUrl(asset: MediaAsset): string | null {
  if (asset.source === "external") return asset.url ?? null
  if (asset.storageKey) return storedMediaPath(asset.storageKey)
  return null
}
