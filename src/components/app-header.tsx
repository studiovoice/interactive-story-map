"use client"

import { FolderOpenIcon, MapIcon, MapPinIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { UserMenu } from "@/components/auth/user-menu"
import { SettingsMenu } from "@/components/settings-menu"
import { useViewerRole } from "@/lib/auth/client"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Map", icon: MapIcon, match: (p: string) => p === "/" },
  { href: "/points", label: "Points", icon: MapPinIcon, staff: true, match: (p: string) => p.startsWith("/points") },
  {
    href: "/collections",
    staff: true,
    label: "Collections",
    icon: FolderOpenIcon,
    match: (p: string) => p.startsWith("/collections") || p.startsWith("/stories"),
  },
]

export function AppHeader({ pathname: fixed }: { pathname?: string }) {
  return fixed === undefined ? <HeaderWithPath /> : <Header pathname={fixed} />
}

function HeaderWithPath() {
  return <Header pathname={usePathname()} />
}

function Header({ pathname }: { pathname: string }) {
  // Points and Collections are staff pages; the public only gets the map (for now).
  const staff = useViewerRole() !== null
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-background/90 px-3 backdrop-blur sm:gap-4 sm:px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
        {/* <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
          <MapPinIcon className="size-4" />
        </span> */}
        <span className="hidden sm:inline">VOICE</span>
      </Link>
      <nav className="flex items-center gap-1">
        {NAV.filter((item) => staff || !item.staff).map(({ href, label, icon: Icon, match }) => (
          <Button
            key={href}
            asChild
            variant="ghost"
            size="sm"
            className={cn("text-muted-foreground", match(pathname) && "bg-muted text-foreground")}
          >
            <Link href={href}>
              <Icon />
              {label}
            </Link>
          </Button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1">
        <SettingsMenu />
        <UserMenu pathname={pathname} />
      </div>
    </header>
  )
}
