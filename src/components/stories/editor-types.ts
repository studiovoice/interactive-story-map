import type { Camera, ChapterConnection, ChapterDraft, LngLat, StoryDetail, StoryStatus } from "@/lib/domain/schema"

export type EditorChapter = {
  id: string
  title: string
  narrative: string
  connection: ChapterConnection
  route: LngLat[]
  camera: Camera | null
  points: { pointId: string; note: string }[]
}

export type EditorMeta = { title: string; summary: string; status: StoryStatus }

export type EditorState = { meta: EditorMeta; chapters: EditorChapter[] }

export type EditorMode = "select" | "add" | "route"

export function stateFromStory(story: StoryDetail): EditorState {
  return {
    meta: { title: story.title, summary: story.summary, status: story.status },
    chapters: story.chapters.map((c) => ({
      id: c.id,
      title: c.title,
      narrative: c.narrative,
      connection: c.connection,
      route: c.route,
      camera: c.camera,
      points: c.points.map((cp) => ({ pointId: cp.pointId, note: cp.note })),
    })),
  }
}

export const toDrafts = (chapters: EditorChapter[]): ChapterDraft[] => chapters.map((c) => ({ ...c }))

export const newChapterId = () => `ch_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
