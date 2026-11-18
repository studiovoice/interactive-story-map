import "server-only"

import { storageDriver } from "./client"
import { DEFAULT_MEDIA_MAX_BYTES } from "./rules"
import { S3Storage } from "./s3-storage"

/**
 * Object storage contract, server side only (it holds credentials).
 * The browser side (`mediaUrl`, `uploadsEnabled`) is in `./client.ts`.
 *
 * Upload flow: the point form calls the `createMediaUpload` server action, which returns a
 * presigned PUT from `createUpload()`. The browser PUTs the file straight to the bucket and
 * saves a `MediaAsset { source: "storage", storageKey }` on the point. On save, the server
 * checks the object with `head()` before accepting it.
 */
export interface StorageProvider {
  readonly name: string
  /** Whether this provider can accept uploads. */
  readonly canUpload: boolean
  /** Presigned PUT for a direct browser upload. The browser must send exactly `headers`. */
  createUpload(input: { storageKey: string; mimeType: string; size: number }): Promise<PresignedUpload>
  /** Short-lived URL the browser can read the object from. */
  getReadUrl(storageKey: string): Promise<string>
  /** Size and type of a stored object, or null when it doesn't exist. */
  head(storageKey: string): Promise<{ size: number; contentType: string | null } | null>
  delete(storageKey: string): Promise<void>
}

export type PresignedUpload = {
  url: string
  method: "PUT"
  headers: Record<string, string>
  /** Seconds until `url` stops working. */
  expiresIn: number
}

class NoStorage implements StorageProvider {
  readonly name = "none"
  readonly canUpload = false
  async createUpload(): Promise<never> {
    throw new Error("File uploads are not configured. Add a URL instead.")
  }
  async getReadUrl(storageKey: string) {
    return `/media/${storageKey}`
  }
  async head() {
    return null
  }
  async delete() {}
}

/** Largest accepted upload in bytes (MEDIA_MAX_BYTES, default 100 MB). */
export function mediaMaxBytes(): number {
  const n = Number(process.env.MEDIA_MAX_BYTES)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MEDIA_MAX_BYTES
}

let provider: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (provider) return provider
  switch (storageDriver) {
    case "none":
      provider = new NoStorage()
      break
    case "s3":
      provider = new S3Storage()
      break
    default:
      throw new Error(`Unknown storage driver "${storageDriver}"`)
  }
  return provider
}
