"use client";

import { ArrowSquareOut, CaretUpDown, Check } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import { useBullViewer } from "../context.tsx";

interface TenantSwitcherProps {
  /**
   * Visual variant. `chip` (default) is the long-form pill with separator
   * + dropdown caret, used inside the sidebar header next to the brand.
   * `compact` is a single-line monospace label + caret, used inside the
   * mobile/collapsed AppHeader where horizontal space is scarce.
   */
  variant?: "chip" | "compact";
  className?: string;
}

/**
 * Tenant picker — the only UI control that crosses Redis instances.
 *
 * Single-tenant degradation: when the server advertises exactly one
 * tenant, the switcher renders as plain text (no clickable trigger, no
 * popover). The viewer still shows "which" tenant it's pointing at, but
 * there's nothing to switch to.
 *
 * Multi-tenant: opens a Command-style popover with each tenant listed,
 * keyboard navigable, filter-as-you-type. The current tenant gets a
 * ● cyan dot + checkmark; others are dim. Footer item links to the
 * Scalar OpenAPI docs for the current tenant — a small surprise that
 * surfaces the REST surface for power users.
 *
 * Keyboard: ⌘⇧T toggles open from anywhere in the app. Arrow keys
 * navigate, Enter selects, Esc dismisses.
 */
export function TenantSwitcher({
  variant = "chip",
  className,
}: TenantSwitcherProps) {
  const { tenants, currentTenant, setTenant, api } = useBullViewer();
  const [open, setOpen] = useState(false);

  // Global ⌘⇧T shortcut. Bound here directly instead of through the
  // shared `useShortcuts` hook because this is the only consumer and the
  // toggle state lives in this component's local state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        (e.key === "T" || e.key === "t")
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Single-tenant: plain label, no chrome
  if (tenants.length <= 1) {
    return (
      <span
        className={cn(
          "text-muted-foreground font-mono text-xs",
          variant === "chip" && "px-1",
          className
        )}
      >
        {currentTenant.label}
      </span>
    );
  }

  const triggerClass =
    variant === "chip"
      ? cn(
          "group flex items-center gap-1.5 rounded-sm border border-transparent px-1.5 py-0.5 font-mono text-xs transition-colors",
          "hover:border-foreground/20 hover:bg-muted/40",
          className
        )
      : cn(
          "text-muted-foreground hover:text-foreground flex items-center gap-1 font-mono text-[11px] transition-colors",
          className
        );

  const docsUrl = `${api.apiBase}/tenants/${encodeURIComponent(currentTenant.id)}/rest`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={triggerClass}
        aria-label={`current tenant ${currentTenant.label}`}
      >
        {variant === "chip" ? (
          <>
            <span className="text-muted-foreground">/</span>
            <span className="text-foreground">{currentTenant.label}</span>
            <CaretUpDown
              size={11}
              weight="bold"
              className="text-muted-foreground group-hover:text-foreground transition-colors"
            />
          </>
        ) : (
          <>
            <span className="text-foreground">{currentTenant.label}</span>
            <CaretUpDown size={10} weight="bold" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-64 p-0 font-mono"
      >
        <Command>
          <div className="flex items-center justify-between border-b px-2 pt-2 pb-1">
            <span className="text-muted-foreground font-sans text-[10px] tracking-wide uppercase">
              tenants
            </span>
            <Kbd className="text-[9px]">⌘⇧T</Kbd>
          </div>
          <CommandInput placeholder="filter…" className="font-mono text-xs" />
          <CommandList>
            <CommandEmpty className="text-muted-foreground py-3 text-center font-mono text-xs">
              no matches
            </CommandEmpty>
            <CommandGroup>
              {tenants.map((t) => {
                const isCurrent = t.id === currentTenant.id;
                return (
                  <CommandItem
                    key={t.id}
                    value={`${t.id} ${t.label}`}
                    onSelect={() => {
                      setTenant(t.id);
                      setOpen(false);
                    }}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    <span
                      className={cn(
                        "text-[8px]",
                        isCurrent ? "text-signal" : "text-muted-foreground/40"
                      )}
                      aria-hidden="true"
                    >
                      ●
                    </span>
                    <span
                      className={cn(
                        "flex-1 truncate",
                        isCurrent ? "text-foreground" : "text-muted-foreground"
                      )}
                    >
                      {t.label}
                    </span>
                    <span className="text-muted-foreground text-[10px] tnum">
                      {t.queueCount}q
                    </span>
                    {isCurrent && (
                      <Check className="text-signal size-3" weight="bold" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="open-api-docs"
                onSelect={() => {
                  window.open(docsUrl, "_blank", "noopener,noreferrer");
                  setOpen(false);
                }}
                className="text-muted-foreground hover:text-foreground flex items-center gap-2 font-mono text-[11px]"
              >
                <ArrowSquareOut size={12} weight="bold" />
                <span>open api docs</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
