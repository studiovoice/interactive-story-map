import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NotAllowed } from "@/components/auth/not-allowed"
import { PageContainer } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { StoryEditor } from "@/components/stories/story-editor"
import { requireStaff } from "@/lib/auth/page"
import { can } from "@/lib/auth/permissions"
import { getViewer } from "@/lib/auth/server"
import { getPoints, getStoryDetail } from "@/lib/queries"
import { FreshOnNavigate } from "@/components/fresh-on-navigate"

export async function generateMetadata({ params }: PageProps<"/stories/[storyId]/edit">): Promise<Metadata> {
  // Staff page: drafts' titles stay out of the tab for anyone not signed in.
  if (!(await getViewer())) return { title: "Edit story" }
  const story = await getStoryDetail((await params).storyId)
  return { title: story ? `Edit ${story.title}` : "Story not found" }
}

export default function EditStoryPage({ params }: PageProps<"/stories/[storyId]/edit">) {
  return (
    <Suspense fallback={<PageLoading className="h-[calc(100dvh-3.5rem)]" />}>
      <Editor params={params} />
    </Suspense>
  )
}

async function Editor({ params }: Pick<PageProps<"/stories/[storyId]/edit">, "params">) {
  const { storyId } = await params
  const viewer = await requireStaff(`/stories/${storyId}/edit`)
  if (!can(viewer.role, { story: ["edit"] })) {
    return (
      <PageContainer>
        <NotAllowed what="editing stories" />
      </PageContainer>
    )
  }
  const [story, points] = await Promise.all([getStoryDetail(storyId), getPoints()])
  if (!story) notFound()
  return (
    <FreshOnNavigate>
      <StoryEditor story={story} points={points} />
    </FreshOnNavigate>
  )
}
