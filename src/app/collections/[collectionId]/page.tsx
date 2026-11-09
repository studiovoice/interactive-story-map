import { BookOpenIcon, PencilIcon, PlayIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { CollectionActions, StoryRowMenu } from "@/components/collections/collection-actions"
import { NewStoryDialog } from "@/components/collections/collection-dialogs"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getCollection, getStoriesByCollection } from "@/lib/queries"
import { formatRange } from "@/lib/time"

export async function generateMetadata({ params }: PageProps<"/collections/[collectionId]">): Promise<Metadata> {
  const c = await getCollection((await params).collectionId)
  return { title: c?.title ?? "Collection not found" }
}

export default function CollectionPage({ params }: PageProps<"/collections/[collectionId]">) {
  return (
    <PageContainer>
      <Suspense fallback={<PageLoading />}>
        <CollectionDetail params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function CollectionDetail({ params }: Pick<PageProps<"/collections/[collectionId]">, "params">) {
  const { collectionId } = await params
  const [collection, stories] = await Promise.all([getCollection(collectionId), getStoriesByCollection(collectionId)])
  if (!collection) notFound()

  const newStory = (
    <NewStoryDialog
      collectionId={collection.id}
      trigger={
        <Button>
          <PlusIcon /> New story
        </Button>
      }
    />
  )

  return (
    <>
      <PageHeader
        eyebrow={
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/collections">Collections</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{collection.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        }
        title={collection.title}
        description={collection.description}
        actions={
          <>
            <CollectionActions collection={collection} storyCount={stories.length} />
            {newStory}
          </>
        }
      />

      <h2 className="mb-3 text-sm font-medium text-muted-foreground">
        Stories <span className="tabular-nums">({stories.length})</span>
      </h2>

      {stories.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BookOpenIcon />
            </EmptyMedia>
            <EmptyTitle>No stories yet</EmptyTitle>
            <EmptyDescription>
              A story is one event in this collection, like a march or a vigil. You arrange points into chapters, then
              play it back on the map.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{newStory}</EmptyContent>
        </Empty>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border">
          {stories.map((s) => {
            const range = formatRange(s.startsAt, s.endsAt)
            return (
              <li key={s.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <Button asChild size="icon-lg" className="shrink-0 rounded-full" aria-label={`Play ${s.title}`}>
                  <Link href={`/stories/${s.id}`}>
                    <PlayIcon className="fill-current" />
                  </Link>
                </Button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link href={`/stories/${s.id}`} className="truncate font-medium hover:underline">
                      {s.title}
                    </Link>
                    {s.status === "draft" && <Badge variant="outline">Draft</Badge>}
                  </div>
                  {s.summary && <p className="line-clamp-1 text-sm text-muted-foreground">{s.summary}</p>}
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {[
                      range,
                      `${s.chapterCount} ${s.chapterCount === 1 ? "chapter" : "chapters"}`,
                      `${s.pointCount} points`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                  <Link href={`/stories/${s.id}/edit`}>
                    <PencilIcon /> Edit
                  </Link>
                </Button>
                <StoryRowMenu story={s} />
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
