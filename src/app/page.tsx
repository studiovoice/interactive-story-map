import { Suspense } from "react"
import { PageLoading } from "@/components/page-loading"
import { ExploreMap } from "@/components/points/explore-map"
import { getPointUsage, getPoints } from "@/lib/queries"

export default function ExplorePage() {
  return (
    <Suspense fallback={<PageLoading className="h-[calc(100dvh-3.5rem)]" />}>
      <Explore />
    </Suspense>
  )
}

async function Explore() {
  const [points, usage] = await Promise.all([getPoints(), getPointUsage()])
  return <ExploreMap points={points} usage={usage} />
}
