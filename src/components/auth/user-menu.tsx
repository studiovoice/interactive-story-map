"use client"

import { LogInIcon, LogOutIcon, UserIcon } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut, useSession } from "@/lib/auth/client"
import { isRole, roleLabels } from "@/lib/auth/permissions"

/** Header: "Sign in" for the public, or the staff member's menu. */
export function UserMenu({ pathname }: { pathname: string }) {
  const router = useRouter()
  const { data: session, isPending } = useSession()

  // Keep the space while the session loads, so the header doesn't jump.
  if (isPending) return <div className="size-8" aria-hidden />

  if (!session) {
    if (pathname === "/sign-in") return null
    const next = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""
    return (
      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
        <Link href={`/sign-in${next}`}>
          <LogInIcon /> <span className="hidden sm:inline">Sign in</span>
        </Link>
      </Button>
    )
  }

  const { name, email, role } = session.user
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account">
          <UserIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
          {isRole(role) && <div className="mt-1 text-xs text-muted-foreground">{roleLabels[role]}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await signOut()
            router.refresh()
          }}
        >
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
