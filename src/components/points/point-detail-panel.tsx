"use client"

import { ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlayIcon, XIcon } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { MapPoint, Point, PointDetail } from "@/lib/domain/schema"
import { isFuzzy, locationPrecisionLabel } from "@/lib/location"
import { formatCaptured } from "@/lib/time"
import { cn } from "@/lib/utils"
import { AttachmentList, PointMedia } from "./point-media"

const KIND_LABEL = { photo: "Photo", video: "Video", audio: "Audio", note: "Note" } as const

export function PointDetailPanel({
  summary,
  detail,
  loading,
  error,
  onRetry,
  nearby,
  index,
  total,
  onSelect,
  onClose,
  onPrev,
  onNext,
  className,
}: {
  /** What the map already knows; shown while the details load. */
  summary: MapPoint
  detail: PointDetail | null
  loading: boolean
  error: boolean
  onRetry: () => void
  /** Other points stacked at the same spot on screen (including this one). */
  nearby: MapPoint[]
  index: number
  total: number
  onSelect: (id: string) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  className?: string
}) {
  const point = detail?.point
  const usage = detail?.usage ?? []
  return (
    <aside
      aria-label="Point details"
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1 border-b py-1.5 pr-1.5 pl-3">
        <Badge variant="secondary">{KIND_LABEL[summary.kind]}</Badge>
        <span className="flex-1" />
        <Button asChild variant="ghost" size="icon-sm" aria-label="Edit point">
          <Link href={`/points/${summary.id}/edit`}>
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
                  aria-current={p.id === summary.id || undefined}
                  onClick={() => onSelect(p.id)}
                  className={cn(
                    "max-w-36 truncate rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground",
                    p.id === summary.id &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )}
                >
                  {p.title}
                </button>
              ))}
            </div>
          </div>
        )}
        {point ? (
          <PointBody point={point} />
        ) : (
          <>
            <Skeleton className="aspect-video w-full shrink-0 rounded-md" />
            <h2 className="text-[15px] leading-tight font-semibold tracking-tight">{summary.title}</h2>
            {loading && (
              <div className="flex flex-col gap-1.5" aria-label="Loading details">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            )}
            {error && (
              <p className="text-xs text-muted-foreground">
                Couldn&apos;t load this point.{" "}
                <button className="underline underline-offset-2" onClick={onRetry}>
                  Try again
                </button>
              </p>
            )}
            {!loading && !error && <p className="text-xs text-muted-foreground">This point no longer exists.</p>}
          </>
        )}
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
            <Link href={`/stories/${u.storyId}?at=${summary.id}&autoplay=1`}>
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

function PointBody({ point }: { point: Point }) {
  return (
    <>
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
    </>
  )
}
