/**
 * Turns a story (chapters → points) into a playback timeline.
 *
 * The track runs from progress p = 0 to 1. Each chapter gets a span of it, sized by
 * how long the chapter lasted (with a minimum so short chapters stay clickable).
 * Long quiet stretches between chapters are squeezed into a small hatched "gap".
 * Chapters are laid out in the editor's order, so a later chapter may start earlier
 * in real time ("Meanwhile…"): the clock simply jumps back.
 *
 * Pure and framework-free, so it can be unit tested and reused (e.g. for exports).
 */
import type { ChapterWithPoints, LngLat, Point, StoryDetail } from "@/lib/domain/schema"
import { measure, projectOntoLine, sliceLine, type MeasuredLine } from "@/lib/geo"
import { DAY, HOUR, MINUTE, formatDuration, formatHour, formatShortDate, parseLocal, sameDay } from "@/lib/time"

/** Quiet stretches longer than this between chapters get compressed. */
const LONG_GAP = 45 * MINUTE
/** Width of a compressed gap on the track. */
const GAP_WIDTH = 0.04

export type TimelineItem = {
  /** Index in `timeline.items` (playback order). */
  index: number
  chapterIndex: number
  point: Point
  note: string
  pos: number
  /** Real time (ms, see time.ts) or an interpolated guess when the point has no time. */
  time: number | null
  /** True when the time is approximate or was interpolated. */
  approx: boolean
}

export type TimelineChapter = {
  index: number
  chapter: ChapterWithPoints
  p0: number
  p1: number
  /** Real-time window of the chapter, null if none of its points have a time. */
  t0: number | null
  t1: number | null
  items: TimelineItem[]
  /** Path chapters only. */
  route: MeasuredLine | null
  /** (pos, route fraction) pairs the march "front" moves through. */
  routeAnchors: [number, number][]
}

export type TimelineGap = { p0: number; p1: number; t0: number; t1: number; label: string }

export type TimelineTick = { pos: number; label: string }

export type Timeline = {
  chapters: TimelineChapter[]
  gaps: TimelineGap[]
  items: TimelineItem[]
  ticks: TimelineTick[]
  multiDay: boolean
  startsAt: number | null
  endsAt: number | null
  isEmpty: boolean
}

type Draft = {
  chapter: ChapterWithPoints
  entries: { point: Point; note: string; time: number | null; approx: boolean; order: number }[]
  tmin: number | null
  tmax: number | null
  T0: number | null
  T1: number | null
}

/** Fill in missing times by interpolating between timed neighbours (in editor order). */
function fillTimes(times: (number | null)[]): { time: number | null; guessed: boolean }[] {
  const known = times.map((t, i) => [t, i] as const).filter(([t]) => t !== null) as [number, number][]
  return times.map((t, i) => {
    if (t !== null) return { time: t, guessed: false }
    if (!known.length) return { time: null, guessed: true }
    const before = [...known].reverse().find(([, j]) => j < i)
    const after = known.find(([, j]) => j > i)
    if (before && after) {
      const s = (i - before[1]) / (after[1] - before[1])
      return { time: before[0] + (after[0] - before[0]) * s, guessed: true }
    }
    return { time: (before ?? after)![0], guessed: true }
  })
}

export function buildTimeline(story: Pick<StoryDetail, "chapters">): Timeline {
  const drafts: Draft[] = story.chapters.map((chapter) => {
    const raw = chapter.points.map((cp) => parseLocal(cp.point.capturedAt))
    const filled = fillTimes(raw)
    const entries = chapter.points
      .map((cp, order) => ({
        point: cp.point,
        note: cp.note,
        time: filled[order].time,
        approx: filled[order].guessed || cp.point.timePrecision === "approximate",
        order,
      }))
      // Playback order is chronological; untimed chapters keep the editor order.
      .sort((a, b) => (a.time ?? a.order) - (b.time ?? b.order) || a.order - b.order)
    const times = entries.map((e) => e.time).filter((t): t is number => t !== null)
    const tmin = times.length ? Math.min(...times) : null
    const tmax = times.length ? Math.max(...times) : null
    let T0: number | null = null
    let T1: number | null = null
    if (tmin !== null && tmax !== null) {
      const dur = tmax - tmin
      // Small lead-in, longer lead-out so the last point stays on screen for a bit.
      T0 = tmin - Math.max(dur * 0.05, 5 * MINUTE)
      T1 = tmax + Math.max(dur * 0.15, 10 * MINUTE)
    }
    return { chapter, entries, tmin, tmax, T0, T1 }
  })

  // Close short gaps so the clock keeps running from one chapter into the next.
  const isLongGap: boolean[] = []
  for (let i = 0; i < drafts.length - 1; i++) {
    const a = drafts[i],
      b = drafts[i + 1]
    let long = false
    if (a.T1 !== null && b.T0 !== null) {
      const g = b.T0 - a.T1
      if (g > LONG_GAP) long = true
      else if (g > 0) a.T1 = b.T0
    }
    isLongGap.push(long)
  }

  const timed = drafts.filter((d) => d.T0 !== null)
  const startsAt = timed.length ? Math.min(...timed.map((d) => d.tmin!)) : null
  const endsAt = timed.length ? Math.max(...timed.map((d) => d.tmax!)) : null
  const totalTimed = timed.reduce((s, d) => s + (d.T1! - d.T0!), 0)
  const minWeight = Math.max(totalTimed * 0.08, 15 * MINUTE)
  const weights = drafts.map((d) =>
    d.T0 !== null ? Math.max(d.T1! - d.T0, minWeight) : totalTimed ? minWeight : Math.max(1, d.entries.length),
  )
  const gapCount = isLongGap.filter(Boolean).length
  const chapterSpace = Math.max(0.2, 1 - gapCount * GAP_WIDTH)
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1

  const chapters: TimelineChapter[] = []
  const gaps: TimelineGap[] = []
  const items: TimelineItem[] = []
  let p = 0
  drafts.forEach((d, ci) => {
    const p0 = p
    const p1 = p0 + (weights[ci] / totalWeight) * chapterSpace
    const span = p1 - p0
    const n = d.entries.length
    const chapterItems = d.entries.map((e, k): TimelineItem => {
      let pos: number
      if (d.T0 !== null && e.time !== null && d.T1! > d.T0) pos = p0 + ((e.time - d.T0) / (d.T1! - d.T0)) * span
      else pos = p0 + span * (n === 1 ? 0.2 : 0.08 + (0.72 * k) / (n - 1))
      return {
        index: items.length + k,
        chapterIndex: ci,
        point: e.point,
        note: e.note,
        pos,
        time: e.time,
        approx: e.approx,
      }
    })
    items.push(...chapterItems)

    let route: MeasuredLine | null = null
    let routeAnchors: [number, number][] = []
    if (d.chapter.connection === "path" && d.chapter.route.length >= 2) {
      route = measure(d.chapter.route)
      let f = 0
      routeAnchors = [[p0, 0]]
      for (const it of chapterItems) {
        // Approximate / obscured locations would pull the front to the wrong place; skip them.
        if (it.point.locationPrecision !== "exact") continue
        f = Math.max(f, projectOntoLine(route, it.point.location))
        routeAnchors.push([it.pos, f])
      }
      routeAnchors.push([p1, 1])
    }

    chapters.push({
      index: ci,
      chapter: d.chapter,
      p0,
      p1,
      t0: d.T0,
      t1: d.T1,
      items: chapterItems,
      route,
      routeAnchors,
    })
    p = p1

    if (isLongGap[ci]) {
      const next = drafts[ci + 1]
      const g = { p0: p, p1: p + GAP_WIDTH, t0: d.T1!, t1: next.T0! }
      gaps.push({ ...g, label: `${formatDuration(g.t1 - g.t0)} with no uploads` })
      p += GAP_WIDTH
    }
  })

  const multiDay = startsAt !== null && endsAt !== null && !sameDay(startsAt, endsAt)
  return {
    chapters,
    gaps,
    items,
    ticks: buildTicks(chapters, totalTimed, multiDay),
    multiDay,
    startsAt,
    endsAt,
    isEmpty: items.length === 0,
  }
}

function buildTicks(chapters: TimelineChapter[], totalTimed: number, multiDay: boolean): TimelineTick[] {
  if (!totalTimed) return []
  const steps = [15 * MINUTE, 30 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY]
  const step = steps.find((s) => totalTimed / s <= 7) ?? 7 * DAY
  const ticks: TimelineTick[] = []
  for (const c of chapters) {
    if (c.t0 === null || c.t1 === null || c.t1 <= c.t0) continue
    for (let t = Math.ceil(c.t0 / step) * step; t <= c.t1; t += step) {
      const pos = c.p0 + ((t - c.t0) / (c.t1 - c.t0)) * (c.p1 - c.p0)
      if (ticks.length && pos - ticks.at(-1)!.pos < 0.07) continue
      const label = step >= DAY ? formatShortDate(t) : multiDay && t % DAY === 0 ? formatShortDate(t) : formatHour(t)
      ticks.push({ pos, label })
    }
  }
  return ticks
}

/* ───────────── queries against a built timeline ───────────── */

export function chapterIndexAt(tl: Timeline, p: number): number {
  let c = 0
  tl.chapters.forEach((ch, i) => {
    if (p >= ch.p0) c = i
  })
  return c
}

export function gapAt(tl: Timeline, p: number): TimelineGap | null {
  return tl.gaps.find((g) => p > g.p0 && p < g.p1) ?? null
}

/** The current item: the last one passed in the current chapter, or the chapter's first. */
export function activeItemAt(tl: Timeline, p: number): TimelineItem | null {
  const ch = tl.chapters[chapterIndexAt(tl, p)]
  if (!ch || !ch.items.length) return null
  let active = ch.items[0]
  for (const it of ch.items) if (p >= it.pos) active = it
  return active
}

/** Wall-clock time at progress p, or null when the chapter has no times. */
export function timeAt(tl: Timeline, p: number): number | null {
  const gap = gapAt(tl, p)
  if (gap) return gap.t0 + ((p - gap.p0) / (gap.p1 - gap.p0)) * (gap.t1 - gap.t0)
  const ch = tl.chapters[chapterIndexAt(tl, p)]
  if (!ch || ch.t0 === null || ch.t1 === null) return null
  const s = Math.min(1, Math.max(0, (p - ch.p0) / (ch.p1 - ch.p0 || 1)))
  return ch.t0 + s * (ch.t1 - ch.t0)
}

/** How far (0..1) a chapter's route is drawn at progress p. */
export function routeFractionAt(ch: TimelineChapter, p: number): number {
  const a = ch.routeAnchors
  if (!a.length) return 0
  if (p <= a[0][0]) return 0
  for (let i = 1; i < a.length; i++) {
    if (p <= a[i][0]) {
      const [x0, y0] = a[i - 1],
        [x1, y1] = a[i]
      return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0 || 1)
    }
  }
  return 1
}

/** Route geometry to draw at progress p: finished chapters in full, the current one partially. */
export function routesAt(
  tl: Timeline,
  p: number,
): { done: LngLat[][]; current: LngLat[] | null; front: LngLat | null } {
  const ci = chapterIndexAt(tl, p)
  const done: LngLat[][] = []
  let current: LngLat[] | null = null
  let front: LngLat | null = null
  tl.chapters.forEach((ch, i) => {
    if (!ch.route) return
    if (i < ci) done.push(ch.route.coords)
    else if (i === ci) {
      const f = routeFractionAt(ch, p)
      if (f > 0) {
        current = sliceLine(ch.route, Math.max(f, 0.0005))
        front = current.at(-1) ?? null
      }
    }
  })
  return { done, current, front }
}

export const posOfPoint = (tl: Timeline, pointId: string) => tl.items.find((it) => it.point.id === pointId)?.pos ?? null
