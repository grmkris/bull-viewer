import type { JobSnapshot } from "@bull-viewer/core";
import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { Button } from "../components/ui/button.tsx";
import { useBullViewer } from "../context.tsx";

export function JobDetail() {
  const { name, id } = useParams({ from: "/queues/$name/jobs/$id" });
  const { api, scopes } = useBullViewer();
  const [job, setJob] = useState<JobSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getJob(name, id)
      .then((res) => {
        if (!cancelled) setJob(res.job);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [api, name, id]);

  async function runAction(action: "retry" | "remove") {
    setBusy(true);
    try {
      await api.jobAction(name, id, action);
      if (action === "remove") {
        // navigate back via window since we lack history nav here
        history.back();
      } else {
        const refreshed = await api.getJob(name, id);
        setJob(refreshed.job);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!job)
    return <div className="text-muted-foreground text-sm">Loading…</div>;

  return (
    <div className="space-y-4">
      <div>
        <Link
          to="/queues/$name"
          params={{ name }}
          className="text-muted-foreground hover:text-foreground text-xs"
        >
          ← {name}
        </Link>
        <h1 className="font-heading mt-1 text-lg font-semibold">
          #{job.id}{" "}
          <span className="text-muted-foreground font-mono text-xs">
            {job.name}
          </span>
        </h1>
        <div className="text-muted-foreground mt-1 text-xs">
          state: <span className="text-foreground">{job.state}</span> ·
          attempts: <span className="text-foreground">{job.attemptsMade}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {scopes.has("retry") && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => runAction("retry")}
          >
            Retry
          </Button>
        )}
        {scopes.has("remove") && (
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => runAction("remove")}
          >
            Remove
          </Button>
        )}
      </div>

      <Section label="data">
        <pre className="bg-muted/50 overflow-auto rounded-sm p-3 text-xs">
          {JSON.stringify(job.data, null, 2)}
        </pre>
      </Section>

      {job.returnValue !== undefined && job.returnValue !== null && (
        <Section label="return value">
          <pre className="bg-muted/50 overflow-auto rounded-sm p-3 text-xs">
            {JSON.stringify(job.returnValue, null, 2)}
          </pre>
        </Section>
      )}

      {job.failedReason && (
        <Section label="failure">
          <pre className="bg-destructive/10 text-destructive overflow-auto rounded-sm p-3 text-xs">
            {job.failedReason}
            {job.stacktrace.length > 0 && "\n\n" + job.stacktrace.join("\n")}
          </pre>
        </Section>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-[0.625rem] uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}
