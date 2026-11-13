import "server-only"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import type { PresignedUpload, StorageProvider } from "./index"

/**
 * S3-compatible storage: RustFS locally, Amazon S3 or Cloudflare R2 in production.
 * Only uses what all three support: presigned PUT/GET, HEAD, DELETE. Configured from S3_* env vars
 * (see .env.example).
 */
export class S3Storage implements StorageProvider {
  readonly name = "s3"
  readonly canUpload = true
  private readonly bucket: string
  /** Talks to the bucket from the server. */
  private readonly client: S3Client
  /** Signs URLs the browser will call; may use a different host (S3_PUBLIC_ENDPOINT). */
  private readonly signer: S3Client

  constructor(env: Record<string, string | undefined> = process.env) {
    const bucket = env.S3_BUCKET
    if (!bucket) throw new Error("S3_BUCKET is not set (needed for NEXT_PUBLIC_STORAGE_DRIVER=s3). See .env.example.")
    this.bucket = bucket

    const endpoint = env.S3_ENDPOINT || undefined
    const base: S3ClientConfig = {
      region: env.S3_REGION || "us-east-1",
      forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
      // Without keys, the SDK's default chain is used (e.g. an IAM role on AWS).
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
          : undefined,
      // Newer SDKs add CRC32 checksums to every PUT by default. A presigned URL would then demand a
      // checksum header the browser never sends, and R2/RustFS may not support them anyway.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    }
    this.client = new S3Client({ ...base, endpoint })
    this.signer = new S3Client({ ...base, endpoint: env.S3_PUBLIC_ENDPOINT || endpoint })
  }

  async createUpload({ storageKey, mimeType, size }: { storageKey: string; mimeType: string; size: number }) {
    const expiresIn = 10 * 60
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: size,
    })
    const url = await getSignedUrl(this.signer, command, {
      expiresIn,
      // Sign type and length: S3 rejects a body of any other size. (R2 may not check the length;
      // the HEAD check when the point is saved covers that.)
      signableHeaders: new Set(["content-type", "content-length"]),
    })
    // The browser sets Content-Length itself from the file; it may not be set by hand.
    return { url, method: "PUT", headers: { "Content-Type": mimeType }, expiresIn } satisfies PresignedUpload
  }

  async getReadUrl(storageKey: string) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }), {
      expiresIn: 5 * 60,
    })
  }

  async head(storageKey: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: storageKey }))
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null }
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      if (status === 404 || (err as Error).name === "NotFound") return null
      throw err
    }
  }

  async delete(storageKey: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }))
  }
}
