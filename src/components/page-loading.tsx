import { Loader2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

/** Suspense fallback for a page's data. */
export function PageLoading({ className }: { className?: string }) {
  return (
    <div className={cn("grid flex-1 place-items-center p-10 text-muted-foreground", className)}>
      <Loader2Icon className="size-5 animate-spin" aria-label="Loading" />
    </div>
  )
}
