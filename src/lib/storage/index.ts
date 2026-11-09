import type { MediaAsset } from "@/lib/domain/schema"

/**
 * Object storage contract (S3 / MinIO later). Nothing uploads yet: media are plain
 * external URLs. When a bucket is added, implement this interface in
 * `s3-storage.ts` with `@aws-sdk/client-s3` (MinIO speaks the same API), and have
 * `getStorage()` return it when `STORAGE_DRIVER=s3`.
 *
 * Expected upload flow then: the client asks a server action for
 * `createUploadUrl()`, PUTs the file straight to the bucket, and saves a
 * `MediaAsset { source: "storage", storageKey }` on the point.
 */
export interface StorageProvider {
  readonly name: string
  /** Whether this provider can accept uploads. The UI hides/disables upload controls when false. */
  readonly canUpload: boolean
  /** Public (or signed) URL for a stored object. */
  getUrl(storageKey: string): string
  /** Presigned PUT for a direct browser upload. */
  createUploadUrl(input: { fileName: string; mimeType: string }): Promise<{ uploadUrl: string; storageKey: string }>
  delete(storageKey: string): Promise<void>
}

class NoStorage implements StorageProvider {
  readonly name = "none"
  readonly canUpload = false
  getUrl(storageKey: string) {
    // Lets `storage` assets point at files dropped in /public/media during development.
    return `/media/${storageKey}`
  }
  async createUploadUrl(): Promise<never> {
    throw new Error("File uploads are not configured yet. Add a URL instead.")
  }
  async delete() {}
}

let provider: StorageProvider | null = null

export function getStorage(): StorageProvider {
  if (provider) return provider
  const driver = process.env.NEXT_PUBLIC_STORAGE_DRIVER ?? "none"
  switch (driver) {
    case "none":
      provider = new NoStorage()
      break
    default:
      throw new Error(`Unknown storage driver "${driver}"`)
  }
  return provider
}

/** Resolve any media asset to something an <img>/<video> can load, or null. */
export function mediaUrl(asset: MediaAsset): string | null {
  if (asset.source === "external") return asset.url ?? null
  if (asset.storageKey) return getStorage().getUrl(asset.storageKey)
  return null
}
