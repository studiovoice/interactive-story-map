"use client"

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClockIcon,
  EyeIcon,
  ListPlusIcon,
  MessageSquareTextIcon,
  MousePointerClickIcon,
  RouteIcon,
  SplineIcon,
  Trash2Icon,
  Undo2Icon,
  VideoIcon,
  XIcon,
} from "lucide-react"
import { useState } from "react"
import { PointMedia } from "@/components/points/point-media"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { Point } from "@/lib/domain/schema"
import { measure } from "@/lib/geo"
import { compareCaptured, formatCaptured } from "@/lib/time"
import { cn } from "@/lib/utils"
import type { EditorChapter, EditorMode } from "./editor-types"

function IconTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ChapterCard({
  chapter,
  index,
  count,
  active,
  mode,
  pointsById,
  highlightedPointId,
  onActivate,
  onChange,
  onMove,
  onDelete,
  onSetMode,
  onHighlight,
  onBrowse,
  onUseCurrentView,
  onPreviewCamera,
}: {
  chapter: EditorChapter
  index: number
  count: number
  active: boolean
  mode: EditorMode
  pointsById: Map<string, Point>
  highlightedPointId: string | null
  onActivate: () => void
  onChange: (fn: (c: EditorChapter) => EditorChapter) => void
  onMove: (delta: number) => void
  onDelete: () => void
  onSetMode: (mode: EditorMode) => void
  onHighlight: (pointId: string | null) => void
  onBrowse: () => void
  onUseCurrentView: () => void
  onPreviewCamera: () => void
}) {
  const [noteOpen, setNoteOpen] = useState<string | null>(null)
  const points = chapter.points.flatMap((cp) => {
    const point = pointsById.get(cp.pointId)
    return point ? [{ ...cp, point }] : []
  })
  const routeLength = chapter.route.length > 1 ? measure(chapter.route).total : 0
  const isPath = chapter.connection === "path"

  const movePoint = (i: number, delta: number) =>
    onChange((c) => {
      const pts = [...c.points]
      const j = i + delta
      if (j < 0 || j >= pts.length) return c
      ;[pts[i], pts[j]] = [pts[j], pts[i]]
      return { ...c, points: pts }
    })

  const sortByTime = () =>
    onChange((c) => ({
      ...c,
      points: [...c.points].sort((a, b) =>
        compareCaptured(pointsById.get(a.pointId)?.capturedAt, pointsById.get(b.pointId)?.capturedAt),
      ),
    }))

  const traceRoute = () =>
    onChange((c) => {
      const pts = c.points.map((cp) => pointsById.get(cp.pointId)).filter((p): p is Point => !!p)
      // Approximate / obscured locations would put the route in the wrong place; use exact ones when we can.
      const exact = pts.filter((p) => p.locationPrecision === "exact")
      return {
        ...c,
        route: (exact.length >= 2 ? exact : pts)
          .sort((a, b) => compareCaptured(a.capturedAt, b.capturedAt))
          .map((p) => p.location),
      }
    })

  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border bg-card transition-shadow",
        active ? "shadow-sm ring-2 ring-primary/70" : "hover:bg-muted/40",
      )}
    >
      <button onClick={onActivate} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={active}>
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
            active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{chapter.title || `Chapter ${index + 1}`}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isPath ? <RouteIcon className="size-3" /> : <ClockIcon className="size-3" />}
            {isPath ? "Path" : "Timeline"} · {points.length} {points.length === 1 ? "point" : "points"}
          </span>
        </span>
        {active ? (
          <ChevronUpIcon className="size-4 text-muted-foreground" />
        ) : (
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        )}
      </button>

      {active && (
        <div className="flex flex-col gap-4 border-t p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`t-${chapter.id}`}>Title</Label>
            <Input
              id={`t-${chapter.id}`}
              value={chapter.title}
              onChange={(e) => onChange((c) => ({ ...c, title: e.target.value }))}
              placeholder={`Chapter ${index + 1}`}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`n-${chapter.id}`}>Narrative</Label>
            <Textarea
              id={`n-${chapter.id}`}
              value={chapter.narrative}
              onChange={(e) => onChange((c) => ({ ...c, narrative: e.target.value }))}
              rows={3}
              placeholder="What happens in this part of the story?"
            />
          </div>

          {/* Connection */}
          <div className="flex flex-col gap-1.5">
            <Label>How points connect</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              value={chapter.connection}
              onValueChange={(v) => {
                if (!v) return
                onChange((c) => ({ ...c, connection: v as EditorChapter["connection"] }))
                if (v === "timeline" && mode === "route") onSetMode("select")
              }}
              className="w-full"
            >
              <ToggleGroupItem value="timeline" className="flex-1">
                <ClockIcon /> Timeline
              </ToggleGroupItem>
              <ToggleGroupItem value="path" className="flex-1">
                <RouteIcon /> Path
              </ToggleGroupItem>
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">
              {isPath
                ? "A drawn route the story follows, like a march. It's revealed as the chapter plays."
                : "Points appear in time order, with no line between them."}
            </p>
          </div>

          {isPath && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">Route</span>
                <span className="text-muted-foreground tabular-nums">
                  {chapter.route.length
                    ? `${chapter.route.length} vertices · ${routeLength >= 1000 ? (routeLength / 1000).toFixed(2) + " km" : Math.round(routeLength) + " m"}`
                    : "Not drawn yet"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant={mode === "route" ? "default" : "outline"}
                  onClick={() => onSetMode(mode === "route" ? "select" : "route")}
                >
                  <SplineIcon /> {mode === "route" ? "Done drawing" : "Draw on map"}
                </Button>
                <IconTip label="Connect this chapter's points in time order">
                  <Button size="sm" variant="outline" onClick={traceRoute} disabled={points.length < 2}>
                    <RouteIcon /> Trace points
                  </Button>
                </IconTip>
                <IconTip label="Remove last vertex">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Undo last vertex"
                    disabled={!chapter.route.length}
                    onClick={() => onChange((c) => ({ ...c, route: c.route.slice(0, -1) }))}
                  >
                    <Undo2Icon />
                  </Button>
                </IconTip>
                <IconTip label="Clear route">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label="Clear route"
                    disabled={!chapter.route.length}
                    onClick={() => onChange((c) => ({ ...c, route: [] }))}
                  >
                    <XIcon />
                  </Button>
                </IconTip>
              </div>
            </div>
          )}

          {/* Camera */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-auto text-xs text-muted-foreground">
              Camera: {chapter.camera ? "custom view" : "fit to points"}
            </span>
            <Button size="xs" variant="outline" onClick={onUseCurrentView}>
              Use current view
            </Button>
            {chapter.camera && (
              <>
                <IconTip label="Fly to the saved view">
                  <Button size="icon-xs" variant="outline" aria-label="Preview camera" onClick={onPreviewCamera}>
                    <EyeIcon />
                  </Button>
                </IconTip>
                <Button size="xs" variant="ghost" onClick={() => onChange((c) => ({ ...c, camera: null }))}>
                  Reset
                </Button>
              </>
            )}
          </div>

          {/* Points */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <Label className="mr-auto">Points</Label>
              <Button size="xs" variant="ghost" onClick={sortByTime} disabled={points.length < 2}>
                <ClockIcon /> Sort by time
              </Button>
            </div>
            {points.length === 0 && (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                No points yet. Click points on the map, or browse the list.
              </p>
            )}
            <ol className="flex flex-col gap-1">
              {points.map((cp, i) => (
                <li
                  key={cp.pointId}
                  onMouseEnter={() => onHighlight(cp.pointId)}
                  onMouseLeave={() => onHighlight(null)}
                  className={cn(
                    "group rounded-lg border p-1.5",
                    highlightedPointId === cp.pointId && "border-primary bg-muted/60",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 text-center text-[11px] font-semibold text-muted-foreground tabular-nums">
                      {i + 1}
                    </span>
                    <PointMedia point={cp.point} badge={false} className="h-8 w-11 shrink-0 rounded-[5px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 truncate text-xs font-medium">
                        {cp.point.kind === "video" && <VideoIcon className="size-3 shrink-0 text-muted-foreground" />}
                        <span className="truncate">{cp.point.title}</span>
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {formatCaptured(cp.point.capturedAt, cp.point.timePrecision === "approximate")}
                      </div>
                    </div>
                    <div className="flex opacity-60 group-hover:opacity-100">
                      <IconTip label={cp.note ? "Edit note" : "Add a note"}>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          aria-label="Note"
                          className={cn(cp.note && "text-primary")}
                          onClick={() => setNoteOpen(noteOpen === cp.pointId ? null : cp.pointId)}
                        >
                          <MessageSquareTextIcon />
                        </Button>
                      </IconTip>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => movePoint(i, -1)}
                      >
                        <ArrowUpIcon />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Move down"
                        disabled={i === points.length - 1}
                        onClick={() => movePoint(i, 1)}
                      >
                        <ArrowDownIcon />
                      </Button>
                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label="Remove from chapter"
                        onClick={() =>
                          onChange((c) => ({ ...c, points: c.points.filter((x) => x.pointId !== cp.pointId) }))
                        }
                      >
                        <XIcon />
                      </Button>
                    </div>
                  </div>
                  {(noteOpen === cp.pointId || cp.note) && (
                    <Input
                      value={cp.note}
                      onChange={(e) =>
                        onChange((c) => ({
                          ...c,
                          points: c.points.map((x) => (x.pointId === cp.pointId ? { ...x, note: e.target.value } : x)),
                        }))
                      }
                      autoFocus={noteOpen === cp.pointId && !cp.note}
                      placeholder="Note shown with this point, e.g. “Meanwhile, two blocks west…”"
                      className="mt-1.5 h-7 text-xs"
                    />
                  )}
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant={mode === "add" ? "default" : "outline"}
                onClick={() => onSetMode(mode === "add" ? "select" : "add")}
              >
                <MousePointerClickIcon /> {mode === "add" ? "Done adding" : "Add from map"}
              </Button>
              <Button size="sm" variant="outline" onClick={onBrowse}>
                <ListPlusIcon /> Browse points
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-1 border-t pt-3">
            <Button size="xs" variant="ghost" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUpIcon /> Move up
            </Button>
            <Button size="xs" variant="ghost" disabled={index === count - 1} onClick={() => onMove(1)}>
              <ArrowDownIcon /> Move down
            </Button>
            <span className="flex-1" />
            <Button size="xs" variant="destructive" onClick={onDelete}>
              <Trash2Icon /> Delete chapter
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
