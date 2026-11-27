import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"

/**
 * Sends visitors without a session cookie from staff pages to /sign-in (and back afterwards).
 *
 * Convenience only, not security: it only looks for the cookie, not whether the session is valid
 * or the role allows the page. Every staff page checks the viewer itself (`requireStaff`), and
 * every server action checks permissions (`requirePermission`).
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = "/sign-in"
  url.search = new URLSearchParams({ next: request.nextUrl.pathname + request.nextUrl.search }).toString()
  return NextResponse.redirect(url)
}

export const config = {
  // Staff pages. The map ("/"), story playback ("/stories/[id]") and /sign-in stay public.
  matcher: ["/points/:path*", "/collections/:path*", "/stories/:storyId/edit", "/admin/:path*"],
}
