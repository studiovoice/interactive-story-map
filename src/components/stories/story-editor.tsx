"use client"

import type { Map as MlMap, MapMouseEvent } from "maplibre-gl"
import { ExternalLinkIcon, MoreHorizontalIcon, PlayIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { ConfirmDelete } from "@/components/confirm-delete"
import { chapterCamera, currentCamera } from "@/components/map/camera"
import { AreaLayer } from "@/components/map/area-layer"
import { MapLayer } from "@/components/map/map-layer"
import { MapView } from "@/components/map/map-view"
import { PointsLayer } from "@/components/map/points-layer"
import { useThemeColors } from "@/components/map/use-theme-colors"
import { PointMedia } from "@/components/points/point-media"
import { flyToPlace, GEOCODER_CREDIT, placesGroup } from "@/components/search/place-items"
import { SearchCombobox } from "@/components/search/search-combobox"
import { usePlaceSearch } from "@/components/search/use-place-search"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { deleteStory, saveStory } from "@/lib/actions"
import type { LngLat, Point, StoryDetail, StoryStatus } from "@/lib/domain/schema"
import { boundsOf } from "@/lib/geo"
import { formatCaptured } from "@/lib/time"
import { isFuzzy } from "@/lib/location"
import { cn } from "@/lib/utils"
import { ChapterCard } from "./chapter-card"
import {
  newChapterId,
  stateFromStory,
  toDrafts,
  type EditorChapter,
  type EditorMode,
  type EditorState,
} from "./editor-types"
import { PointBrowserDialog } from "./point-browser-dialog"

export function StoryEditor({ story, points }: { story: StoryDetail; points: Point[] }) {
  const router = useRouter()
  const colors = useThemeColors()
  const mapRef = useRef<MlMap | null>(null)
  const [saving, startSave] = useTransition()

  const [baseline, setBaseline] = useState<EditorState>(() => stateFromStory(story))
  const [state, setState] = useState<EditorState>(baseline)
  const [activeId, setActiveId] = useState<string | null>(state.chapters[0]?.id ?? null)
  const [mode, setMode] = useState<EditorMode>("select")
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [highlightedPointId, setHighlightedPointId] = useState<string | null>(null)
  const [browsing, setBrowsing] = useState(false)
  const [deletingChapter, setDeletingChapter] = useState<string | null>(null)
  const [deletingStory, setDeletingStory] = useState(false)
  // Map instance as state too, for handlers built during render (the search box).
  const [map, setMap] = useState<MlMap | null>(null)
  const [placeQuery, setPlaceQuery] = useState("")
  const placeSearch = usePlaceSearch(placeQuery, () => {
    const c = map?.getCenter().wrap()
    return c ? { lng: c.lng, lat: c.lat } : null
  })

  const dirty = useMemo(() => JSON.stringify(state) !== JSON.stringify(baseline), [state, baseline])
  const pointsById = useMemo(() => new Map(points.map((p) => [p.id, p])), [points])
  const { chapters, meta } = state
  const activeIndex = chapters.findIndex((c) => c.id === activeId)
  const active = activeIndex >= 0 ? chapters[activeIndex] : null

  /** pointId → chapter index, for this story. */
  const chapterOfPoint = useMemo(() => {
    const m = new Map<string, number>()
    chapters.forEach((c, i) => c.points.forEach((p) => m.set(p.pointId, i)))
    return m
  }, [chapters])

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [dirty])

  // Esc leaves add/draw mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("select")
        setSelectedPointId(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  /* ───────────── state helpers ───────────── */

  const setChapters = (fn: (cs: EditorChapter[]) => EditorChapter[]) =>
    setState((s) => ({ ...s, chapters: fn(s.chapters) }))
  const updateChapter = (id: string, fn: (c: EditorChapter) => EditorChapter) =>
    setChapters((cs) => cs.map((c) => (c.id === id ? fn(c) : c)))

  /** Put a point in the active chapter (a point lives in at most one chapter per story). */
  function addToActive(pointId: string) {
    if (!active) return toast.error("Add a chapter first")
    setChapters((cs) =>
      cs.map((c) => {
        const without = c.points.filter((p) => p.pointId !== pointId)
        if (c.id !== active.id) return without.length === c.points.length ? c : { ...c, points: without }
        const existing = c.points.find((p) => p.pointId === pointId)
        return existing ? c : { ...c, points: [...c.points, { pointId, note: "" }] }
      }),
    )
  }
  function removeFromStory(pointId: string) {
    setChapters((cs) => cs.map((c) => ({ ...c, points: c.points.filter((p) => p.pointId !== pointId) })))
  }
  function toggleInActive(pointId: string) {
    if (active?.points.some((p) => p.pointId === pointId)) removeFromStory(pointId)
    else addToActive(pointId)
  }

  function addChapter() {
    const id = newChapterId()
    const at = activeIndex >= 0 ? activeIndex + 1 : chapters.length
    setChapters((cs) => [
      ...cs.slice(0, at),
      { id, title: "", narrative: "", connection: "timeline", route: [], camera: null, points: [] },
      ...cs.slice(at),
    ])
    setActiveId(id)
    setMode("select")
  }
  function moveChapter(id: string, delta: number) {
    setChapters((cs) => {
      const i = cs.findIndex((c) => c.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= cs.length) return cs
      const next = [...cs]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function deleteChapter(id: string) {
    const i = chapters.findIndex((c) => c.id === id)
    setChapters((cs) => cs.filter((c) => c.id !== id))
    if (activeId === id) setActiveId(chapters[i + 1]?.id ?? chapters[i - 1]?.id ?? null)
    setMode("select")
  }

  function activate(id: string) {
    if (id === activeId) {
      setActiveId(null)
      setMode("select")
      return
    }
    setActiveId(id)
    setMode("select")
    const c = chapters.find((x) => x.id === id)
    const map = mapRef.current
    if (!c || !map) return
    const cam = chapterCamera(map, {
      ...c,
      points: c.points.flatMap((p) => {
        const point = pointsById.get(p.pointId)
        return point ? [{ point }] : []
      }),
    })
    if (cam) map.flyTo({ ...cam, duration: 900 })
  }

  /* ───────────── save ───────────── */

  function save(then?: () => void) {
    startSave(async () => {
      const res = await saveStory(story.id, { story: state.meta, chapters: toDrafts(state.chapters) })
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const next = stateFromStory(res.data)
      setBaseline(next)
      setState(next)
      toast.success("Story saved")
      then?.()
    })
  }

  // ⌘S / Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (dirty && !saving) save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  /* ───────────── map ───────────── */

  const [initialView] = useState(() => {
    const storyCoords = story.chapters.flatMap((c) => c.points.map((p) => p.point.location))
    const b = boundsOf(storyCoords.length ? storyCoords : points.map((p) => p.location))
    return b ? { bounds: b, padding: 80 } : { center: [-73.9985, 40.7052] as LngLat, zoom: 12 }
  })

  function onMapClick(e: MapMouseEvent) {
    if (mode === "route" && active) {
      const v: LngLat = [+e.lngLat.lng.toFixed(6), +e.lngLat.lat.toFixed(6)]
      updateChapter(active.id, (c) => ({ ...c, route: [...c.route, v] }))
      return
    }
    setSelectedPointId(null)
  }

  function onMarkerClick(p: Point) {
    if (mode === "route" && active) {
      // Snap the route to the point, unless its location is only approximate.
      if (isFuzzy(p)) {
        toast("This point's location is approximate, so the route doesn't snap to it. Click the map instead.")
        return
      }
      updateChapter(active.id, (c) => ({ ...c, route: [...c.route, p.location] }))
      return
    }
    if (mode === "add") {
      toggleInActive(p.id)
      return
    }
    setSelectedPointId(p.id === selectedPointId ? null : p.id)
  }

  const routeData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: chapters
        .filter((c) => c.connection === "path" && c.route.length > 1)
        .map((c) => ({
          type: "Feature" as const,
          properties: { active: c.id === activeId },
          geometry: { type: "LineString" as const, coordinates: c.route },
        })),
    }),
    [chapters, activeId],
  )
  const vertexData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features:
        mode === "route" && active
          ? active.route.map((coordinates, i) => ({
              type: "Feature" as const,
              properties: { last: i === active.route.length - 1 },
              geometry: { type: "Point" as const, coordinates },
            }))
          : [],
    }),
    [mode, active],
  )

  const selected = selectedPointId ? (pointsById.get(selectedPointId) ?? null) : null
  const selectedChapter = selected ? chapterOfPoint.get(selected.id) : undefined
  const chapterLabel = (i: number) => `Chapter ${i + 1}${chapters[i]?.title ? `: ${chapters[i].title}` : ""}`

  return (
    <div className="flex flex-col md:grid md:h-[calc(100dvh-3.5rem)] md:grid-cols-[minmax(340px,420px)_1fr]">
      {/* ───────────── left panel ───────────── */}
      <div className="order-2 flex min-h-0 min-w-0 flex-col border-r md:order-1">
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 border-b bg-background/95 px-3 py-2 backdrop-blur md:static">
          <Breadcrumb className="min-w-0 flex-1">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbLink asChild className="truncate">
                  <Link href={`/collections/${story.collection.id}`}>{story.collection.title}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{meta.title || "Untitled story"}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button size="sm" onClick={() => save()} disabled={!dirty || saving}>
            <SaveIcon /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={() =>
              dirty ? save(() => router.push(`/stories/${story.id}`)) : router.push(`/stories/${story.id}`)
            }
          >
            <PlayIcon className="fill-current" /> {dirty ? "Save & play" : "Play"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More story actions">
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setDeletingStory(true)}>
                <Trash2Icon /> Delete story
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3">
          {/* Story details */}
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-title">Story title</Label>
              <Input
                id="story-title"
                value={meta.title}
                onChange={(e) => setState((s) => ({ ...s, meta: { ...s.meta, title: e.target.value } }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="story-summary">Summary</Label>
              <Textarea
                id="story-summary"
                rows={2}
                value={meta.summary}
                onChange={(e) => setState((s) => ({ ...s, meta: { ...s.meta, summary: e.target.value } }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Label>Status</Label>
              <ToggleGroup
                type="single"
                size="sm"
                variant="outline"
                value={meta.status}
                onValueChange={(v) => v && setState((s) => ({ ...s, meta: { ...s.meta, status: v as StoryStatus } }))}
              >
                <ToggleGroupItem value="draft">Draft</ToggleGroupItem>
                <ToggleGroupItem value="published">Published</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </section>

          {/* Chapters */}
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">
                Chapters <span className="text-muted-foreground tabular-nums">({chapters.length})</span>
              </h2>
              <Button size="sm" variant="outline" onClick={addChapter}>
                <PlusIcon /> Add chapter
              </Button>
            </div>
            {chapters.length === 0 && (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                A story is told in chapters. Add one to start placing points.
              </p>
            )}
            {chapters.map((c, i) => (
              <ChapterCard
                key={c.id}
                chapter={c}
                index={i}
                count={chapters.length}
                active={c.id === activeId}
                mode={mode}
                pointsById={pointsById}
                highlightedPointId={highlightedPointId ?? selectedPointId}
                onActivate={() => activate(c.id)}
                onChange={(fn) => updateChapter(c.id, fn)}
                onMove={(d) => moveChapter(c.id, d)}
                onDelete={() => (c.points.length ? setDeletingChapter(c.id) : deleteChapter(c.id))}
                onSetMode={setMode}
                onHighlight={setHighlightedPointId}
                onBrowse={() => setBrowsing(true)}
                onUseCurrentView={() => {
                  if (!mapRef.current) return
                  updateChapter(c.id, (x) => ({ ...x, camera: currentCamera(mapRef.current!) }))
                  toast.success("Saved this view as the chapter camera")
                }}
                onPreviewCamera={() => c.camera && mapRef.current?.flyTo({ ...c.camera, duration: 900 })}
              />
            ))}
          </section>
        </div>
      </div>

      {/* ───────────── map ───────────── */}
      <div className="relative order-1 h-[50dvh] md:order-2 md:h-auto">
        <MapView
          initialView={initialView}
          className="absolute inset-0"
          onReady={(m) => {
            mapRef.current = m
            setMap(m)
          }}
          onClick={onMapClick}
          cursor={mode === "route" ? "crosshair" : undefined}
        >
          <AreaLayer id="editor-areas" points={points} highlightId={selectedPointId ?? highlightedPointId} />
          <MapLayer
            id="editor-routes"
            data={routeData}
            layers={[
              {
                id: "editor-routes-halo",
                type: "line",
                layout: { "line-cap": "round", "line-join": "round" },
                paint: { "line-color": colors.background, "line-width": 8, "line-opacity": 0.7 },
              },
              {
                id: "editor-routes-line",
                type: "line",
                layout: { "line-cap": "round", "line-join": "round" },
                paint: {
                  "line-color": ["case", ["get", "active"], colors.primary, colors.muted],
                  "line-width": ["case", ["get", "active"], 4, 2.5],
                  "line-opacity": ["case", ["get", "active"], 1, 0.6],
                },
              },
            ]}
          />
          <MapLayer
            id="editor-vertices"
            data={vertexData}
            layers={[
              {
                id: "editor-vertices-circle",
                type: "circle",
                paint: {
                  "circle-radius": ["case", ["get", "last"], 5.5, 4],
                  "circle-color": ["case", ["get", "last"], colors.primary, colors.background],
                  "circle-stroke-color": colors.primary,
                  "circle-stroke-width": 2,
                },
              },
            ]}
          />
          <PointsLayer
            id="editor-points"
            points={points}
            look={(p) => {
              const ci = chapterOfPoint.get(p.id)
              const inActive = ci !== undefined && ci === activeIndex
              const inStory = ci !== undefined
              return {
                filled: inStory,
                faint: (inStory && !inActive) || (!inStory && mode !== "add"),
                num: inActive ? active!.points.findIndex((x) => x.pointId === p.id) + 1 : null,
                label: `${p.title}${inStory ? ` (chapter ${ci! + 1})` : ""}`,
              }
            }}
            litIds={[selectedPointId, highlightedPointId]}
            onPointClick={(id) => {
              const p = pointsById.get(id)
              if (p) onMarkerClick(p)
            }}
          />
        </MapView>

        {/* Jump to a place */}
        <SearchCombobox
          value={placeQuery}
          onValueChange={setPlaceQuery}
          ariaLabel="Search for a place"
          placeholder="Jump to a place"
          className={cn("absolute top-3 left-14 z-20 w-[min(18rem,calc(100%-4.5rem))]", mode !== "select" && "top-14")}
          inputClassName="h-8 bg-popover/95 shadow-sm backdrop-blur"
          groups={[
            placesGroup(placeSearch, (place) => {
              setPlaceQuery("")
              if (map) flyToPlace(map, place)
            }),
          ]}
          footer={GEOCODER_CREDIT}
        />

        {/* Mode banner */}
        {mode !== "select" && active && (
          <div className="absolute inset-x-3 top-3 z-10 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-full border bg-popover/95 py-1 pr-1 pl-3 text-xs shadow-sm backdrop-blur">
            <span>
              {mode === "add" ? (
                <>
                  Click points to add or remove them from <b>{chapterLabel(activeIndex)}</b>
                </>
              ) : (
                <>
                  Click the map to draw the route for <b>{chapterLabel(activeIndex)}</b>. Clicking a point snaps to it.
                </>
              )}
            </span>
            <Button size="xs" onClick={() => setMode("select")}>
              Done
            </Button>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 z-10 hidden items-center gap-3 rounded-lg border bg-popover/95 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur sm:flex">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-3 rounded-full bg-primary" /> This chapter
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-full bg-primary opacity-45" /> Other chapters
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 rounded-full border-[1.5px] border-foreground opacity-60" /> Not in
            story
          </span>
        </div>

        {/* Selected point card */}
        {selected && mode === "select" && (
          <div className="absolute right-3 bottom-3 z-20 flex w-[min(22rem,calc(100%-1.5rem))] gap-3 rounded-xl border bg-popover p-2.5 text-popover-foreground shadow-lg">
            <PointMedia point={selected} badge={false} className="aspect-video w-28 shrink-0 self-start rounded-md" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <div className="text-sm leading-snug font-medium">{selected.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatCaptured(selected.capturedAt, selected.timePrecision === "approximate")}
                  </div>
                </div>
                <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={() => setSelectedPointId(null)}>
                  <XIcon />
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedChapter === undefined ? "Not in this story" : `In ${chapterLabel(selectedChapter)}`}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {active && selectedChapter !== activeIndex && (
                  <Button size="xs" onClick={() => addToActive(selected.id)}>
                    <PlusIcon /> {selectedChapter === undefined ? "Add to" : "Move to"} chapter {activeIndex + 1}
                  </Button>
                )}
                {selectedChapter !== undefined && (
                  <Button size="xs" variant="outline" onClick={() => removeFromStory(selected.id)}>
                    Remove from story
                  </Button>
                )}
                <Button asChild size="xs" variant="ghost">
                  <Link href={`/points/${selected.id}/edit`} target="_blank">
                    Edit point <ExternalLinkIcon />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {active && (
        <PointBrowserDialog
          open={browsing}
          onOpenChange={setBrowsing}
          points={points}
          chapterLabel={chapterLabel(activeIndex)}
          inActive={(id) => chapterOfPoint.get(id) === activeIndex}
          chapterOf={(id) => {
            const i = chapterOfPoint.get(id)
            return i === undefined ? null : `chapter ${i + 1}`
          }}
          onToggle={toggleInActive}
        />
      )}

      <ConfirmDelete
        open={deletingChapter !== null}
        onOpenChange={(v) => !v && setDeletingChapter(null)}
        title="Delete this chapter?"
        description="Its points stay in the library; they're just removed from this story. Nothing is saved until you press Save."
        successMessage="Chapter removed"
        action={async () => {
          if (deletingChapter) deleteChapter(deletingChapter)
          return { ok: true, data: undefined }
        }}
      />
      <ConfirmDelete
        open={deletingStory}
        onOpenChange={setDeletingStory}
        title="Delete this story?"
        description={`“${story.title}” and its chapters will be deleted. Its points are kept.`}
        successMessage="Story deleted"
        action={() => deleteStory(story.id)}
        onDone={() => {
          setBaseline(state) // don't trip the unsaved-changes warning
          router.push(`/collections/${story.collection.id}`)
        }}
      />
    </div>
  )
}
