"use client"

import { CircleDashedIcon, MapPinIcon, PlusIcon, ShieldIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { ConfirmDelete } from "@/components/confirm-delete"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { createPoint, deletePoint, updatePoint } from "@/lib/actions"
import {
  mediaKinds,
  pointKinds,
  type LngLat,
  type LocationPrecision,
  type MediaAsset,
  type MediaKind,
  type Point,
  type PointInput,
  type PointKind,
} from "@/lib/domain/schema"
import {
  DEFAULT_APPROX_RADIUS,
  DEFAULT_OBSCURED_RADIUS,
  formatMeters,
  MIN_OBSCURED_RADIUS,
  RADIUS_PRESETS,
} from "@/lib/location"
import { getStorage } from "@/lib/storage"
import { LocationPicker } from "./location-picker"
import { PointMedia } from "./point-media"

const KIND_LABEL: Record<PointKind, string> = { photo: "Photo", video: "Video", audio: "Audio", note: "Note" }
const MEDIA_LABEL: Record<MediaKind, string> = { image: "Image", video: "Video", audio: "Audio", document: "Document" }
const DEFAULT_MEDIA_KIND: Record<PointKind, MediaKind> = {
  photo: "image",
  video: "video",
  audio: "audio",
  note: "document",
}

type MediaRow = MediaAsset & { durationText?: string }

export function PointForm({
  point,
  context,
  initialLocation,
}: {
  point?: Point
  /** Other points, shown faintly on the location map. */
  context: Point[]
  initialLocation?: LngLat | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  const [title, setTitle] = useState(point?.title ?? "")
  const [description, setDescription] = useState(point?.description ?? "")
  const [kind, setKind] = useState<PointKind>(point?.kind ?? "photo")
  const [location, setLocation] = useState<LngLat | null>(point?.location ?? initialLocation ?? null)
  const [precision, setPrecision] = useState<LocationPrecision>(point?.locationPrecision ?? "exact")
  const [radius, setRadius] = useState<number>(point?.locationRadiusM ?? DEFAULT_APPROX_RADIUS)

  function changePrecision(v: LocationPrecision) {
    setPrecision(v)
    if (v === "obscured" && radius < MIN_OBSCURED_RADIUS) setRadius(DEFAULT_OBSCURED_RADIUS)
  }
  const [placeName, setPlaceName] = useState(point?.placeName ?? "")
  const [timeKnown, setTimeKnown] = useState(point ? point.capturedAt !== null : true)
  const [capturedAt, setCapturedAt] = useState(point?.capturedAt?.slice(0, 16) ?? "")
  const [approximate, setApproximate] = useState(point?.timePrecision === "approximate")
  const [tags, setTags] = useState(point?.tags.join(", ") ?? "")
  const [contributor, setContributor] = useState(point?.contributor ?? "")
  const [media, setMedia] = useState<MediaRow[]>(
    point?.media.map((m) => ({ ...m, durationText: m.durationSec?.toString() })) ?? [],
  )
  const storage = getStorage()

  const draftPoint: Point = {
    id: point?.id ?? "preview",
    title,
    description,
    kind,
    location: location ?? [0, 0],
    locationPrecision: precision,
    locationRadiusM: precision === "exact" ? null : radius,
    placeName,
    capturedAt: timeKnown && capturedAt ? capturedAt : null,
    timePrecision: approximate ? "approximate" : "exact",
    tags: [],
    contributor,
    media: media.filter((m) => m.url),
    createdAt: "",
    updatedAt: "",
  }

  function updateMedia(i: number, patch: Partial<MediaRow>) {
    setMedia((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!location) {
      setErrors({ location: ["Pick a location on the map"] })
      return
    }
    if (timeKnown && !capturedAt) {
      setErrors({ capturedAt: ["Enter when it was captured, or untick “Time recorded”"] })
      return
    }
    const input: PointInput = {
      title,
      description,
      kind,
      location,
      locationPrecision: precision,
      locationRadiusM: precision === "exact" ? null : radius,
      placeName,
      capturedAt: timeKnown ? capturedAt : null,
      timePrecision: approximate ? "approximate" : "exact",
      tags: [
        ...new Set(
          tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      ],
      contributor,
      media: media
        .filter((m) => m.url?.trim() || m.fileName?.trim())
        .map(({ durationText, ...m }) => ({
          ...m,
          url: m.url?.trim() || undefined,
          fileName: m.fileName?.trim() || undefined,
          durationSec: durationText && Number.isFinite(+durationText) ? +durationText : undefined,
        })),
    }
    start(async () => {
      const res = point ? await updatePoint(point.id, input) : await createPoint(input)
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      setErrors({})
      toast.success(point ? "Point saved" : "Point created")
      router.push("/points")
    })
  }

  const err = (k: string) => errors[k]?.map((message) => ({ message }))

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <FieldGroup>
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="title">Title</FieldLabel>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="The crowd fills the central lawn"
            aria-invalid={!!errors.title}
            required
          />
          <FieldError errors={err("title")} />
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="What's happening here? Anything a viewer should know?"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="kind">Type</FieldLabel>
            <Select value={kind} onValueChange={(v) => setKind(v as PointKind)}>
              <SelectTrigger id="kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pointKinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="contributor">Uploaded by</FieldLabel>
            <Input
              id="contributor"
              value={contributor}
              onChange={(e) => setContributor(e.target.value)}
              placeholder="Anonymous contributor"
            />
          </Field>
        </div>

        <FieldSet>
          <FieldLegend variant="label">When</FieldLegend>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Input
              type="datetime-local"
              aria-label="Captured at"
              value={capturedAt}
              onChange={(e) => setCapturedAt(e.target.value)}
              disabled={!timeKnown}
              aria-invalid={!!errors.capturedAt}
              className="w-auto"
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={timeKnown} onCheckedChange={(v) => setTimeKnown(v === true)} /> Time recorded
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={approximate}
                onCheckedChange={(v) => setApproximate(v === true)}
                disabled={!timeKnown}
              />
              Approximate
            </label>
          </div>
          <FieldDescription>Local time at the place. Stories order points by this.</FieldDescription>
          <FieldError errors={err("capturedAt")} />
        </FieldSet>

        <Field>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="march, brooklyn bridge"
          />
          <FieldDescription>Separate with commas.</FieldDescription>
        </Field>

        <FieldSet>
          <FieldLegend variant="label">Media</FieldLegend>
          <FieldDescription>
            Link to files by URL for now. Points without media show a generated placeholder.
          </FieldDescription>
          <div className="flex flex-col gap-2">
            {media.map((m, i) => (
              <div key={m.id} className="grid grid-cols-[7.5rem_1fr_auto] gap-2 rounded-lg border p-2">
                <Select value={m.kind} onValueChange={(v) => updateMedia(i, { kind: v as MediaKind })}>
                  <SelectTrigger className="w-full" aria-label="Media type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mediaKinds.map((k) => (
                      <SelectItem key={k} value={k}>
                        {MEDIA_LABEL[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={m.url ?? ""}
                  onChange={(e) => updateMedia(i, { url: e.target.value, source: "external" })}
                  placeholder="https://…"
                  aria-label="Media URL"
                  type="url"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove media"
                  onClick={() => setMedia((rows) => rows.filter((_, j) => j !== i))}
                >
                  <Trash2Icon />
                </Button>
                <Input
                  className="col-span-2 col-start-2"
                  value={m.fileName ?? ""}
                  onChange={(e) => updateMedia(i, { fileName: e.target.value })}
                  placeholder="File name (optional)"
                  aria-label="File name"
                />
                {(m.kind === "video" || m.kind === "audio") && (
                  <Input
                    className="col-span-2 col-start-2"
                    value={m.durationText ?? ""}
                    onChange={(e) => updateMedia(i, { durationText: e.target.value })}
                    placeholder="Duration in seconds (optional)"
                    aria-label="Duration in seconds"
                    inputMode="numeric"
                  />
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMedia((rows) => [
                    ...rows,
                    {
                      id: `med_${crypto.randomUUID().slice(0, 12)}`,
                      kind: DEFAULT_MEDIA_KIND[kind],
                      source: "external",
                    },
                  ])
                }
              >
                <PlusIcon /> Add media by URL
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* span: disabled buttons don't fire pointer events for the tooltip */}
                  <span tabIndex={storage.canUpload ? -1 : 0}>
                    <Button type="button" variant="outline" size="sm" disabled={!storage.canUpload}>
                      <UploadIcon /> Upload file
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>File uploads arrive with object storage (S3/MinIO).</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </FieldSet>
      </FieldGroup>

      <div className="flex flex-col gap-6">
        <FieldGroup>
          <Field data-invalid={!!errors.location}>
            <FieldLabel>Location</FieldLabel>
            <LocationPicker
              value={location}
              onPlacePicked={(pl) => {
                if (!placeName.trim()) setPlaceName(pl.name)
              }}
              onChange={(v) => {
                setLocation(v)
                setErrors((errs) => {
                  const next = { ...errs }
                  delete next.location
                  return next
                })
              }}
              context={context.filter((p) => p.id !== point?.id)}
              invalid={!!errors.location}
              radiusM={precision === "exact" ? null : radius}
            />
            <FieldError errors={err("location")} />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">How precise is the location?</FieldLegend>
            <ToggleGroup
              type="single"
              variant="outline"
              value={precision}
              onValueChange={(v) => v && changePrecision(v as LocationPrecision)}
              className="w-full flex-wrap"
            >
              <ToggleGroupItem value="exact" className="flex-1">
                <MapPinIcon /> Exact
              </ToggleGroupItem>
              <ToggleGroupItem value="approximate" className="flex-1">
                <CircleDashedIcon /> Approximate
              </ToggleGroupItem>
              <ToggleGroupItem value="obscured" className="flex-1">
                <ShieldIcon /> Hidden for privacy
              </ToggleGroupItem>
            </ToggleGroup>
            {precision !== "exact" && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  {precision === "approximate" ? "Somewhere within" : "Show an area of about"}
                </span>
                <Select value={String(radius)} onValueChange={(v) => setRadius(Number(v))}>
                  <SelectTrigger className="w-28" aria-label="Radius">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...RADIUS_PRESETS, radius])]
                      .filter((r) => precision !== "obscured" || r >= MIN_OBSCURED_RADIUS)
                      .sort((a, b) => a - b)
                      .map((r) => (
                        <SelectItem key={r} value={String(r)}>
                          {formatMeters(r)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <span className="text-sm">{precision === "approximate" ? "of the pin" : "radius"}</span>
              </div>
            )}
            <FieldDescription>
              {precision === "exact" && "The pin marks where it happened."}
              {precision === "approximate" && "Use this when the contributor isn't sure exactly where it was."}
              {precision === "obscured" &&
                "To protect the people involved, the pin is moved to a random spot inside the circle when you save, and the exact location is never stored. Moving the pin again picks a new random spot."}
            </FieldDescription>
          </FieldSet>
          <Field>
            <FieldLabel htmlFor="placeName">Place name</FieldLabel>
            <Input
              id="placeName"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              placeholder="Cadman Plaza Park"
            />
          </Field>
        </FieldGroup>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Preview</span>
          <div className="flex gap-3 rounded-lg border p-2">
            <PointMedia point={draftPoint} className="aspect-video w-40 shrink-0 rounded-md" />
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium">{title || "Untitled point"}</div>
              <div className="line-clamp-3 text-xs text-muted-foreground">{description || "No description"}</div>
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-4">
          {point && (
            <ConfirmDelete
              title="Delete this point?"
              description={`“${point.title}” will be deleted and removed from any stories that use it.`}
              action={() => deletePoint(point.id)}
              successMessage="Point deleted"
              onDone={() => router.push("/points")}
              trigger={
                <Button type="button" variant="destructive">
                  <Trash2Icon /> Delete
                </Button>
              }
            />
          )}
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : point ? "Save changes" : "Create point"}
          </Button>
        </div>
      </div>
    </form>
  )
}
