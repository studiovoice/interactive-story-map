"use client"

import { ChevronLeftIcon, ChevronRightIcon, MicIcon, PlayIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { MediaAsset, Point } from "@/lib/domain/schema"
import { isVisual } from "@/lib/points/media"
import { mediaUrl } from "@/lib/storage/client"
import { cn } from "@/lib/utils"
import { formatDurationSec, PointMedia } from "./point-media"

type Shown = { asset: MediaAsset; url: string }

const shown = (media: MediaAsset[], keep: (m: MediaAsset) => boolean): Shown[] =>
  media.flatMap((asset) => {
    const url = keep(asset) ? mediaUrl(asset) : null
    return url ? [{ asset, url }] : []
  })

/** Swipes shorter than this (px) are taps. */
const SWIPE = 40

/**
 * All of a point's files: images and videos in one viewer with a thumbnail strip under it,
 * then a player per audio clip. Documents are listed separately (`AttachmentList`).
 * A point without a viewable image or video shows its cover placeholder instead.
 */
export function PointMediaViewer({ point, className }: { point: Point; className?: string }) {
  const visuals = shown(point.media, isVisual)
  const audio = shown(point.media, (m) => m.kind === "audio")

  // Back to the first file when another point is shown.
  const [at, setAt] = useState({ pointId: point.id, index: 0 })
  const index = at.pointId === point.id ? Math.min(at.index, Math.max(visuals.length - 1, 0)) : 0
  const go = (i: number) => setAt({ pointId: point.id, index: (i + visuals.length) % visuals.length })
  const many = visuals.length > 1
  const current = visuals[index]

  const strip = useRef<HTMLDivElement>(null)
  useEffect(() => {
    strip.current
      ?.querySelector<HTMLElement>("[aria-current]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" })
  }, [index, point.id])

  const touchX = useRef<number | null>(null)

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {current ? (
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label={`Media for ${point.title}`}
          tabIndex={many ? 0 : undefined}
          onKeyDown={(e) => {
            if (!many) return
            if (e.key === "ArrowLeft") go(index - 1)
            else if (e.key === "ArrowRight") go(index + 1)
            else return
            e.preventDefault()
          }}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            const start = touchX.current
            touchX.current = null
            if (!many || start === null) return
            const dx = e.changedTouches[0].clientX - start
            if (Math.abs(dx) > SWIPE) go(index + (dx < 0 ? 1 : -1))
          }}
          className="group/viewer relative aspect-video w-full shrink-0 overflow-hidden rounded-md bg-black outline-offset-2"
        >
          {current.asset.kind === "video" ? (
            // key: a new element per file, so switching stops the previous video.
            <video key={current.asset.id} src={current.url} controls className="size-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs
            <img
              key={current.asset.id}
              src={current.url}
              alt={many ? `${point.title}, ${index + 1} of ${visuals.length}` : point.title}
              className="size-full object-contain"
            />
          )}
          {many && (
            <>
              <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-full bg-black/65 px-1.5 py-px text-[10.5px] font-medium text-white tabular-nums">
                {index + 1} / {visuals.length}
              </span>
              <StageButton side="left" onClick={() => go(index - 1)} label="Previous file">
                <ChevronLeftIcon className="size-4" />
              </StageButton>
              <StageButton side="right" onClick={() => go(index + 1)} label="Next file">
                <ChevronRightIcon className="size-4" />
              </StageButton>
            </>
          )}
        </div>
      ) : (
        <PointMedia point={point} className="aspect-video w-full shrink-0 rounded-md" />
      )}

      {many && (
        <div
          ref={strip}
          className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 py-0.5"
          aria-label="All photos and videos"
        >
          {visuals.map((v, i) => (
            <button
              key={v.asset.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Show ${v.asset.kind === "video" ? "video" : "photo"} ${i + 1} of ${visuals.length}`}
              aria-current={i === index || undefined}
              className={cn(
                "relative h-10 w-14 shrink-0 overflow-hidden rounded-[5px] bg-muted opacity-60 outline-offset-1 hover:opacity-100",
                i === index && "opacity-100 outline-2 outline-primary",
              )}
            >
              {v.asset.kind === "video" ? (
                <>
                  {/* #t: show a frame from just after the start instead of a blank first frame. */}
                  <video src={`${v.url}#t=0.1`} preload="metadata" muted className="size-full object-cover" />
                  <span className="absolute inset-0 m-auto grid size-4 place-items-center rounded-full bg-black/60 text-white">
                    <PlayIcon className="size-2 fill-current" />
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs
                <img src={v.url} alt="" loading="lazy" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {audio.length > 0 && (
        <ul className="flex flex-col gap-1">
          {audio.map((a, i) => {
            const duration = formatDurationSec(a.asset.durationSec)
            return (
              <li key={a.asset.id} className="flex flex-col gap-1 rounded-md border px-2 py-1.5">
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <MicIcon className="size-3 shrink-0" />
                  {audio.length > 1 ? `Audio clip ${i + 1}` : "Audio clip"}
                  {duration && ` · ${duration}`}
                </span>
                <audio src={a.url} controls preload="metadata" className="h-8 w-full" />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function StageButton({
  side,
  label,
  onClick,
  children,
}: {
  side: "left" | "right"
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // Above the middle so it doesn't cover a video's controls.
        "absolute top-[calc(50%-1.5rem)] grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-focus-within/viewer:opacity-100 group-hover/viewer:opacity-100 hover:bg-black/75 focus-visible:opacity-100 pointer-coarse:opacity-100",
        side === "left" ? "left-1.5" : "right-1.5",
      )}
    >
      {children}
    </button>
  )
}
