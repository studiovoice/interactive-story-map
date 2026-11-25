import { describe, expect, it } from "vitest"
import { coverMedia, hasVideo, mediaSummary } from "../media"

describe("point media helpers", () => {
  it("summarises files by kind, in a fixed order", () => {
    expect(mediaSummary([])).toBe("Note")
    expect(mediaSummary(["video", "image", "image"])).toBe("2 photos · 1 video")
    expect(mediaSummary([{ kind: "audio" }, { kind: "document" }])).toBe("1 audio clip · 1 document")
  })

  it("picks the first image or video as the cover, else audio", () => {
    expect(coverMedia([{ kind: "document" }, { kind: "audio" }, { kind: "video" }])).toEqual({ kind: "video" })
    expect(coverMedia([{ kind: "document" }, { kind: "audio" }])).toEqual({ kind: "audio" })
    expect(coverMedia([{ kind: "document" }])).toBeUndefined()
  })

  it("knows when a point has a video", () => {
    expect(hasVideo([{ kind: "image" }, { kind: "video" }])).toBe(true)
    expect(hasVideo([{ kind: "image" }])).toBe(false)
  })
})
