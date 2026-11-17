import { describe, expect, it } from "vitest"
import { newId } from "@/lib/ids"
import { isMediaId } from "@/lib/storage/rules"

describe("newId", () => {
  it("is a prefix plus 12 lowercase letters or digits", () => {
    for (const prefix of ["pt", "col", "sty", "ch", "med"] as const) {
      expect(newId(prefix)).toMatch(new RegExp(`^${prefix}_[0-9a-z]{12}$`))
    }
  })

  it("makes media ids the upload checks accept", () => {
    expect(isMediaId(newId("med"))).toBe(true)
  })

  it("doesn't repeat", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId("pt")))
    expect(ids.size).toBe(10_000)
  })
})
