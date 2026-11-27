import { LockIcon } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Shown on a staff page the signed-in person's role doesn't cover. */
export function NotAllowed({ what = "this page" }: { what?: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockIcon />
        </EmptyMedia>
        <EmptyTitle>You don&apos;t have access to {what}</EmptyTitle>
        <EmptyDescription>Your role doesn&apos;t include it. Ask an admin if you need it.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild variant="outline">
          <Link href="/">Back to the map</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
