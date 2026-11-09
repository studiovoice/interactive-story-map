"use client"

import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { ActionResult } from "@/lib/actions"

/** A destructive action behind a confirmation dialog. */
export function ConfirmDelete({
  trigger,
  title,
  description,
  confirmLabel = "Delete",
  action,
  onDone,
  successMessage = "Deleted",
  open: openProp,
  onOpenChange,
}: {
  /** Omit when controlling `open` yourself (e.g. opened from a dropdown item). */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel?: string
  action: () => Promise<ActionResult<unknown>>
  onDone?: () => void
  successMessage?: string
}) {
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (v: boolean) => {
    setOpenState(v)
    onOpenChange?.(v)
  }
  const [pending, start] = useTransition()
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault()
              start(async () => {
                const res = await action()
                if (!res.ok) {
                  toast.error(res.error)
                  return
                }
                toast.success(successMessage)
                setOpen(false)
                onDone?.()
              })
            }}
          >
            {pending ? "Deleting…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
