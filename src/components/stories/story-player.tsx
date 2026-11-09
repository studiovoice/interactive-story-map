"use client"

import type { Map as MlMap, PaddingOptions } from "maplibre-gl"
import { CrosshairIcon, PauseIcon, PencilIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { chapterCamera, NO_PADDING } from "@/components/map/camera"
import { AreaLayer } from "@/components/map/area-layer"
import { MapLayer } from "@/components/map/map-layer"
import { MapMarker } from "@/components/map/map-marker"
import { MapView } from "@/components/map/map-view"
import { useThemeColors } from "@/components/map/use-theme-colors"
import { PointMedia } from "@/components/points/point-media"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import type { StoryDetail } from "@/lib/domain/schema"
import { boundsOf, lineFeature } from "@/lib/geo"
import {
  activeItemAt,
  buildTimeline,
  chapterIndexAt,
  gapAt,
  posOfPoint,
  routesAt,
  timeAt,
  type Timeline,
  type TimelineItem,
} from "@/lib/story/timeline"
import { DAY, MINUTE, formatDate, formatTime, timeOfDay } from "@/lib/time"
import { isFuzzy, locationPrecisionLabel } from "@/lib/location"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"
import { TimelineTrack } from "./timeline-track"

const SPEEDS = [1, 2, 4]
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))

export function StoryPlayer({
  story,
  startAtPointId,
  autoplay = false,
}: {
  story: StoryDetail
  startAtPointId?: string
  autoplay?: boolean
}) {
  const timeline = useMemo(() => buildTimeline(story), [story])
  if (timeline.isEmpty) {
    return (
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
        <PlayerHeader story={story} timeline={timeline} />
        <Empty className="m-4 border">
          <EmptyHeader>
            <EmptyTitle>This story has no points yet</EmptyTitle>
            <EmptyDescription>Add points to its chapters in the editor, then come back to play it.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link href={`/stories/${story.id}/edit`}>
                <PencilIcon /> Edit story
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    )
  }
  return <Player story={story} timeline={timeline} startAtPointId={startAtPointId} autoplay={autoplay} />
}

function Player({
  story,
  timeline,
  startAtPointId,
  autoplay,
}: {
  story: StoryDetail
  timeline: Timeline
  startAtPointId?: string
  autoplay: boolean
}) {
  const [p, setP] = useState(() => {
    const pos = startAtPointId ? posOfPoint(timeline, startAtPointId) : null
    return pos === null ? 0 : clamp(pos + 1e-4)
  })
  const [playing, setPlaying] = useState(autoplay)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [follow, setFollow] = useState(true)
  const [map, setMap] = useState<MlMap | null>(null)
  const scrubbing = useRef(false)
  const resumeAfterScrub = useRef(false)
  const cardRef = useRef<HTMLElement>(null)
  const colors = useThemeColors()
  const { showApproxAreas } = useSettings()

  // Whole story plays in ~10s per chapter at 1×.
  const duration = clamp(timeline.chapters.length * 10, 30, 120)
  const ci = chapterIndexAt(timeline, p)
  const chapter = timeline.chapters[ci]
  const gap = gapAt(timeline, p)
  const active = activeItemAt(timeline, p)
  const t = timeAt(timeline, p)

  /* ── playback loop ── */
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      setP((q) => {
        const next = q + (dt * SPEEDS[speedIdx]) / duration
        if (next >= 1) {
          setPlaying(false)
          return 1
        }
        return next
      })
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [playing, speedIdx, duration])

  /* ── map padding keeps clear of the story card ── */
  const padding = (): PaddingOptions => {
    if (!cardRef.current || !window.matchMedia("(min-width: 768px)").matches) return NO_PADDING
    return { top: 20, bottom: 20, left: 20, right: cardRef.current.offsetWidth + 24 }
  }
  useEffect(() => {
    if (!map) return
    const apply = () => map.setPadding(padding())
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(map.getContainer())
    // Dragging, zooming or rotating takes the camera away from the story until "Follow story".
    const stopFollow = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) setFollow(false)
    }
    const evs = ["dragstart", "zoomstart", "rotatestart", "pitchstart"] as const
    evs.forEach((ev) => map.on(ev, stopFollow))
    return () => {
      ro.disconnect()
      evs.forEach((ev) => map.off(ev, stopFollow))
    }
  }, [map])

  /* ── camera follows the chapter (during a gap, the next one) ── */
  const camIndex = gap ? Math.min(ci + 1, timeline.chapters.length - 1) : ci
  const firstMove = useRef(true)
  useEffect(() => {
    if (!map || !follow) return
    const cam = chapterCamera(map, timeline.chapters[camIndex].chapter)
    if (!cam) return
    if (firstMove.current) {
      firstMove.current = false
      map.jumpTo(cam)
      return
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    map.flyTo({
      ...cam,
      duration: reduced ? 0 : scrubbing.current || !playing ? 1100 : 2400 / SPEEDS[speedIdx],
      curve: 1.2,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only move on chapter/follow changes
  }, [map, camIndex, follow, timeline])

  /* ── routes: finished chapters in full, current one up to the march front ── */
  /* ── approximate / obscured areas of the points shown so far ── */
  // Items are in track order, so the shown ones are a prefix. Memo on the count, not on p (60fps).
  const shownCount = timeline.items.filter((it) => p >= it.pos).length
  const shownPoints = useMemo(() => timeline.items.slice(0, shownCount).map((it) => it.point), [timeline, shownCount])

  const routeKey = Math.round(p * 2000)
  const routes = useMemo(() => routesAt(timeline, routeKey / 2000), [timeline, routeKey])
  const routeData = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [...routes.done, ...(routes.current ? [routes.current] : [])].map(lineFeature),
    }),
    [routes],
  )

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.code === "Space" && !el.closest("button,input,textarea,[role=slider],video,audio")) {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  function togglePlay() {
    if (!playing && p >= 1) setP(0)
    setPlaying((v) => !v)
  }
  function jumpTo(item: TimelineItem) {
    setP(clamp(item.pos + 1e-4))
    setPlaying(false)
  }
  function nextChapter() {
    setP(ci < timeline.chapters.length - 1 ? timeline.chapters[ci + 1].p0 : 1)
  }
  function prevChapter() {
    const ch = timeline.chapters[ci]
    const target = p - ch.p0 > 0.01 || ci === 0 ? ci : ci - 1
    setP(timeline.chapters[target].p0)
  }

  // Night falls: a faint dusk overlay late in the day.
  const minutesOfDay = t === null ? null : (((t % DAY) + DAY) % DAY) / MINUTE
  const dusk = minutesOfDay === null ? 0 : clamp((minutesOfDay - 1060) / 110) * 0.2

  return (
    <div className="flex flex-col md:h-[calc(100dvh-3.5rem)]">
      <PlayerHeader story={story} timeline={timeline} />

      <div className="relative px-3 sm:px-4 md:min-h-0 md:flex-1">
        <div className="relative h-[45dvh] overflow-hidden rounded-xl border md:h-full [&_.maplibregl-ctrl-top-left]:top-[78px]!">
          <MapView
            initialView={(() => {
              const b = boundsOf(timeline.items.map((i) => i.point.location))
              return b ? { bounds: b } : { center: [0, 0], zoom: 2 }
            })()}
            className="absolute inset-0"
            onReady={setMap}
          >
            {timeline.items.map((it) => {
              const on = p >= it.pos
              const isActive = on && active?.index === it.index
              const live = on && !isActive && p - it.pos < 0.025
              return (
                <MapMarker
                  key={it.index}
                  lngLat={it.point.location}
                  title={it.point.title}
                  className={cn(
                    "mk",
                    it.point.kind === "video" && "video",
                    it.approx && "approx",
                    !on && "hid",
                    isActive && "active live",
                    live && "live",
                    on && !live && !isActive && "past",
                  )}
                  onClick={() => jumpTo(it)}
                >
                  <i className="pulse" />
                  <i className="body">
                    <svg viewBox="0 0 7 8">
                      <path d="M0 0v8l7-4z" />
                    </svg>
                  </i>
                  <span className="tm">
                    {it.time === null ? "" : it.approx ? "≈ " + formatTime(it.time) : formatTime(it.time)}
                  </span>
                </MapMarker>
              )
            })}
            <AreaLayer id="story-areas" points={shownPoints} highlightId={active?.point.id} />
            <MapLayer
              id="story-route"
              data={routeData}
              layers={[
                {
                  id: "story-route-halo",
                  type: "line",
                  layout: { "line-cap": "round", "line-join": "round" },
                  paint: { "line-color": colors.background, "line-width": 8, "line-opacity": 0.8 },
                },
                {
                  id: "story-route-line",
                  type: "line",
                  layout: { "line-cap": "round", "line-join": "round" },
                  paint: { "line-color": colors.primary, "line-width": 4 },
                },
              ]}
            />
            {routes.front && (
              <MapMarker lngLat={routes.front}>
                <div className="mk-front" />
              </MapMarker>
            )}
          </MapView>

          <div
            className="pointer-events-none absolute inset-0 z-[1] bg-[#0a1430] transition-opacity"
            style={{ opacity: dusk }}
          />

          {/* Clock */}
          <div className="absolute top-3 left-3 z-[2] rounded-lg border bg-popover/90 px-3 py-1.5 text-popover-foreground backdrop-blur">
            <small className="block text-[11px] text-muted-foreground">
              {t === null ? "Time not recorded" : formatDate(t)}
            </small>
            <b className="block text-lg leading-tight font-semibold tracking-tight tabular-nums md:text-[21px]">
              {t === null ? "—" : formatTime(t)}
            </b>
            <small className="block text-[11px] text-muted-foreground">{t === null ? "" : timeOfDay(t)}</small>
          </div>

          {/* Skipping a quiet stretch */}
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 top-3.5 z-[2] mx-auto w-max rounded-lg border bg-popover/90 px-3 py-1 text-xs font-medium opacity-0 backdrop-blur transition-opacity",
              gap && "opacity-100",
            )}
          >
            Skipping {gap?.label ?? ""}
          </div>

          {/* Follow + legend */}
          <div className="absolute bottom-3 left-3 z-[2] flex flex-col items-start gap-2">
            {!follow && (
              <button
                onClick={() => setFollow(true)}
                className="flex items-center gap-1.5 rounded-full border bg-popover/90 px-3 py-1 text-xs font-semibold backdrop-blur hover:bg-muted"
              >
                <CrosshairIcon className="size-3.5" /> Follow story
              </button>
            )}
            <div className="hidden items-center gap-3 rounded-lg border bg-popover/90 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur sm:flex">
              <span className="flex items-center gap-1">
                <i className="inline-block size-[9px] rounded-full bg-primary" />
                Photo
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block h-0 w-0 border-y-[5px] border-l-[9px] border-y-transparent border-l-primary" />
                Video
              </span>
              <span className="flex items-center gap-1">
                <i className="inline-block size-[9px] rounded-full border-[1.5px] border-dashed border-primary" />
                Approx. time
              </span>
              {showApproxAreas && timeline.items.some((it) => it.point.locationPrecision !== "exact") && (
                <span className="flex items-center gap-1">
                  <i className="inline-block size-[9px] rounded-full border border-dashed border-primary bg-primary/15" />
                  Approx. area
                </span>
              )}
              {timeline.chapters.some((c) => c.route) && (
                <span className="flex items-center gap-1">
                  <i className="inline-block h-[3px] w-3.5 rounded-xs bg-primary" />
                  Route
                </span>
              )}
            </div>
          </div>
        </div>

        <StoryCard
          ref={cardRef}
          timeline={timeline}
          chapterIndex={ci}
          active={active}
          onJump={jumpTo}
          className="hidden md:absolute md:top-3 md:right-7 md:bottom-3 md:flex md:w-[290px] lg:w-[320px]"
        />
      </div>

      {/* Timeline + controls */}
      <div className="flex shrink-0 flex-col gap-1.5 px-3 pt-3 pb-3 sm:px-4">
        <TimelineTrack
          timeline={timeline}
          p={p}
          onScrub={(q) => setP(q)}
          onScrubStart={() => {
            scrubbing.current = true
            resumeAfterScrub.current = playing
            setPlaying(false)
          }}
          onScrubEnd={(jumped) => {
            scrubbing.current = false
            if (resumeAfterScrub.current && !jumped) setPlaying(true)
          }}
          onJumpToItem={(i) => jumpTo(timeline.items[i])}
        />
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Previous chapter"
            onClick={prevChapter}
          >
            <SkipBackIcon className="fill-current" />
          </Button>
          <button
            onClick={togglePlay}
            aria-label={playing ? "Pause" : "Play"}
            className="grid size-[42px] shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition-transform hover:scale-105"
          >
            {playing ? (
              <PauseIcon className="size-[18px] fill-current" />
            ) : (
              <PlayIcon className="size-[18px] fill-current" />
            )}
          </button>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Next chapter" onClick={nextChapter}>
            <SkipForwardIcon className="fill-current" />
          </Button>
          <div className="ml-2 min-w-0 flex-1">
            <b className="block truncate text-[13px] font-semibold">{chapter.chapter.title || `Chapter ${ci + 1}`}</b>
            <span className="block text-[11.5px] whitespace-nowrap text-muted-foreground">
              Chapter {ci + 1} of {timeline.chapters.length}
              {t !== null && ` · ${formatTime(t)}`}
            </span>
          </div>
          <button
            onClick={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
            aria-label="Playback speed"
            className="min-w-10 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums hover:bg-muted"
          >
            {SPEEDS[speedIdx]}×
          </button>
        </div>
      </div>

      {/* On phones the card sits under the timeline */}
      <StoryCard
        timeline={timeline}
        chapterIndex={ci}
        active={active}
        onJump={jumpTo}
        className="mx-3 mb-4 flex md:hidden"
      />
    </div>
  )
}

function PlayerHeader({ story, timeline }: { story: StoryDetail; timeline: Timeline }) {
  const contributors = new Set(timeline.items.map((i) => i.point.contributor || `anon-${i.point.id}`)).size
  const when =
    timeline.startsAt === null
      ? null
      : timeline.multiDay && timeline.endsAt !== null
        ? `${formatDate(timeline.startsAt)} – ${formatDate(timeline.endsAt)}`
        : formatDate(timeline.startsAt)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-3 px-3 py-3 sm:px-4">
      <div className="min-w-48 flex-1">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          {story.title}
          {story.status === "draft" && (
            <span className="rounded-full border px-2 py-px text-[10.5px] font-medium text-muted-foreground">
              Draft
            </span>
          )}
        </h1>
        <p className="mt-px text-[12.5px] text-muted-foreground">
          {when && <>{when} · </>}
          {timeline.items.length} uploads from {contributors} {contributors === 1 ? "contributor" : "contributors"} ·{" "}
          <Link href={`/collections/${story.collection.id}`} className="hover:text-foreground hover:underline">
            {story.collection.title}
          </Link>
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={`/stories/${story.id}/edit`}>
          <PencilIcon /> Edit story
        </Link>
      </Button>
    </div>
  )
}

function StoryCard({
  ref,
  timeline,
  chapterIndex,
  active,
  onJump,
  className,
}: {
  ref?: React.Ref<HTMLElement>
  timeline: Timeline
  chapterIndex: number
  active: TimelineItem | null
  onJump: (item: TimelineItem) => void
  className?: string
}) {
  const ch = timeline.chapters[chapterIndex]
  const it = active ?? ch.items[0] ?? null
  return (
    <aside
      ref={ref}
      aria-live="polite"
      className={cn(
        "z-[3] flex-col gap-2 overflow-hidden rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg",
        className,
      )}
    >
      <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
        <span>
          Chapter {chapterIndex + 1} of {timeline.chapters.length}
        </span>
        {it && (
          <span>
            {it.index + 1} / {timeline.items.length}
          </span>
        )}
      </div>
      <h2 className="-mt-1 text-[15px] leading-tight font-semibold tracking-tight">
        {ch.chapter.title || `Chapter ${chapterIndex + 1}`}
      </h2>
      {ch.chapter.narrative && <p className="text-[12.5px] text-muted-foreground">{ch.chapter.narrative}</p>}
      {it ? (
        <>
          <PointMedia point={it.point} controls className="aspect-video w-full shrink-0 rounded-md" />
          <div>
            <div className="text-[12.5px] leading-snug font-medium">{it.point.title}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                it.time === null
                  ? "Time not recorded"
                  : it.approx
                    ? `≈ ${timeOfDay(it.time)} · no exact time recorded`
                    : formatTime(it.time),
                it.point.placeName,
                isFuzzy(it.point) ? locationPrecisionLabel(it.point).toLowerCase() : null,
                it.point.contributor || "Anonymous contributor",
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {it.note && (
            <p className="rounded-md bg-muted px-2 py-1 text-[11.5px] leading-snug text-foreground">{it.note}</p>
          )}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No points in this chapter.</p>
      )}
      <div className="mt-auto flex flex-wrap gap-1 pt-0.5">
        {ch.items.map((x) => (
          <button
            key={x.index}
            onClick={() => onJump(x)}
            aria-label={x.point.title}
            title={x.point.title}
            className={cn(
              "h-8 w-11 shrink-0 overflow-hidden rounded-[5px] opacity-60 outline-offset-1 hover:opacity-100",
              x.index === it?.index && "opacity-100 outline-2 outline-primary",
            )}
          >
            <PointMedia point={x.point} badge={false} className="size-full" />
          </button>
        ))}
      </div>
    </aside>
  )
}
