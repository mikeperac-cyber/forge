"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RunTimeline, type TimelineNode } from "./RunTimeline";
import { LogList } from "@/components/console/LogList";
import { useRunStream } from "@/components/console/use-run-stream";
import { Icon } from "@/components/shell/Icon";
import { cn } from "@/lib/cn";
import { formatDuration, statusStyle } from "@/lib/status";

export interface NodeRunAttempt {
  attempt: number;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export interface NodeRunDetail extends TimelineNode {
  input: unknown;
  output: unknown;
  error: string | null;
  /** One entry per attempt, oldest first. Length 1 for a node that never retried. */
  attempts: NodeRunAttempt[];
}

/**
 * Timeline, node inspector and log stream, sharing one selection *and* one
 * subscription.
 *
 * `NodeRun.input` and `NodeRun.output` have been persisted since the first
 * build and were never shown anywhere — which made "why did this step produce
 * that?" unanswerable without opening Prisma Studio.
 */
export function RunDetail({
  runId,
  nodes,
  runStart,
  runEnd,
  isLive,
}: {
  runId: string;
  nodes: NodeRunDetail[];
  runStart: string;
  runEnd: string | null;
  /** The run was still going when the server rendered this. */
  isLive: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const stream = useRunStream(runId);
  const refreshed = useRef(false);

  /**
   * Node rows are server-rendered, so a run that was in flight at page load
   * would show a permanently half-finished timeline. Refresh once the stream
   * reports the run settled, which is when the database actually has the rest.
   */
  useEffect(() => {
    if (!isLive || refreshed.current || !stream.status) return;
    refreshed.current = true;
    // Let the persistence chain drain before re-reading.
    const timer = setTimeout(() => router.refresh(), 600);
    return () => clearTimeout(timer);
  }, [isLive, stream.status, router]);

  // Live statuses paint over the server snapshot so colours track reality even
  // before the refresh lands.
  const displayNodes = useMemo(
    () =>
      nodes.map((node) => ({
        ...node,
        status: stream.nodeStatuses[node.nodeId] ?? node.status,
      })),
    [nodes, stream.nodeStatuses],
  );

  const selected = displayNodes.find((n) => n.nodeId === selectedId) ?? null;
  const running = isLive && !stream.status;

  return (
    <>
      <section className="border-b border-line">
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Timeline
          </h2>
          {running && (
            <span className="flex items-center gap-1.5 text-[11px] text-busy">
              <span className="size-1.5 rounded-full bg-busy forge-pulse" />
              running
            </span>
          )}
        </div>
        <RunTimeline
          nodes={displayNodes}
          runStart={runStart}
          runEnd={runEnd}
          selectedNodeId={selectedId}
          onSelect={(id) =>
            setSelectedId((current) => (current === id ? null : id))
          }
        />
      </section>

      {selected && (
        <section className="border-b border-line bg-panel">
          <header className="flex items-center gap-2 px-4 py-2">
            <h2 className="text-[12.5px] font-semibold">{selected.label}</h2>
            <code className="rounded bg-line px-1.5 py-0.5 font-mono text-[10.5px] text-ink-faint">
              {selected.kind}
            </code>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                statusStyle(selected.status).badge,
              )}
            >
              {statusStyle(selected.status).label}
            </span>
            <span className="font-mono text-[11px] text-ink-faint">
              {selected.startedAt && selected.finishedAt
                ? formatDuration(
                    new Date(selected.finishedAt).getTime() -
                      new Date(selected.startedAt).getTime(),
                  )
                : "—"}
            </span>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close node detail"
              className="ml-auto rounded p-1 text-ink-faint hover:bg-line hover:text-ink"
            >
              <Icon name="X" className="size-3.5" />
            </button>
          </header>

          {selected.error && (
            <p className="mx-4 mb-2 rounded border border-bad/30 bg-bad-soft px-2.5 py-1.5 text-[12px] text-bad">
              {selected.error}
            </p>
          )}

          {selected.attempts.length > 1 && (
            <div className="mx-4 mb-2 space-y-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
                Attempts
              </h3>
              <ul className="space-y-1">
                {selected.attempts.map((attempt) => (
                  <li
                    key={attempt.attempt}
                    className="flex items-center gap-2 rounded border border-line bg-sunken px-2 py-1 text-[11.5px]"
                  >
                    <span className="text-ink-faint">#{attempt.attempt}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        statusStyle(attempt.status).badge,
                      )}
                    >
                      {statusStyle(attempt.status).label}
                    </span>
                    <span className="font-mono text-ink-faint">
                      {attempt.startedAt && attempt.finishedAt
                        ? formatDuration(
                            new Date(attempt.finishedAt).getTime() -
                              new Date(attempt.startedAt).getTime(),
                          )
                        : "—"}
                    </span>
                    {attempt.error && (
                      <span
                        className="min-w-0 flex-1 truncate text-bad"
                        title={attempt.error}
                      >
                        {attempt.error}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 px-4 pb-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
            <Payload label="Input" value={selected.input} />
            <Payload label="Output" value={selected.output} />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
            Output
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent"
            >
              {selected.label}
              <Icon name="X" className="size-3" />
            </button>
          )}
          <span className="ml-auto text-[11px] text-ink-faint">
            {stream.logs.length} lines
          </span>
        </div>
        <LogList
          logs={stream.logs}
          nodeId={selectedId}
          replaying={stream.replaying}
          className="max-h-[50vh]"
        />
      </section>
    </>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === "object" && Object.keys(value as object).length === 0);

  return (
    <div className="min-w-0">
      <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">
        {label}
      </h3>
      <pre className="max-h-48 overflow-auto rounded border border-line bg-sunken p-2 font-mono text-[11px] leading-[1.5] text-ink-soft">
        {empty ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
