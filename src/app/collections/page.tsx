import { FolderOpenIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { CollectionDialog } from "@/components/collections/collection-dialogs"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getCollections } from "@/lib/queries"
import { formatInstant } from "@/lib/time"

export const metadata: Metadata = { title: "Collections" }

export default function CollectionsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Collections"
        description="Big umbrella projects, such as a campaign or a movement. Each one holds stories, and each story arranges points into chapters."
        actions={
          <CollectionDialog
            trigger={
              <Button>
                <PlusIcon /> New collection
              </Button>
            }
          />
        }
      />
      <Suspense fallback={<PageLoading />}>
        <CollectionGrid />
      </Suspense>
    </PageContainer>
  )
}

async function CollectionGrid() {
  const collections = await getCollections()
  if (!collections.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpenIcon />
          </EmptyMedia>
          <EmptyTitle>No collections yet</EmptyTitle>
          <EmptyDescription>Create one to start grouping points into stories.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <CollectionDialog
            trigger={
              <Button>
                <PlusIcon /> New collection
              </Button>
            }
          />
        </EmptyContent>
      </Empty>
    )
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {collections.map((c) => (
        <Link key={c.id} href={`/collections/${c.id}`} className="group rounded-xl focus-visible:outline-2">
          <Card className="h-full transition-colors group-hover:bg-muted/50">
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
              <CardDescription className="line-clamp-3">{c.description || "No description"}</CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto gap-3 text-xs text-muted-foreground">
              <span>
                {c.storyCount} {c.storyCount === 1 ? "story" : "stories"}
              </span>
              <span>·</span>
              <span>{c.pointCount} points</span>
              <span className="ml-auto">Updated {formatInstant(c.updatedAt)}</span>
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  )
}
