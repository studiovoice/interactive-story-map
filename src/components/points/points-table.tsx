"use client"

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { ConfirmDelete } from "@/components/confirm-delete"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { deletePoint } from "@/lib/actions"
import type { Point, PointListRow } from "@/lib/domain/schema"
import { formatCaptured } from "@/lib/time"
import { mediaSummary } from "@/lib/points/media"
import { cn } from "@/lib/utils"
import { PointMedia } from "./point-media"

const fmt = new Intl.NumberFormat("en-US")

/** Wait this long after the last keystroke before filtering on the server. */
const FILTER_DELAY_MS = 250

function pageHref(q: string, page: number) {
  const params = new URLSearchParams()
  if (q.trim()) params.set("q", q.trim())
  if (page > 1) params.set("page", String(page))
  const s = params.toString()
  return s ? `/points?${s}` : "/points"
}

/**
 * One page of points (paged and filtered on the server, from `?q=` and `?page=`). Typing in the
 * filter updates the URL after a short pause; the current rows stay, dimmed, until the new page arrives.
 */
export function PointsTable({
  rows,
  total,
  q,
  page,
  pageSize,
}: {
  rows: PointListRow[]
  total: number
  q: string
  page: number
  pageSize: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(q)
  // The query last sent to the URL, so a slower response doesn't overwrite what's being typed.
  const [sent, setSent] = useState(q)
  const [prevQ, setPrevQ] = useState(q)
  if (q !== prevQ) {
    // The URL changed (a response arrived, or back/forward): show its query unless it's one we sent.
    setPrevQ(q)
    if (q !== sent) {
      setQuery(q)
      setSent(q)
    }
  }

  useEffect(() => {
    if (query.trim() === sent.trim()) return
    const t = setTimeout(() => {
      setSent(query)
      startTransition(() => router.replace(pageHref(query, 1), { scroll: false }))
    }, FILTER_DELAY_MS)
    return () => clearTimeout(t)
  }, [query, sent, router])

  if (!total && !q.trim() && !query.trim()) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinIcon />
          </EmptyMedia>
          <EmptyTitle>No points yet</EmptyTitle>
          <EmptyDescription>Points are uploads (photos, videos, audio or a note) at a place and time.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/points/new">
              <PlusIcon /> New point
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 z-[1] size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title, place or tag"
          className="pl-8"
          aria-label="Filter points"
        />
      </div>
      <div
        className={cn("overflow-hidden rounded-xl border transition-opacity", pending && "opacity-60")}
        aria-busy={pending}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16" />
              <TableHead>Point</TableHead>
              <TableHead className="hidden md:table-cell">Captured</TableHead>
              <TableHead className="hidden lg:table-cell">Tags</TableHead>
              <TableHead className="hidden sm:table-cell">Stories</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => {
              const storyCount = p.storyCount
              return (
                <TableRow key={p.id}>
                  <TableCell>
                    <PointMedia point={p} badge={false} className="h-9 w-14 rounded-md" />
                  </TableCell>
                  <TableCell className="max-w-0 min-w-48">
                    <Link href={`/points/${p.id}/edit`} className="block truncate font-medium hover:underline">
                      {p.title}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {mediaSummary(p.media)} · {p.placeName || "Unnamed place"}
                      {p.locationPrecision === "approximate" && " · approx. location"}
                      {p.locationPrecision === "obscured" && " · location hidden"}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-xs whitespace-nowrap text-muted-foreground md:table-cell">
                    {formatCaptured(p.capturedAt, p.timePrecision === "approximate")}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {p.tags.slice(0, 3).map((t) => (
                        <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
                          {t}
                        </Badge>
                      ))}
                      {p.tags.length > 3 && <span className="text-xs text-muted-foreground">+{p.tags.length - 3}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {storyCount ? (
                      <Badge variant="secondary">
                        {storyCount} {storyCount === 1 ? "story" : "stories"}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <RowMenu point={p} usedIn={storyCount} />
                  </TableCell>
                </TableRow>
              )
            })}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {total ? (
                    <>
                      This page is past the end.{" "}
                      <Link href={pageHref(q, pages)} className="underline">
                        Go to the last page
                      </Link>
                    </>
                  ) : (
                    <>No points match “{q}”.</>
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {total > 0 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {rows.length
              ? `${fmt.format(from + 1)}–${fmt.format(from + rows.length)} of ${fmt.format(total)}`
              : `${fmt.format(total)} ${total === 1 ? "point" : "points"}`}
          </span>
          {pages > 1 && (
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline">
                Page {fmt.format(Math.min(page, pages))} of {fmt.format(pages)}
              </span>
              <PageLink href={page > 1 ? pageHref(q, Math.min(page, pages) - 1) : null} label="Previous page">
                <ChevronLeftIcon />
              </PageLink>
              <PageLink href={page < pages ? pageHref(q, page + 1) : null} label="Next page">
                <ChevronRightIcon />
              </PageLink>
            </div>
          )}
        </nav>
      )}
    </div>
  )
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: React.ReactNode }) {
  if (!href) {
    return (
      <Button variant="outline" size="icon-sm" disabled aria-label={label}>
        {children}
      </Button>
    )
  }
  return (
    <Button variant="outline" size="icon-sm" asChild>
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  )
}

function RowMenu({ point, usedIn }: { point: Point; usedIn: number }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${point.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/points/${point.id}/edit`}>
              <PencilIcon /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirming(true)}>
            <Trash2Icon /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDelete
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this point?"
        description={
          usedIn
            ? `“${point.title}” will also be removed from ${usedIn} ${usedIn === 1 ? "story" : "stories"}. This can't be undone.`
            : `“${point.title}” will be deleted. This can't be undone.`
        }
        action={() => deletePoint(point.id)}
        successMessage="Point deleted"
      />
    </>
  )
}
