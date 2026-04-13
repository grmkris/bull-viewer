"use client"

import { useEffect } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useBullViewer } from "../context.tsx"
import { StatusDot } from "../shell/StatusDot.tsx"
import { Link } from "@tanstack/react-router"

interface JobDrawerProps {
  queueName: string
  jobId: string | undefined
  onClose: () => void
}

export function JobDrawer({ queueName, jobId, onClose }: JobDrawerProps) {
  const { api, scopes } = useBullViewer()
  const queryClient = useQueryClient()

  const open = jobId !== undefined

  const { data, error } = useQuery({
    queryKey: ["queues", queueName, "jobs", jobId],
    queryFn: () => api.getJob(queueName, jobId!),
    enabled: open,
    refetchInterval: 3000,
  })

  const job = data?.job

  // Keyboard: esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  async function runAction(action: "retry" | "remove" | "promote") {
    if (!jobId) return
    try {
      await api.jobAction(queueName, jobId, action)
      toast.success(`${action} ${jobId} ok`)
      if (action === "remove") onClose()
      queryClient.invalidateQueries({ queryKey: ["queues", queueName, "jobs"] })
      queryClient.invalidateQueries({ queryKey: ["queues"] })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const copyId = () => {
    if (!jobId) return
    navigator.clipboard.writeText(jobId).then(
      () => toast.success("id copied"),
      () => toast.error("copy failed"),
    )
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      direction="right"
    >
      <DrawerContent
        className="bg-background data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:top-0 data-[vaul-drawer-direction=right]:bottom-0 data-[vaul-drawer-direction=right]:w-full data-[vaul-drawer-direction=right]:max-w-[560px] data-[vaul-drawer-direction=right]:rounded-none data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:flex"
      >
        <DrawerTitle className="sr-only">job detail</DrawerTitle>
        <DrawerDescription className="sr-only">
          {job ? `job ${job.id} in ${queueName}` : "loading"}
        </DrawerDescription>

        {error && (
          <div className="p-6 font-mono text-sm text-status-failed">
            {error instanceof Error ? error.message : String(error)}
          </div>
        )}

        {!job && !error && (
          <div className="p-6 font-mono text-sm text-muted-foreground">loading…</div>
        )}

        {job && (
          <div className="flex h-full flex-col">
            <div className="bg-card flex items-start gap-3 border-b p-4">
              <StatusDot state={job.state} size={12} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyId}
                    className="font-mono text-sm font-semibold hover:underline"
                  >
                    #{job.id}
                  </button>
                  <CopyIcon className="size-3 text-muted-foreground" />
                </div>
                <div className="font-mono text-xs text-muted-foreground truncate">
                  {job.name}
                </div>
                <div className="mt-2 flex items-center gap-2 font-sans text-[10px] tracking-wide uppercase text-muted-foreground">
                  <span>state</span>
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {job.state}
                  </Badge>
                  <span>·</span>
                  <span>attempts</span>
                  <span className="font-mono text-foreground">{job.attemptsMade}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Link
                  to="/queues/$name/jobs/$id"
                  params={{ name: queueName, id: job.id }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="open as page"
                >
                  <ExternalLinkIcon className="size-4" />
                </Link>
                <button type="button" onClick={onClose} aria-label="close">
                  <XIcon className="size-4 text-muted-foreground hover:text-foreground transition-colors" />
                </button>
              </div>
            </div>

            <div className="border-b bg-card px-4 py-2 flex gap-2">
              {scopes.has("retry") && (
                <Button variant="outline" size="sm" onClick={() => runAction("retry")}>
                  retry
                </Button>
              )}
              {scopes.has("promote") && job.state === "delayed" && (
                <Button variant="outline" size="sm" onClick={() => runAction("promote")}>
                  promote
                </Button>
              )}
              {scopes.has("remove") && (
                <Button variant="destructive" size="sm" onClick={() => runAction("remove")}>
                  remove
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="space-y-4 p-4">
                <Section label="data">
                  <pre className="bg-muted/30 overflow-auto rounded-sm p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(job.data, null, 2)}
                  </pre>
                </Section>

                {job.returnValue !== undefined && job.returnValue !== null && (
                  <Section label="return value">
                    <pre className="bg-muted/30 overflow-auto rounded-sm p-3 font-mono text-[11px] leading-relaxed">
                      {JSON.stringify(job.returnValue, null, 2)}
                    </pre>
                  </Section>
                )}

                {job.failedReason && (
                  <Section label="failure">
                    <pre className="bg-status-failed/10 text-status-failed overflow-auto rounded-sm p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                      {job.failedReason}
                      {job.stacktrace.length > 0 && "\n\n" + job.stacktrace.join("\n")}
                    </pre>
                  </Section>
                )}

                <Section label="metadata">
                  <dl className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <Meta label="created" value={new Date(job.timestamp).toISOString()} />
                    {job.processedOn && (
                      <Meta label="processed" value={new Date(job.processedOn).toISOString()} />
                    )}
                    {job.finishedOn && (
                      <Meta label="finished" value={new Date(job.finishedOn).toISOString()} />
                    )}
                  </dl>
                </Section>
              </div>
            </ScrollArea>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 font-sans text-[10px] tracking-wide uppercase">
        {label}
      </div>
      {children}
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-sans">{label}</span>
      <span className="text-foreground truncate">{value}</span>
    </div>
  )
}
