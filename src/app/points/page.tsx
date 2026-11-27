import { PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointsTable } from "@/components/points/points-table"
import { Button } from "@/components/ui/button"
import { requireStaff } from "@/lib/auth/page"
import { listStaff } from "@/lib/auth/staff"
import { DEFAULT_PAGE_SIZE } from "@/lib/data/repository"
import { pointSources, type PointSource } from "@/lib/domain/schema"
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
  const from = pointSources.find((s) => s === params.from) as PointSource | undefined
  const by = typeof params.by === "string" && params.by ? params.by : undefined
  const viewer = await requireStaff(`/points${query(params)}`)
  const [{ rows, total }, staff] = await Promise.all([
    getPointPage({ q, page, source: from, createdBy: by }),
    listStaff(),
  ])
  return (
    <PointsTable
      rows={rows}
      total={total}
      filters={{ q, from, by }}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      role={viewer.role}
      staff={staff.map(({ id, name }) => ({ id, name }))}
    />
  )
}

function query(params: Record<string, string | string[] | undefined>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (typeof v === "string") s.set(k, v)
  return s.size ? `?${s}` : ""
}
