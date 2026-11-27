"use client"

import { InfoIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
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
import { updatePointMetadata } from "@/lib/actions"
import type { Point } from "@/lib/domain/schema"
import { formatMeters } from "@/lib/location"
import { mediaSummary } from "@/lib/points/media"
import { PointMedia } from "./point-media"

/**
 * The curator's edit form: only a point's tags and time. The rest (title, description, place,
 * location, files) is shown read-only; admins edit those in the full form.
 */
export function PointMetadataForm({ point }: { point: Point }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [timeKnown, setTimeKnown] = useState(point.capturedAt !== null)
  const [capturedAt, setCapturedAt] = useState(point.capturedAt?.slice(0, 16) ?? "")
  const [approximate, setApproximate] = useState(point.timePrecision === "approximate")
  const [tags, setTags] = useState(point.tags.join(", "))
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (timeKnown && !capturedAt) {
      setErrors({ capturedAt: ["Enter when it was captured, or untick “Time recorded”"] })
      return
    }
    start(async () => {
      const res = await updatePointMetadata(point.id, {
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
      })
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {})
        toast.error(res.error)
        return
      }
      setErrors({})
      toast.success("Point saved")
      router.push("/points")
    })
  }

  const err = (k: string) => errors[k]?.map((message) => ({ message }))

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <FieldGroup>
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
          <FieldDescription>
            Local time at the place. Stories order points by this. If the uploader didn&apos;t give a time, a best guess
            marked “Approximate” is fine.
          </FieldDescription>
          <FieldError errors={err("capturedAt")} />
        </FieldSet>

        <Field data-invalid={!!errors.tags}>
          <FieldLabel htmlFor="tags">Tags</FieldLabel>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="march, brooklyn bridge"
          />
          <FieldDescription>Separate with commas.</FieldDescription>
          <FieldError errors={err("tags")} />
        </Field>

        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
          <span className="flex-1" />
          <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <PointMedia point={point} className="aspect-video w-full rounded-xl" />
        <div className="flex flex-col gap-1 text-sm">
          <div className="font-medium">{point.title}</div>
          <div className="text-xs text-muted-foreground">
            {mediaSummary(point.media)} · {point.placeName || "Unnamed place"}
            {point.locationPrecision === "approximate" &&
              ` · within ${formatMeters(point.locationRadiusM ?? 0)} of the pin`}
            {point.locationPrecision === "obscured" && " · location hidden for privacy"}
          </div>
          {point.description && <p className="mt-1 whitespace-pre-line text-muted-foreground">{point.description}</p>}
        </div>
        <p className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <InfoIcon className="mt-px size-3.5 shrink-0" />
          Curators can change a point&apos;s time and tags. Ask an admin to change its title, description, place,
          location or files.
        </p>
      </div>
    </form>
  )
}
