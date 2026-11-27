import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { NotAllowed } from "@/components/auth/not-allowed"
import { FreshOnNavigate } from "@/components/fresh-on-navigate"
import { PageContainer, PageHeader } from "@/components/page-header"
import { PageLoading } from "@/components/page-loading"
import { PointForm } from "@/components/points/point-form"
import { PointMetadataForm } from "@/components/points/point-metadata-form"
import { requireStaff } from "@/lib/auth/page"
import { can } from "@/lib/auth/permissions"
import { getViewer } from "@/lib/auth/server"
import { getPoint, getMapPoints } from "@/lib/queries"

export async function generateMetadata({ params }: PageProps<"/points/[pointId]/edit">): Promise<Metadata> {
  // Staff page: don't put the point's title in the tab for someone who isn't signed in.
  if (!(await getViewer())) return { title: "Edit point" }
  const point = await getPoint((await params).pointId)
  return { title: point ? `Edit ${point.title}` : "Point not found" }
}

export default function EditPointPage({ params }: PageProps<"/points/[pointId]/edit">) {
  return (
    <PageContainer>
      <Suspense fallback={<PageLoading />}>
        <EditPoint params={params} />
      </Suspense>
    </PageContainer>
  )
}

async function EditPoint({ params }: Pick<PageProps<"/points/[pointId]/edit">, "params">) {
  const { pointId } = await params
  const viewer = await requireStaff(`/points/${pointId}/edit`)

  // Admins edit everything; curators only a point's time and tags.
  if (can(viewer.role, { point: ["edit"] })) {
    const [point, points] = await Promise.all([getPoint(pointId), getMapPoints()])
    if (!point) notFound()
    return (
      <>
        <PageHeader title="Edit point" />
        <FreshOnNavigate>
          <PointForm key={point.updatedAt} point={point} context={points} />
        </FreshOnNavigate>
      </>
    )
  }
  if (can(viewer.role, { point: ["edit-metadata"] })) {
    const point = await getPoint(pointId)
    if (!point) notFound()
    return (
      <>
        <PageHeader title="Edit point" description="Set when it happened and how it's tagged." />
        <FreshOnNavigate>
          <PointMetadataForm key={point.updatedAt} point={point} />
        </FreshOnNavigate>
      </>
    )
  }
  return <NotAllowed what="editing points" />
}
