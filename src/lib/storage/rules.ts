/**
 * Upload rules shared by the browser (to fail fast) and the server (to enforce).
 * Pure, safe on client and server.
 */
import type { MediaKind } from "@/lib/domain/schema"

/** Upper bound for one file. The server reads MEDIA_MAX_BYTES; the browser only uses this as a hint. */
export const DEFAULT_MEDIA_MAX_BYTES = 100 * 1024 * 1024

/** File types we accept per media kind. Anything else is rejected before and after upload. */
export const ALLOWED_MIME_TYPES: Record<MediaKind, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif", "image/heic", "image/heif"],
  video: ["video/mp4", "video/webm", "video/quicktime"],
  audio: ["audio/mpeg", "audio/mp4", "audio/aac", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm", "audio/flac"],
  document: ["application/pdf", "text/plain"],
}

/** `accept` attribute for a file input: every allowed type. */
export const ACCEPT_ATTRIBUTE = Object.values(ALLOWED_MIME_TYPES).flat().join(",")

/** The media kind a MIME type belongs to, or null when we don't accept it. */
export function mediaKindForMime(mimeType: string): MediaKind | null {
  const type = mimeType.toLowerCase()
  for (const [kind, types] of Object.entries(ALLOWED_MIME_TYPES) as [MediaKind, readonly string[]][]) {
    if (types.includes(type)) return kind
  }
  return null
}

/** Keep keys readable and safe in URLs: letters, digits, dot, dash, underscore; at most 100 chars. */
export function sanitizeFileName(fileName: string): string {
  const name = fileName.split(/[/\\]/).pop() ?? ""
  const dot = name.lastIndexOf(".")
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot + 1) : ""
  const clean = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
  const safeBase = clean(base).slice(0, 80) || "file"
  const safeExt = clean(ext).toLowerCase().slice(0, 10)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

const MEDIA_ID = /^med_[a-z0-9]{12}$/
const KEY = /^(tmp|points)\/(med_[a-z0-9]{12})\/([a-zA-Z0-9._-]{1,100})$/

export const isMediaId = (id: string) => MEDIA_ID.test(id)

/**
 * Where files live in the bucket:
 * - `tmp/<mediaId>/<file>`: just uploaded, not on a saved point yet. A bucket lifecycle rule deletes
 *   these after a day (scripts/storage/lifecycle.json), so abandoned uploads clean themselves up.
 * - `points/<mediaId>/<file>`: on a saved point. Files only get here by being moved out of `tmp/` when
 *   a point is saved, so each one belongs to exactly one point.
 */
export type KeyPrefix = "tmp" | "points"

function keyFor(prefix: KeyPrefix, mediaId: string, fileName: string): string {
  if (!isMediaId(mediaId)) throw new Error(`Invalid media id "${mediaId}"`)
  return `${prefix}/${mediaId}/${sanitizeFileName(fileName)}`
}

/** Key a new upload goes to: `tmp/<mediaId>/<file-name>`. */
export const uploadKeyFor = (mediaId: string, fileName: string) => keyFor("tmp", mediaId, fileName)

/** Key of a file on a saved point: `points/<mediaId>/<file-name>`. */
export const storageKeyFor = (mediaId: string, fileName: string) => keyFor("points", mediaId, fileName)

/** Split one of our keys into its parts, or null when the key isn't one of ours. */
export function parseStorageKey(key: string): { prefix: KeyPrefix; mediaId: string; fileName: string } | null {
  const m = KEY.exec(key)
  return m ? { prefix: m[1] as KeyPrefix, mediaId: m[2], fileName: m[3] } : null
}

/** The media id a key belongs to, or null when the key isn't one of ours. */
export function mediaIdFromKey(key: string): string | null {
  return parseStorageKey(key)?.mediaId ?? null
}
