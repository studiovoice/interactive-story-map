import { Suspense } from "react"
import { PageLoading } from "@/components/page-loading"
import { ExploreMap } from "@/components/points/explore-map"
import { getMapPoints } from "@/lib/queries"

export default function ExplorePage() {
  return (
    <Suspense fallback={<PageLoading className="h-[calc(100dvh-3.5rem)]" />}>
      <Explore />
    </Suspense>
  )
}

async function Explore() {
  const points = await getMapPoints()
  return <ExploreMap points={points} />
}
