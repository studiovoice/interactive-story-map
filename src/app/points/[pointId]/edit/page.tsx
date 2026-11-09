import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointForm } from "@/components/points/point-form"
import { getPoint, getPoints } from "@/lib/queries"
import { FreshOnNavigate } from "@/components/fresh-on-navigate"

export async function generateMetadata({ params }: PageProps<"/points/[pointId]/edit">): Promise<Metadata> {
  const point = await getPoint((await params).pointId)
  return { title: point ? `Edit ${point.title}` : "Point not found" }
}

export default function EditPointPage({ params }: PageProps<"/points/[pointId]/edit">) {
  return (
    <PageContainer>
      <PageHeader title="Edit point" />
      <Suspense fallback={<PageLoading />}>
        <EditPoint params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function EditPoint({ params }: Pick<PageProps<"/points/[pointId]/edit">, "params">) {
  const { pointId } = await params
  const [point, points] = await Promise.all([getPoint(pointId), getPoints()])
  if (!point) notFound()
  return (
    <FreshOnNavigate>
      <PointForm key={point.updatedAt} point={point} context={points} />
    </FreshOnNavigate>
  )
}
