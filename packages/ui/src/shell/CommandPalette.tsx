"use client"

import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  ContrastIcon,
  GaugeIcon,
  ListIcon,
  RefreshCcwIcon,
  SettingsIcon,
} from "lucide-react"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { useShortcuts } from "../hooks/use-shortcuts.ts"
import { useTheme } from "../hooks/use-theme.ts"
import { useDensity } from "../hooks/use-density.ts"
import { useBullViewer } from "../context.tsx"

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { setTheme, resolved } = useTheme()
  const { toggleDensity } = useDensity()
  const { api } = useBullViewer()

  useShortcuts({
    "$mod+k": () => setOpen((v) => !v),
    "$mod+K": () => setOpen((v) => !v),
    "Escape": () => setOpen(false),
  })

  const close = () => setOpen(false)
  const run = (fn: () => void) => () => {
    close()
    fn()
  }

  // Touch unused-var lint for `api`; will be wired to live job search in M2
  void api

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search queues, jobs, and actions"
    >
      <CommandInput placeholder="Search queues, jobs, actions…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Suggestions">
          <CommandItem onSelect={run(() => navigate({ to: "/" }))}>
            <ArrowRightIcon />
            <span>Go to all queues</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigate">
          <CommandItem onSelect={run(() => navigate({ to: "/" }))}>
            <ListIcon />
            <span>Queues</span>
            <CommandShortcut>g q</CommandShortcut>
          </CommandItem>
          <CommandItem
            disabled
            onSelect={() => {}}
            className="text-muted-foreground"
          >
            <GaugeIcon />
            <span>Metrics — coming in M3</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          <CommandItem
            onSelect={run(() => setTheme(resolved === "dark" ? "light" : "dark"))}
          >
            <ContrastIcon />
            <span>Toggle theme — currently {resolved}</span>
            <CommandShortcut>⌘⇧L</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={run(toggleDensity)}>
            <RefreshCcwIcon />
            <span>Toggle density</span>
            <CommandShortcut>⌘⇧D</CommandShortcut>
          </CommandItem>
          <CommandItem disabled onSelect={() => {}}>
            <SettingsIcon />
            <span>Keyboard shortcuts — coming in M2</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

/** Small helper hook to surface the current open state (M2 will use it for header pill). */
export function useCommandPaletteToggle() {
  // Currently unused — placeholder for M2 wiring.
  useEffect(() => {}, [])
}
