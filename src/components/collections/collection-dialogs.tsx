"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createCollection, createStory, updateCollection } from "@/lib/actions"
import type { Collection } from "@/lib/domain/schema"

/** Shared title + description dialog. */
function TitleDescriptionDialog({
  trigger,
  heading,
  blurb,
  submitLabel,
  descriptionLabel,
  initial,
  onSubmit,
}: {
  trigger: ReactNode
  heading: string
  blurb: string
  submitLabel: string
  descriptionLabel: string
  initial?: { title: string; description: string }
  onSubmit: (v: { title: string; description: string }) => Promise<{ ok: boolean; error?: string }>
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (v) {
          setTitle(initial?.title ?? "")
          setDescription(initial?.description ?? "")
          setError(null)
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            start(async () => {
              const res = await onSubmit({ title, description })
              if (!res.ok) {
                setError(res.error ?? "Something went wrong")
                return
              }
              setOpen(false)
            })
          }}
          className="flex flex-col gap-5"
        >
          <DialogHeader>
            <DialogTitle>{heading}</DialogTitle>
            <DialogDescription>{blurb}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="td-title">Title</FieldLabel>
              <Input
                id="td-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
                aria-invalid={!!error}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="td-desc">{descriptionLabel}</FieldLabel>
              <Textarea id="td-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CollectionDialog({ trigger, collection }: { trigger: ReactNode; collection?: Collection }) {
  const router = useRouter()
  return (
    <TitleDescriptionDialog
      trigger={trigger}
      heading={collection ? "Edit collection" : "New collection"}
      blurb="A collection is a big umbrella project, such as a campaign or movement. It holds stories."
      submitLabel={collection ? "Save" : "Create collection"}
      descriptionLabel="Description"
      initial={collection}
      onSubmit={async (v) => {
        const res = collection ? await updateCollection(collection.id, v) : await createCollection(v)
        if (!res.ok) return res
        toast.success(collection ? "Collection saved" : "Collection created")
        if (!collection) router.push(`/collections/${res.data.id}`)
        return res
      }}
    />
  )
}

export function NewStoryDialog({ trigger, collectionId }: { trigger: ReactNode; collectionId: string }) {
  const router = useRouter()
  return (
    <TitleDescriptionDialog
      trigger={trigger}
      heading="New story"
      blurb="A story is one event inside this collection. You'll arrange its points into chapters next."
      submitLabel="Create and edit"
      descriptionLabel="Summary"
      onSubmit={async ({ title, description }) => {
        const res = await createStory({ collectionId, title, summary: description })
        if (!res.ok) return res
        toast.success("Story created")
        router.push(`/stories/${res.data.id}/edit`)
        return res
      }}
    />
  )
}
