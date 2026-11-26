"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * A muted video thumbnail that only loads once it's near the viewport. A `<video preload="metadata">`
 * fetches part of the file as soon as it renders, so a list of them would download every video up
 * front. Until then it's an empty box of the same size.
 */
export function LazyVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [near, setNear] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: "200px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [near])

  if (near) {
    // #t: show a frame from just after the start instead of a blank first frame.
    return <video src={`${src}#t=0.1`} preload="metadata" muted className={className} />
  }
  return <span ref={ref} className={cn("block", className)} />
}
