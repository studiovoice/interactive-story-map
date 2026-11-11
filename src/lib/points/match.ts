import type { Point } from "@/lib/domain/schema"

/** Case-insensitive match on title, description, place name and tags. Empty query matches everything. */
export function matchesQuery(p: Pick<Point, "title" | "description" | "placeName" | "tags">, q: string) {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    p.title.toLowerCase().includes(s) ||
    p.description.toLowerCase().includes(s) ||
    p.placeName.toLowerCase().includes(s) ||
    p.tags.some((t) => t.toLowerCase().includes(s))
  )
}
