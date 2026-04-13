"use client";

import { Link } from "@tanstack/react-router";
import {
  GaugeIcon,
  ListIcon,
  SearchIcon,
  SettingsIcon,
  WorkflowIcon,
} from "lucide-react";

interface TabProps {
  label: string;
  to?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}

function Tab({ label, to, icon, onClick, primary }: TabProps) {
  const inner = (
    <>
      <span
        className={
          primary
            ? "border-signal/30 bg-signal/15 text-signal flex size-9 items-center justify-center rounded-full border [&>svg]:size-4"
            : "text-muted-foreground flex size-7 items-center justify-center [&>svg]:size-4"
        }
      >
        {icon}
      </span>
      <span className="font-sans text-[10px] tracking-wide uppercase text-muted-foreground">
        {label}
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
        activeProps={{ className: "[&_span:last-child]:text-foreground" }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5"
    >
      {inner}
    </button>
  );
}

export function MobileTabBar() {
  return (
    <nav
      aria-label="bottom navigation"
      className="bg-card fixed inset-x-0 bottom-0 z-30 flex h-14 items-stretch border-t md:hidden"
    >
      <Tab to="/" label="Queues" icon={<ListIcon />} />
      <Tab to="/" label="Jobs" icon={<WorkflowIcon />} />
      <Tab
        primary
        label="Cmd-K"
        icon={<SearchIcon />}
        onClick={() => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true })
          );
        }}
      />
      <Tab to="/" label="Metrics" icon={<GaugeIcon />} />
      <Tab to="/" label="Me" icon={<SettingsIcon />} />
    </nav>
  );
}
