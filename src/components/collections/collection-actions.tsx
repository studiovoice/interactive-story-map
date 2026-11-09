"use client"

import { MoreHorizontalIcon, PencilIcon, PlayIcon, Trash2Icon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ConfirmDelete } from "@/components/confirm-delete"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteCollection, deleteStory } from "@/lib/actions"
import type { Collection, StorySummary } from "@/lib/domain/schema"
import { CollectionDialog } from "./collection-dialogs"

export function CollectionActions({ collection, storyCount }: { collection: Collection; storyCount: number }) {
  const router = useRouter()
  return (
    <>
      <CollectionDialog
        collection={collection}
        trigger={
          <Button variant="outline">
            <PencilIcon /> Edit
          </Button>
        }
      />
      <ConfirmDelete
        title="Delete this collection?"
        description={
          storyCount
            ? `“${collection.title}” and its ${storyCount} ${storyCount === 1 ? "story" : "stories"} will be deleted. Points are kept.`
            : `“${collection.title}” will be deleted.`
        }
        action={() => deleteCollection(collection.id)}
        successMessage="Collection deleted"
        onDone={() => router.push("/collections")}
        trigger={
          <Button variant="destructive" size="icon" aria-label="Delete collection">
            <Trash2Icon />
          </Button>
        }
      />
    </>
  )
}

export function StoryRowMenu({ story }: { story: StorySummary }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${story.title}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/stories/${story.id}`}>
              <PlayIcon /> Play
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/stories/${story.id}/edit`}>
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
        title="Delete this story?"
        description={`“${story.title}” and its chapters will be deleted. Its points are kept.`}
        action={() => deleteStory(story.id)}
        successMessage="Story deleted"
      />
    </>
  )
}
