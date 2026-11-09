"use client"

import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlayIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Point, PointUsage } from "@/lib/domain/schema"
import { isFuzzy, locationPrecisionLabel } from "@/lib/location"
import { formatCaptured } from "@/lib/time"
import { cn } from "@/lib/utils"
import { AttachmentList, PointMedia } from "./point-media"

const KIND_LABEL = { photo: "Photo", video: "Video", audio: "Audio", note: "Note" } as const

export function PointDetailPanel({
  point,
  usage,
  nearby,
  index,
  total,
  onSelect,
  onClose,
  onPrev,
  onNext,
  className,
}: {
  point: Point
  usage: PointUsage[]
  /** Other points stacked at the same spot on screen (including this one). */
  nearby: Point[]
  index: number
  total: number
  onSelect: (id: string) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  className?: string
}) {
  return (
    <aside
      aria-label="Point details"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <Badge variant="secondary">{KIND_LABEL[point.kind]}</Badge>
        <span className="flex-1" />
        <Button asChild variant="ghost" size="icon-sm" aria-label="Edit point">
          <Link href={`/points/${point.id}/edit`}>
            <PencilIcon />
          </Link>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
          <XIcon />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-3">
        {nearby.length > 1 && (
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">{nearby.length} points at this spot</p>
            <div className="flex flex-wrap gap-1">
              {nearby.map((p) => (
                <button
                  key={p.id}
                  title={p.title}
                  aria-label={p.title}
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    "h-8 w-11 overflow-hidden rounded-[5px] opacity-60 outline-offset-1 hover:opacity-100",
                    p.id === point.id && "opacity-100 outline-2 outline-primary",
                  )}
                >
                  <PointMedia point={p} badge={false} className="size-full" />
                </button>
              ))}
            </div>
          </div>
        )}
        <PointMedia point={point} controls className="aspect-video w-full shrink-0 rounded-md" />
        <h2 className="text-[15px] leading-tight font-semibold tracking-tight">{point.title}</h2>
        {point.description && <p className="text-[12.5px] leading-relaxed">{point.description}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-2.5 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Captured</dt>
          <dd>{formatCaptured(point.capturedAt, point.timePrecision === "approximate")}</dd>
          <dt className="text-muted-foreground">Location</dt>
          <dd>
            {point.placeName || "Unnamed place"}
            {isFuzzy(point) && (
              <span className="block text-[11px] text-muted-foreground">{locationPrecisionLabel(point)}</span>
            )}
            {/* Coordinates of an obscured point are only the shifted center; don't invite reading into them. */}
            {point.locationPrecision !== "obscured" && (
              <span className="block font-mono text-[10.5px] text-muted-foreground">
                {point.location[1].toFixed(5)}, {point.location[0].toFixed(5)}
              </span>
            )}
          </dd>
          <dt className="text-muted-foreground">Uploaded by</dt>
          <dd>{point.contributor || "Anonymous contributor"}</dd>
        </dl>
        {point.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {point.tags.map((t) => (
              <span key={t} className="rounded-full border px-2 py-px text-[11px] text-muted-foreground">
                {t}
              </span>
            ))}
          </div>
        )}
        <AttachmentList point={point} />
      </div>

      {usage.map((u) => (
        <div key={u.chapterId} className="flex shrink-0 items-center gap-2 border-t bg-muted py-1.5 pr-2 pl-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <small className="text-[10px] leading-tight font-medium text-muted-foreground">
              Part of a story{u.storyStatus === "draft" ? " (draft)" : ""}
            </small>
            <b className="truncate text-xs leading-snug font-semibold" title={u.storyTitle}>
              {u.storyTitle}
            </b>
            <span className="truncate text-[11px] leading-tight text-muted-foreground">
              Chapter {u.chapterIndex + 1}: {u.chapterTitle || "Untitled"}
            </span>
          </div>
          <Button asChild size="sm">
            <Link href={`/stories/${u.storyId}?at=${point.id}&autoplay=1`}>
              <PlayIcon className="fill-current" /> Play from here
            </Link>
          </Button>
        </div>
      ))}

      <div className="flex shrink-0 items-center justify-between border-t px-2 py-1.5 text-xs text-muted-foreground">
        <Button variant="outline" size="xs" onClick={onPrev} aria-label="Previous point">
          <ChevronLeftIcon /> Prev
        </Button>
        <span>
          {index + 1} of {total}
        </span>
        <Button variant="outline" size="xs" onClick={onNext} aria-label="Next point">
          Next <ChevronRightIcon />
        </Button>
      </div>
    </aside>
  )
}
