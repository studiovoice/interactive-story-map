import { PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointsTable } from "@/components/points/points-table"
import { Button } from "@/components/ui/button"
import { getPointUsage, getPoints } from "@/lib/queries"

export const metadata: Metadata = { title: "Points" }

export default function PointsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Points"
        description="Every upload: a photo, video, audio clip or note at a place and time. Points can be used in any number of stories."
        actions={
          <Button asChild>
            <Link href="/points/new">
              <PlusIcon /> New point
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageLoading />}>
        <Points />
      </Suspense>
    </PageContainer>
  )
}

async function Points() {
  const [points, usage] = await Promise.all([getPoints(), getPointUsage()])
  return <PointsTable points={points} usage={usage} />
}
