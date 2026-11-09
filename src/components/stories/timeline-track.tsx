"use client"

import { useRef, useState } from "react"
import { type Timeline, chapterIndexAt, gapAt, timeAt } from "@/lib/story/timeline"
import { formatTime } from "@/lib/time"
import { cn } from "@/lib/utils"

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

/**
 * The scrubbable timeline under the map: chapter bars (with fill), compressed gaps,
 * one tick per point, hour labels and the playhead.
 */
export function TimelineTrack({
  timeline,
  p,
  onScrub,
  onScrubStart,
  onScrubEnd,
  onJumpToItem,
}: {
  timeline: Timeline
  p: number
  onScrub: (p: number) => void
  onScrubStart: () => void
  onScrubEnd: (jumped: boolean) => void
  onJumpToItem: (index: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [hover, setHover] = useState<number | null>(null)
  const ci = chapterIndexAt(timeline, p)
  const t = timeAt(timeline, p)

  const pAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect()
    return clamp((clientX - r.left) / r.width)
  }

  const tip = (() => {
    if (hover === null) return null
    let near = -1
    let best = 0.013
    timeline.items.forEach((it, i) => {
      const d = Math.abs(it.pos - hover)
      if (d < best) {
        best = d
        near = i
      }
    })
    if (near >= 0) {
      const it = timeline.items[near]
      return (
        <>
          <b className="font-semibold tabular-nums">
            {it.time === null ? "Time unknown" : it.approx ? "≈ " + formatTime(it.time) : formatTime(it.time)}
          </b>{" "}
          · {it.point.title}
        </>
      )
    }
    const gap = gapAt(timeline, hover)
    if (gap)
      return (
        <>
          <b className="font-semibold">{gap.label}</b>, skipped
        </>
      )
    const ht = timeAt(timeline, hover)
    return ht === null ? null : <b className="font-semibold tabular-nums">{formatTime(ht)}</b>
  })()

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="Story time"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-valuetext={`${t === null ? "" : formatTime(t) + ", "}${timeline.chapters[ci]?.chapter.title ?? ""}`}
      className="relative mx-2 h-[74px] cursor-pointer touch-none select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
      onPointerDown={(e) => {
        dragging.current = true
        trackRef.current!.setPointerCapture(e.pointerId)
        onScrubStart()
        onScrub(pAt(e.clientX))
      }}
      onPointerMove={(e) => {
        const q = pAt(e.clientX)
        setHover(q)
        if (dragging.current) onScrub(q)
      }}
      onPointerUp={(e) => {
        dragging.current = false
        const tick = (e.target as HTMLElement).closest<HTMLElement>("[data-item]")
        if (tick) onJumpToItem(Number(tick.dataset.item))
        onScrubEnd(!!tick)
      }}
      onPointerLeave={() => setHover(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          onScrub(clamp(p + 0.01))
          e.preventDefault()
        }
        if (e.key === "ArrowLeft") {
          onScrub(clamp(p - 0.01))
          e.preventDefault()
        }
      }}
    >
      {/* Chapter bars */}
      {timeline.chapters.map((ch, i) => {
        const fill = clamp((p - ch.p0) / (ch.p1 - ch.p0 || 1))
        return (
          <div
            key={ch.chapter.id}
            className="absolute top-0 h-[26px] pr-[3px]"
            style={{ left: `${ch.p0 * 100}%`, width: `${(ch.p1 - ch.p0) * 100}%` }}
          >
            <span
              className={cn(
                "block h-[17px] truncate text-[11.5px] font-medium text-muted-foreground",
                i === ci && "font-semibold text-foreground",
              )}
            >
              <span className="sm:hidden">{i + 1}</span>
              <span className="hidden sm:inline">{ch.chapter.title || `Chapter ${i + 1}`}</span>
            </span>
            <i className="absolute top-[18px] right-[3px] left-0 h-1.5 overflow-hidden rounded-[3px] bg-muted">
              <i className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${fill * 100}%` }} />
            </i>
          </div>
        )
      })}

      {/* Compressed gaps */}
      {timeline.gaps.map((g) => (
        <div
          key={g.p0}
          className="absolute top-[18px] h-1.5 rounded-[3px] bg-[repeating-linear-gradient(115deg,var(--border)_0_2px,transparent_2px_4px)]"
          style={{ left: `${g.p0 * 100}%`, width: `${(g.p1 - g.p0) * 100}%` }}
        />
      ))}

      {/* Point ticks */}
      {timeline.items.map((it) => {
        const done = p >= it.pos
        const video = it.point.kind === "video"
        return (
          <button
            key={it.index}
            data-item={it.index}
            className="group absolute top-8 -ml-[7px] grid h-4 w-3.5 place-items-center"
            style={{ left: `${it.pos * 100}%` }}
            aria-label={`${it.time === null ? "" : (it.approx ? "About " : "") + formatTime(it.time) + ": "}${it.point.title}`}
          >
            <i
              className={cn(
                "block transition-transform group-hover:scale-135",
                video ? "h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent" : "size-2 rounded-full",
                video ? (done ? "border-l-primary" : "border-l-border") : done ? "bg-primary" : "bg-border",
                it.approx && !video && "border-[1.5px] border-dashed bg-transparent",
                it.approx && !video && (done ? "border-primary" : "border-muted-foreground"),
              )}
            />
          </button>
        )
      })}

      {/* Hour labels */}
      {timeline.ticks.map((tk, i) => (
        <div
          key={i}
          className="absolute top-[58px] -translate-x-1/2 text-[10.5px] whitespace-nowrap text-muted-foreground tabular-nums first:translate-x-0"
          style={{ left: `${tk.pos * 100}%` }}
        >
          {tk.label}
        </div>
      ))}

      {/* Playhead */}
      <div
        className="pointer-events-none absolute top-[13px] bottom-[18px] -ml-px w-0.5 rounded-[1px] bg-foreground before:absolute before:-top-px before:-left-[5px] before:size-3 before:rounded-full before:border-2 before:border-background before:bg-foreground"
        style={{ left: `${p * 100}%` }}
      />

      {tip && hover !== null && (
        <div
          className="pointer-events-none absolute bottom-[calc(100%+4px)] z-10 w-max max-w-56 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-[11.5px] leading-snug text-popover-foreground shadow-md"
          style={{ left: `clamp(7rem, ${hover * 100}%, calc(100% - 7rem))` }}
        >
          {tip}
        </div>
      )}
    </div>
  )
}
