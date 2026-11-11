"use client"

import { MapPinIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"
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
import type { Point, PointUsage } from "@/lib/domain/schema"
import { formatCaptured } from "@/lib/time"
import { matchesQuery } from "@/lib/points/match"
import { PointMedia } from "./point-media"

const KIND_LABEL = { photo: "Photo", video: "Video", audio: "Audio", note: "Note" } as const

export function PointsTable({ points, usage }: { points: Point[]; usage: Record<string, PointUsage[]> }) {
  const [query, setQuery] = useState("")
  const rows = useMemo(() => points.filter((p) => matchesQuery(p, query)), [points, query])

  if (!points.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MapPinIcon />
          </EmptyMedia>
          <EmptyTitle>No points yet</EmptyTitle>
          <EmptyDescription>Points are single uploads (a photo, video or note) at a place and time.</EmptyDescription>
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
      <div className="overflow-hidden rounded-xl border">
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
              const used = usage[p.id] ?? []
              const storyCount = new Set(used.map((u) => u.storyId)).size
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
                      {KIND_LABEL[p.kind]} · {p.placeName || "Unnamed place"}
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
                  No points match “{query}”.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
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
