"use client"

/**
 * Per-viewer display preferences, kept in localStorage.
 *
 * To add a setting: add it to `Settings` and `DEFAULT_SETTINGS`, then add a row in
 * components/settings-menu.tsx. Read it anywhere with `useSettings()`.
 * (Once there are accounts, these can sync to the user's profile instead.)
 */
import { useSyncExternalStore } from "react"

export type Settings = {
  /** Draw the circles around points with an approximate or privacy-hidden location. */
  showApproxAreas: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  showApproxAreas: true,
}

const KEY = "voice-story-map:settings"
const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cached: Settings = DEFAULT_SETTINGS
/** Set when localStorage can't be written; settings then live in memory for this session. */
let memoryOnly = false

function read(): Settings {
  if (memoryOnly) return cached
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    // Private mode / blocked storage: fall back to defaults.
  }
  if (raw === cachedRaw) return cached
  cachedRaw = raw
  try {
    cached = { ...DEFAULT_SETTINGS, ...(raw ? (JSON.parse(raw) as Partial<Settings>) : {}) }
  } catch {
    cached = DEFAULT_SETTINGS
  }
  return cached
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  // Keep other tabs in sync.
  const onStorage = (e: StorageEvent) => e.key === KEY && cb()
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(cb)
    window.removeEventListener("storage", onStorage)
  }
}

export function updateSettings(patch: Partial<Settings>) {
  const next = { ...read(), ...patch }
  cachedRaw = JSON.stringify(next)
  cached = next
  try {
    localStorage.setItem(KEY, cachedRaw)
  } catch {
    memoryOnly = true // still apply for this session
  }
  listeners.forEach((l) => l())
}

export function resetSettings() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
  cachedRaw = undefined
  cached = DEFAULT_SETTINGS
  listeners.forEach((l) => l())
}

/** Current settings. Server render and first paint use the defaults, then the saved values apply. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS)
}
