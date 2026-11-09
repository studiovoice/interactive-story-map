"use client"

import { useRouter } from "next/navigation"
import { Fragment, type ReactNode } from "react"

/**
 * Remounts its children on every fresh navigation (link click, router.push/replace), but keeps
 * their state on browser back/forward.
 *
 * With Cache Components, Next.js keeps recently visited pages alive in React <Activity>, so a form
 * would otherwise come back with whatever was left in it last time (an old pin, half-typed fields).
 * Wrap forms that should start from their props each time they're opened.
 */
export function FreshOnNavigate({ children }: { children: ReactNode }) {
  const { bfcacheId } = useRouter()
  return <Fragment key={bfcacheId}>{children}</Fragment>
}
