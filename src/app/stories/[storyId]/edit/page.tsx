import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageLoading } from "@/components/page-loading"
import { StoryEditor } from "@/components/stories/story-editor"
import { getPoints, getStoryDetail } from "@/lib/queries"
import { FreshOnNavigate } from "@/components/fresh-on-navigate"

export async function generateMetadata({ params }: PageProps<"/stories/[storyId]/edit">): Promise<Metadata> {
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
  const [story, points] = await Promise.all([getStoryDetail(storyId), getPoints()])
  if (!story) notFound()
  return (
    <FreshOnNavigate>
      <StoryEditor story={story} points={points} />
    </FreshOnNavigate>
  )
}
