"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

/** MapLibre paint values can't use CSS variables, so resolve theme tokens to rgb(). */
function resolve(name: string): string {
  const el = document.createElement("i")
  el.style.color = `var(${name})`
  document.body.append(el)
  const col = getComputedStyle(el).color
  el.remove()
  const ctx = document.createElement("canvas").getContext("2d")
  if (!ctx) return col
  ctx.fillStyle = col
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `rgb(${r},${g},${b})`
}

const FALLBACK = { primary: "rgb(24,24,27)", background: "rgb(255,255,255)", muted: "rgb(113,113,122)" }

export function useThemeColors() {
  const { resolvedTheme } = useTheme()
  const [colors, setColors] = useState(FALLBACK)
  useEffect(() => {
    // Wait a frame so the theme class has been applied before reading tokens.
    const raf = requestAnimationFrame(() =>
      setColors({
        primary: resolve("--primary"),
        background: resolve("--background"),
        muted: resolve("--muted-foreground"),
      }),
    )
    return () => cancelAnimationFrame(raf)
  }, [resolvedTheme])
  return colors
}
