/**
 * What the public may see of a point. Public responses (the map's point panel, search, story
 * playback) go through these, so who added a point, where it came from and the old free-text
 * `contributor` never reach a visitor's browser. Staff responses keep everything.
 */
import {
  staffOnlyPointFields,
  type Point,
  type PointDetail,
  type PointSearchResult,
  type StoryDetail,
} from "@/lib/domain/schema"

export function toPublicPoint<T extends Point>(point: T): T {
  const copy = { ...point }
  for (const field of staffOnlyPointFields) delete copy[field]
  return copy
}

export function toPublicPointDetail(detail: PointDetail): PointDetail {
  return { point: toPublicPoint(detail.point), usage: detail.usage }
}

export function toPublicSearchResult(result: PointSearchResult): PointSearchResult {
  return { ...result, top: result.top.map(toPublicPoint) }
}

export function toPublicStory(story: StoryDetail): StoryDetail {
  return {
    ...story,
    chapters: story.chapters.map((ch) => ({
      ...ch,
      points: ch.points.map((cp) => ({ ...cp, point: toPublicPoint(cp.point) })),
    })),
  }
}

/**
 * The "Added by" label staff see: "Public", the staff member's name, or "Staff (before sign-in)"
 * for points from before accounts existed. `staffName` looks up a user id.
 */
export function addedByLabel(
  point: Pick<Point, "source" | "createdBy">,
  staffName: (id: string) => string | undefined,
) {
  if (point.source === "public") return "Public"
  if (!point.createdBy) return "Staff (before sign-in)"
  return staffName(point.createdBy) ?? "Staff"
}
