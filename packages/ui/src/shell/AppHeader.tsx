"use client"

import { Link, useParams } from "@tanstack/react-router"
import { ChevronRightIcon, MoonIcon, RadioIcon, SunIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useTheme } from "../hooks/use-theme.ts"

export function AppHeader() {
  const { resolved, setTheme } = useTheme()
  const params = useParams({ strict: false }) as { name?: string; id?: string }

  return (
    <header className="bg-card sticky top-0 z-20 flex h-12 items-center gap-2 border-b px-3">
      <SidebarTrigger className="md:hidden" />

      <nav
        aria-label="breadcrumb"
        className="flex min-w-0 items-center gap-1.5 font-mono text-[13px]"
      >
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground truncate transition-colors"
        >
          bull-viewer
        </Link>
        {params.name && (
          <>
            <ChevronRightIcon className="text-muted-foreground size-3 shrink-0" />
            <Link
              to="/queues/$name"
              params={{ name: params.name }}
              className="text-foreground truncate font-semibold"
            >
              {params.name}
            </Link>
          </>
        )}
        {params.id && (
          <>
            <ChevronRightIcon className="text-muted-foreground size-3 shrink-0" />
            <span className="text-muted-foreground truncate">#{params.id}</span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        className="bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground hidden h-8 items-center gap-2 rounded-md border px-3 font-sans text-xs transition-colors md:flex"
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true }),
          )
        }}
        aria-label="Open command palette"
      >
        <span>Search…</span>
        <Kbd className="ml-2">⌘K</Kbd>
      </button>

      <div
        aria-label="realtime indicator"
        className="text-muted-foreground hidden items-center gap-1 font-sans text-[10px] tracking-wide uppercase md:flex"
      >
        <RadioIcon className="text-signal size-3" />
        <span>live</span>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
        aria-label="toggle theme"
      >
        {resolved === "dark" ? <SunIcon /> : <MoonIcon />}
      </Button>
    </header>
  )
}
