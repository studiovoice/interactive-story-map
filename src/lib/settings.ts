"use client"

/**
 * Per-viewer display preferences, kept in localStorage.
 *
 * To add a setting: add it to `Settings` and `DEFAULT_SETTINGS`, then add a row in
 * components/settings-menu.tsx. Read it anywhere with `useSettings()`.
 * (Once there are accounts, these can sync to the user's profile instead.)
 */
import { useSyncExternalStore } from "react"
import type { LngLat } from "@/lib/domain/schema"

/** Where the explore map (and the new-point map) open. See lib/map-start.ts. */
export const startViews = ["default", "last", "place"] as const
export type StartView = (typeof startViews)[number]

/** A place picked as the map's start view. */
export type SavedPlace = {
  label: string
  center: LngLat
  zoom: number
  /** [west, south, east, north]; when set, the map fits it instead of using center/zoom. */
  bounds?: [number, number, number, number]
}

export type Settings = {
  /** Draw the circles around points with an approximate or privacy-hidden location. */
  showApproxAreas: boolean
  /** "default": the site's default area. "last": where the explore map was left. "place": `startPlace`. */
  startView: StartView
  /** Kept when switching to another start view, so switching back restores it. */
  startPlace: SavedPlace | null
}

export const DEFAULT_SETTINGS: Settings = {
  showApproxAreas: true,
  startView: "default",
  startPlace: null,
}

const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
const isLngLat = (v: unknown): v is LngLat => Array.isArray(v) && isNum(v[0], -180, 180) && isNum(v[1], -90, 90)

function parsePlace(v: unknown): SavedPlace | null {
  if (!v || typeof v !== "object") return null
  const p = v as Partial<SavedPlace>
  if (typeof p.label !== "string" || !isLngLat(p.center) || !isNum(p.zoom, 0, 22)) return null
  const b = p.bounds
  const bounds =
    Array.isArray(b) && b.length === 4 && isLngLat([b[0], b[1]]) && isLngLat([b[2], b[3]])
      ? (b as SavedPlace["bounds"])
      : undefined
  return { label: p.label.slice(0, 120), center: p.center, zoom: p.zoom, ...(bounds && { bounds }) }
}

/** Saved values come from localStorage, so check every field and fall back to the default. */
function sanitize(raw: Record<string, unknown>): Settings {
  return {
    showApproxAreas: typeof raw.showApproxAreas === "boolean" ? raw.showApproxAreas : DEFAULT_SETTINGS.showApproxAreas,
    startView: startViews.includes(raw.startView as StartView)
      ? (raw.startView as StartView)
      : DEFAULT_SETTINGS.startView, // also maps the old "all" to "default"
    startPlace: parsePlace(raw.startPlace),
  }
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
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    cached = sanitize(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {})
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

/** Current settings outside React (e.g. when a map is created). Defaults on the server. */
export function getSettings(): Settings {
  return typeof window === "undefined" ? DEFAULT_SETTINGS : read()
}

/** Current settings. Server render and first paint use the defaults, then the saved values apply. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SETTINGS)
}
