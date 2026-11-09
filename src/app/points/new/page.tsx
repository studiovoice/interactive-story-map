import type { Metadata } from "next"
import { Suspense } from "react"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointForm } from "@/components/points/point-form"
import type { LngLat } from "@/lib/domain/schema"
import { getPoints } from "@/lib/queries"
import { FreshOnNavigate } from "@/components/fresh-on-navigate"

export const metadata: Metadata = { title: "New point" }

export default function NewPointPage({ searchParams }: PageProps<"/points/new">) {
  return (
    <PageContainer>
      <PageHeader title="New point" description="A single upload at a place and time." />
      <Suspense fallback={<PageLoading />}>
        <NewPoint searchParams={searchParams} />
      </Suspense>
    </PageContainer>
  )
}

async function NewPoint({ searchParams }: Pick<PageProps<"/points/new">, "searchParams">) {
  const [{ lng, lat }, points] = await Promise.all([searchParams, getPoints()])
  const x = Number(lng),
    y = Number(lat)
  const initialLocation: LngLat | null =
    typeof lng === "string" && typeof lat === "string" && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  return (
    <FreshOnNavigate>
      <PointForm context={points} initialLocation={initialLocation} />
    </FreshOnNavigate>
  )
}
