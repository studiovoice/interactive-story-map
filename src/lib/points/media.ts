import type { MediaAsset, MediaKind } from "@/lib/domain/schema"

/**
 * A point has no type of its own: what it is comes from the files attached to it.
 * These helpers work on full media lists or on just their kinds (`MapPoint.mediaKinds`).
 */

type HasKind = Pick<MediaAsset, "kind">

/** Images and videos: the files that can be shown in the media viewer. */
export const isVisual = (m: HasKind) => m.kind === "image" || m.kind === "video"

/** The file that stands for the point in thumbnails: the first image or video, else the first audio. */
export function coverMedia<T extends HasKind>(media: readonly T[]): T | undefined {
  return media.find(isVisual) ?? media.find((m) => m.kind === "audio")
}

export const hasVideo = (media: readonly HasKind[]) => media.some((m) => m.kind === "video")

const NOUN: Record<MediaKind, [string, string]> = {
  image: ["photo", "photos"],
  video: ["video", "videos"],
  audio: ["audio clip", "audio clips"],
  document: ["document", "documents"],
}

/** "2 photos · 1 video", or "Note" when the point has no files. */
export function mediaSummary(media: readonly (HasKind | MediaKind)[]): string {
  const counts = new Map<MediaKind, number>()
  for (const m of media) {
    const kind = typeof m === "string" ? m : m.kind
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }
  if (!counts.size) return "Note"
  return (Object.keys(NOUN) as MediaKind[])
    .filter((k) => counts.has(k))
    .map((k) => {
      const n = counts.get(k)!
      return `${n} ${NOUN[k][n === 1 ? 0 : 1]}`
    })
    .join(" · ")
}
