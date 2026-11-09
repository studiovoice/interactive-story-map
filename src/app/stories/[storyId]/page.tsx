import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageLoading } from "@/components/page-loading"
import { StoryPlayer } from "@/components/stories/story-player"
import { getStoryDetail } from "@/lib/queries"

export async function generateMetadata({ params }: PageProps<"/stories/[storyId]">): Promise<Metadata> {
  const story = await getStoryDetail((await params).storyId)
  return { title: story?.title ?? "Story not found" }
}

/** Playback. `?at=<pointId>` starts at a point; `&autoplay=1` starts playing. */
export default function StoryPage(props: PageProps<"/stories/[storyId]">) {
  return (
    <Suspense fallback={<PageLoading className="h-[calc(100dvh-3.5rem)]" />}>
      <Story {...props} />
    </Suspense>
  )
}

async function Story({ params, searchParams }: PageProps<"/stories/[storyId]">) {
  const [{ storyId }, sp] = await Promise.all([params, searchParams])
  const story = await getStoryDetail(storyId)
  if (!story) notFound()
  const at = typeof sp.at === "string" ? sp.at : undefined
  return <StoryPlayer key={story.updatedAt} story={story} startAtPointId={at} autoplay={sp.autoplay === "1"} />
}
