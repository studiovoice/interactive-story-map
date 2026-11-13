import { describe, expect, it } from "vitest"
import { S3Storage } from "@/lib/storage/s3-storage"

// Presigning is done locally (no network), so these run without a bucket.
const local = {
  S3_BUCKET: "story-map-media",
  S3_ENDPOINT: "http://storage:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: "true",
}

describe("S3Storage presigning", () => {
  it("signs uploads for the browser-facing host, path style, with type and length", async () => {
    const s3 = new S3Storage(local)
    const up = await s3.createUpload({
      storageKey: "points/med_abcdefghijkl/a.jpg",
      mimeType: "image/jpeg",
      size: 1234,
    })
    const url = new URL(up.url)
    expect(url.origin).toBe("http://localhost:9000")
    expect(url.pathname).toBe("/story-map-media/points/med_abcdefghijkl/a.jpg")
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(["content-length", "content-type", "host"])
    expect(url.searchParams.get("X-Amz-Expires")).toBe("600")
    // No SDK checksum params: the browser can't send matching checksum headers.
    expect([...url.searchParams.keys()].filter((k) => /checksum/i.test(k))).toEqual([])
    expect(up).toMatchObject({ method: "PUT", headers: { "Content-Type": "image/jpeg" } })
  })

  it("signs short-lived reads", async () => {
    const url = new URL(await new S3Storage(local).getReadUrl("points/med_abcdefghijkl/a.jpg"))
    expect(url.origin).toBe("http://localhost:9000")
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300")
  })

  it("works with R2-style settings (virtual host off, region auto)", async () => {
    const r2 = new S3Storage({
      ...local,
      S3_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
      S3_PUBLIC_ENDPOINT: "",
      S3_REGION: "auto",
      S3_FORCE_PATH_STYLE: "false",
    })
    const url = new URL(
      (await r2.createUpload({ storageKey: "points/med_abcdefghijkl/a.jpg", mimeType: "image/jpeg", size: 1 })).url,
    )
    expect(url.host).toBe("story-map-media.acct.r2.cloudflarestorage.com")
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request")
  })

  it("needs a bucket", () => {
    expect(() => new S3Storage({})).toThrow(/S3_BUCKET/)
  })
})
