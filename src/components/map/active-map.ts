"use client"

/**
 * The explore map currently on screen, if any, so UI outside it (the settings menu's
 * "Use current map view") can read its view. The explore map registers itself while it's shown.
 */
import type { Map as MlMap } from "maplibre-gl"
import { useEffect, useSyncExternalStore } from "react"

let active: MlMap | null = null
const listeners = new Set<() => void>()

function set(map: MlMap | null) {
  active = map
  listeners.forEach((l) => l())
}

/** Register `map` as the active explore map while the calling component is mounted (and visible). */
export function useRegisterActiveMap(map: MlMap | null) {
  useEffect(() => {
    if (!map) return
    set(map)
    return () => {
      if (active === map) set(null)
    }
  }, [map])
}

export function useActiveMap(): MlMap | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => void listeners.delete(cb)
    },
    () => active,
    () => null,
  )
}
