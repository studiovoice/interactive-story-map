"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { Point, PointSearchResult } from "@/lib/domain/schema"

const MIN_CHARS = 2
const DEBOUNCE_MS = 150

type State = { query: string; result: PointSearchResult | null; error: boolean }

export type PointSearch = {
  /** False when the query is too short to search; show everything. */
  active: boolean
  loading: boolean
  error: boolean
  /** Ids of every match, or null while there's no result yet for an active query. */
  ids: Set<string> | null
  total: number
  /** The closest few matches, in full. */
  top: Point[]
}

/**
 * Debounced point search against /api/points/search. Results are ranked by distance from
 * `getNear()` (read when the request fires, usually the map center). While a new query is
 * loading, the previous result is kept so the map doesn't flash.
 */
export function usePointSearch(query: string, getNear?: () => { lng: number; lat: number } | null): PointSearch {
  const q = query.trim()
  const active = q.length >= MIN_CHARS
  const [state, setState] = useState<State>({ query: "", result: null, error: false })
  const nearRef = useRef(getNear)
  useEffect(() => {
    nearRef.current = getNear
  })

  useEffect(() => {
    if (!active) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ q, limit: "5" })
      const near = nearRef.current?.()
      if (near) {
        params.set("lat", near.lat.toFixed(4))
        params.set("lng", near.lng.toFixed(4))
      }
      try {
        const res = await fetch(`/api/points/search?${params}`, { signal: ctrl.signal })
        if (!res.ok) throw new Error(String(res.status))
        setState({ query: q, result: (await res.json()) as PointSearchResult, error: false })
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setState({ query: q, result: null, error: true })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, active])

  const ids = useMemo(() => (state.result ? new Set(state.result.ids) : null), [state.result])
  if (!active) return { active: false, loading: false, error: false, ids: null, total: 0, top: [] }
  const fresh = state.query === q
  return {
    active: true,
    loading: !fresh,
    error: fresh && state.error,
    ids,
    total: state.result?.total ?? 0,
    top: state.result?.top ?? [],
  }
}
