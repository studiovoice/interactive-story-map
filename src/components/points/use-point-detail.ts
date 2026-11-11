"use client"

import { useEffect, useState } from "react"
import type { PointDetail } from "@/lib/domain/schema"

type Entry = { detail: PointDetail | null; error: boolean }

/**
 * Loads one point's full details (GET /api/points/:id) for the details panel, keeping the ones
 * already seen. Pass the page's point data as `version`: when the server sends new data (after
 * an edit), the cache starts over.
 */
export function usePointDetail(id: string | null, version: unknown) {
  const [cache, setCache] = useState(() => ({ version, entries: new Map<string, Entry>() }))
  // New server data: forget what we fetched before (adjusting state during render, not in an effect).
  if (cache.version !== version) setCache({ version, entries: new Map() })
  const entry = id ? cache.entries.get(id) : undefined
  const needed = !!id && !entry

  useEffect(() => {
    if (!id || !needed) return
    const ctrl = new AbortController()
    const put = (e: Entry) =>
      setCache((c) => (c.version === version ? { version, entries: new Map(c.entries).set(id, e) } : c))
    fetch(`/api/points/${encodeURIComponent(id)}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.status === 404) return put({ detail: null, error: false })
        if (!res.ok) throw new Error(String(res.status))
        put({ detail: (await res.json()) as PointDetail, error: false })
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") put({ detail: null, error: true })
      })
    return () => ctrl.abort()
  }, [id, needed, version])

  return {
    detail: entry?.detail ?? null,
    loading: !!id && !entry,
    error: !!entry?.error,
    notFound: !!entry && !entry.error && !entry.detail,
    /** Forget a failed load so it's fetched again. */
    retry: () =>
      setCache((c) => {
        if (!id) return c
        const entries = new Map(c.entries)
        entries.delete(id)
        return { version: c.version, entries }
      }),
  }
}
