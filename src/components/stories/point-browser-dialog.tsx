"use client"

import { CheckIcon, PlusIcon, SearchIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { matchesQuery } from "@/components/points/explore-map"
import { PointMedia } from "@/components/points/point-media"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Point } from "@/lib/domain/schema"
import { compareCaptured, formatCaptured } from "@/lib/time"

/** Searchable list of every point; toggles membership in the active chapter. */
export function PointBrowserDialog({
  open,
  onOpenChange,
  points,
  chapterLabel,
  inActive,
  chapterOf,
  onToggle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  points: Point[]
  chapterLabel: string
  inActive: (pointId: string) => boolean
  /** Which other chapter (1-based label) of this story already has the point, if any. */
  chapterOf: (pointId: string) => string | null
  onToggle: (pointId: string) => void
}) {
  const [query, setQuery] = useState("")
  const rows = useMemo(
    () => points.filter((p) => matchesQuery(p, query)).sort((a, b) => compareCaptured(a.capturedAt, b.capturedAt)),
    [points, query],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add points to {chapterLabel}</DialogTitle>
          <DialogDescription>
            Points are shared: adding one here doesn&apos;t remove it from other stories.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 z-[1] size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title, place or tag"
            className="pl-8"
            autoFocus
          />
        </div>
        <ul className="-mx-2 min-h-0 flex-1 overflow-y-auto">
          {rows.map((p) => {
            const added = inActive(p.id)
            const elsewhere = chapterOf(p.id)
            return (
              <li key={p.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                <PointMedia point={p} badge={false} className="h-9 w-14 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {formatCaptured(p.capturedAt, p.timePrecision === "approximate")}
                    {p.placeName && ` · ${p.placeName}`}
                    {elsewhere && !added && ` · in ${elsewhere}`}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={added ? "secondary" : "outline"}
                  onClick={() => onToggle(p.id)}
                  aria-pressed={added}
                >
                  {added ? (
                    <>
                      <CheckIcon /> Added
                    </>
                  ) : (
                    <>
                      <PlusIcon /> {elsewhere ? "Move here" : "Add"}
                    </>
                  )}
                </Button>
              </li>
            )
          })}
          {!rows.length && <li className="py-8 text-center text-sm text-muted-foreground">No points match.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
