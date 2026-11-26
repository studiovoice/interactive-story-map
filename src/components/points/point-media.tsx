import { FileTextIcon, MicIcon, PlayIcon } from "lucide-react"
import type { MediaAsset, Point } from "@/lib/domain/schema"
import { coverMedia, isVisual } from "@/lib/points/media"
import { mediaUrl } from "@/lib/storage/client"
import { parseLocal, timeOfDay } from "@/lib/time"
import { cn } from "@/lib/utils"
import { LazyVideo } from "./lazy-video"

const SKY = {
  Morning: ["#bcd7ea", "#f3ead7"],
  Afternoon: ["#8fbfe3", "#e3edf1"],
  Evening: ["#3a3f73", "#e08d62"],
  Night: ["#0f1a3a", "#2c3460"],
} as const

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) % 2147483646 || 1
}

/** Placeholder "photo": a generated street scene tinted by time of day (from the prototype). */
export function PointScene({ point, className }: { point: Pick<Point, "id" | "capturedAt">; className?: string }) {
  const ms = parseLocal(point.capturedAt)
  const tod = ms === null ? "Afternoon" : timeOfDay(ms)
  let s = hash(point.id)
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647
  const buildings: string[] = []
  for (let x = -5; x < 165;) {
    const w = 14 + r() * 22,
      h = 18 + r() * 38
    buildings.push(`M${x | 0} ${(70 - h) | 0}h${w | 0}v${(h + 30) | 0}h-${w | 0}z`)
    x += w + 1
  }
  const people: { cx: number; cy: number; r: number; x: number; y: number; w: number; h: number }[] = []
  for (let k = 0; k < 24; k++) {
    const x = r() * 165,
      y = 70 + r() * 22,
      sz = 2.4 + (y - 70) * 0.1
    people.push({
      cx: x | 0,
      cy: (y - sz * 1.5) | 0,
      r: +sz.toFixed(1),
      x: (x - sz * 1.2) | 0,
      y: (y - sz * 0.6) | 0,
      w: (sz * 2.4) | 0,
      h: (sz * 6) | 0,
    })
  }
  const night = tod === "Night"
  const glow = night ? Array.from({ length: 14 }, () => [(r() * 160) | 0, (74 + r() * 20) | 0]) : []
  const sign = night ? null : [(30 + r() * 80) | 0, (44 + r() * 8) | 0]
  return (
    <span
      className={cn("relative block size-full overflow-hidden", className)}
      style={{ backgroundImage: `linear-gradient(${SKY[tod].join(",")})` }}
    >
      <svg
        viewBox="0 0 160 100"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden
        className="absolute inset-0 size-full"
      >
        <path d={buildings.join("")} fill="#0003" />
        {sign && <rect x={sign[0]} y={sign[1]} width="26" height="13" fill="#f5f5f0" />}
        <g fill="#141c2ccc">
          {people.map((p, i) => (
            <g key={i}>
              <circle cx={p.cx} cy={p.cy} r={p.r} />
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.r | 0} />
            </g>
          ))}
        </g>
        {glow.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.2" fill="#ffd27a" />
        ))}
      </svg>
    </span>
  )
}

export function formatDurationSec(sec?: number) {
  if (sec === undefined) return null
  return `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`
}

/**
 * The point's cover (see `coverMedia`), for thumbnails and previews: the real image or video
 * frame when it has a URL, an icon for audio or documents, and the generated placeholder scene
 * for a point with no files. To show every file, use `PointMediaViewer`.
 */
export function PointMedia({
  point,
  className,
  badge = true,
}: {
  point: Point
  className?: string
  /** The "Photo"/"Video" label and play icon. Off for small thumbnails. */
  badge?: boolean
}) {
  const media = coverMedia(point.media)
  const url = media ? mediaUrl(media) : null
  const duration = formatDurationSec(media?.durationSec)
  const more = point.media.filter(isVisual).length - 1

  let content: React.ReactNode
  if (media?.kind === "image" && url) {
    // eslint-disable-next-line @next/next/no-img-element -- arbitrary external URLs
    content = <img src={url} alt={point.title} loading="lazy" decoding="async" className="size-full object-cover" />
  } else if (media?.kind === "video" && url) {
    content = <LazyVideo src={url} className="size-full object-cover" />
  } else if (media?.kind === "audio") {
    content = (
      <span className="grid size-full place-items-center bg-muted text-muted-foreground">
        <MicIcon className="size-6" />
      </span>
    )
  } else if (!media && point.media.length) {
    // Only documents.
    content = (
      <span className="grid size-full place-items-center bg-muted text-muted-foreground">
        <FileTextIcon className="size-6" />
      </span>
    )
  } else {
    content = <PointScene point={point} />
  }

  const isVideo = media?.kind === "video"
  return (
    <span className={cn("relative block overflow-hidden bg-muted", className)}>
      {content}
      {badge && isVideo && (
        <span className="absolute inset-0 m-auto grid size-8 place-items-center rounded-full bg-black/60 text-white">
          <PlayIcon className="size-3.5 fill-current" />
        </span>
      )}
      {badge && (isVideo || media?.kind === "image") && (
        <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-1.5 py-px text-[10.5px] font-medium text-white">
          {isVideo ? `Video${duration ? ` · ${duration}` : ""}` : "Photo"}
        </span>
      )}
      {more > 0 && (
        <span
          className={cn(
            "absolute rounded-full bg-black/65 font-medium text-white tabular-nums",
            badge
              ? "right-1.5 bottom-1.5 px-1.5 py-px text-[10.5px]"
              : "right-0.5 bottom-0.5 px-1 text-[9px] leading-3.5",
          )}
          aria-label={`${more} more`}
        >
          +{more}
        </span>
      )}
    </span>
  )
}

/** Link text for a document without a label: its type, numbered when there are several. */
function documentFallbackLabel(doc: MediaAsset, index: number, count: number): string {
  const type =
    doc.mimeType === "application/pdf" ? "PDF document" : doc.mimeType === "text/plain" ? "Text document" : "Document"
  return count > 1 ? `${type} ${index + 1}` : type
}

export function AttachmentList({ point }: { point: Point }) {
  const docs = point.media.filter((m) => m.kind === "document")
  if (!docs.length) return null
  return (
    <div className="flex flex-col gap-1.5">
      {docs.map((d, i) => {
        const url = mediaUrl(d)
        const label = d.fileName || (d.source === "external" && url) || documentFallbackLabel(d, i, docs.length)
        return (
          <a
            key={d.id}
            href={url ?? undefined}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs",
              url ? "hover:bg-muted" : "pointer-events-none",
            )}
          >
            <FileTextIcon className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{label}</span>
          </a>
        )
      })}
    </div>
  )
}
