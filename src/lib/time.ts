/**
 * Times are stored as local wall-clock strings ("2026-03-14T10:05", see schema.ts).
 * We do all math on them as if they were UTC so formatting never shifts them into
 * the viewer's timezone.
 */

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

export function parseLocal(value: string | null | undefined): number | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0)
}

/** ms → "2026-03-14T10:05" (for <input type="datetime-local">). */
export function toLocalInput(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16)
}

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
const hourFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", timeZone: "UTC" })
const dateFmt = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})
const dateYearFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})
const shortDateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" })

export const formatTime = (ms: number) => timeFmt.format(ms)
export const formatHour = (ms: number) => hourFmt.format(ms)
export const formatDate = (ms: number) => dateFmt.format(ms)
export const formatDateYear = (ms: number) => dateYearFmt.format(ms)
export const formatShortDate = (ms: number) => shortDateFmt.format(ms)

export function formatCaptured(capturedAt: string | null, approximate = false): string {
  const ms = parseLocal(capturedAt)
  if (ms === null) return "Time not recorded"
  if (approximate) return `${formatDate(ms)} · ≈ ${timeOfDay(ms)}`
  return `${formatDate(ms)} · ${formatTime(ms)}`
}

export function timeOfDay(ms: number): "Morning" | "Afternoon" | "Evening" | "Night" {
  const minutes = (((ms % DAY) + DAY) % DAY) / MINUTE
  if (minutes < 300) return "Night"
  if (minutes < 720) return "Morning"
  if (minutes < 1080) return "Afternoon"
  if (minutes < 1170) return "Evening"
  return "Night"
}

export const sameDay = (a: number, b: number) => Math.floor(a / DAY) === Math.floor(b / DAY)

/** "2 hours", "45 minutes", "3 days" */
export function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  if (abs >= 2 * DAY) return `${Math.round(abs / DAY)} days`
  if (abs >= 90 * MINUTE) return `${Math.round(abs / HOUR)} hours`
  if (abs >= 60 * MINUTE) return "1 hour"
  return `${Math.max(1, Math.round(abs / MINUTE))} minutes`
}

export function formatRange(startsAt: string | null, endsAt: string | null): string | null {
  const a = parseLocal(startsAt)
  const b = parseLocal(endsAt)
  if (a === null) return null
  if (b === null || sameDay(a, b)) return formatDateYear(a)
  return `${formatShortDate(a)} – ${formatDateYear(b)}`
}

/** ISO instant (createdAt/updatedAt) → "Mar 14, 2026". These are real instants, so use the viewer's zone. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** Sort by capturedAt, oldest first, untimed last. (Don't use localeCompare: it sorts symbols before digits.) */
export function compareCaptured(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0
  if (!a) return 1
  if (!b) return -1
  return a < b ? -1 : 1
}
