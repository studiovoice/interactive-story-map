import { PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointsTable } from "@/components/points/points-table"
import { Button } from "@/components/ui/button"
import { DEFAULT_PAGE_SIZE } from "@/lib/data/repository"
import { getPointPage } from "@/lib/queries"

export const metadata: Metadata = { title: "Points" }

export default function PointsPage({ searchParams }: PageProps<"/points">) {
  return (
    <PageContainer>
      <PageHeader
        title="Points"
        description="Every upload: photos, videos, audio clips or a note at a place and time. Points can be used in any number of stories."
        actions={
          <Button asChild>
            <Link href="/points/new">
              <PlusIcon /> New point
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<PageLoading />}>
        <Points searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  )
}

async function Points({ searchParams }: Pick<PageProps<"/points">, "searchParams">) {
  const params = await searchParams
  const q = typeof params.q === "string" ? params.q : ""
  const page = Math.max(1, Math.floor(Number(params.page)) || 1)
  const { rows, total } = await getPointPage(q, page)
  return <PointsTable rows={rows} total={total} q={q} page={page} pageSize={DEFAULT_PAGE_SIZE} />
}
