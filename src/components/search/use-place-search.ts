"use client"

import { useEffect, useRef, useState } from "react"
import type { PlaceResult } from "@/lib/geocoding/types"

const MIN_CHARS = 3
const DEBOUNCE_MS = 250

type State = { query: string; results: PlaceResult[]; loading: boolean; error: string | null }

/**
 * Debounced place search against /api/geocode. `getNear` (usually the map center) is read
 * when the request fires, to bias results toward what the user is looking at.
 */
export function usePlaceSearch(query: string, getNear?: () => { lng: number; lat: number } | null) {
  const q = query.trim()
  const active = q.length >= MIN_CHARS
  const [state, setState] = useState<State>({ query: "", results: [], loading: false, error: null })
  const nearRef = useRef(getNear)
  useEffect(() => {
    nearRef.current = getNear
  })

  useEffect(() => {
    if (!active) return
    const ctrl = new AbortController()
    const timer = setTimeout(async () => {
      setState((s) => ({ ...s, loading: true }))
      const params = new URLSearchParams({ q })
      const near = nearRef.current?.()
      if (near) {
        params.set("lat", near.lat.toFixed(3))
        params.set("lng", near.lng.toFixed(3))
      }
      try {
        const res = await fetch(`/api/geocode?${params}`, { signal: ctrl.signal })
        const body = (await res.json()) as { results: PlaceResult[]; error?: string }
        setState({ query: q, results: body.results ?? [], loading: false, error: body.error ?? null })
      } catch (err) {
        if ((err as Error).name === "AbortError") return
        setState({ query: q, results: [], loading: false, error: "Place search is unavailable right now." })
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, active])

  if (!active) return { results: [], loading: false, error: null, active: false }
  // Until the debounced request for this exact query lands, we're loading.
  const fresh = state.query === q
  return { results: state.results, loading: state.loading || !fresh, error: fresh ? state.error : null, active: true }
}
