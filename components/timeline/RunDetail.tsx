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
      <section className="border-line border-b">
        <div className="flex items-center gap-2 px-4 pt-3">
          <h2 className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
            Timeline
          </h2>
          {running && (
            <span className="text-busy flex items-center gap-1.5 text-[11px]">
              <span className="bg-busy forge-pulse size-1.5 rounded-full" />
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
        <section className="border-line bg-panel border-b">
          <header className="flex items-center gap-2 px-4 py-2">
            <h2 className="text-[12.5px] font-semibold">{selected.label}</h2>
            <code className="bg-line text-ink-faint rounded px-1.5 py-0.5 font-mono text-[10.5px]">
              {selected.kind}
            </code>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                statusStyle(selected.status).badge,
              )}
            >
              {statusStyle(selected.status).label}
            </span>
            <span className="text-ink-faint font-mono text-[11px]">
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
              className="text-ink-faint hover:bg-line hover:text-ink ml-auto rounded p-1"
            >
              <Icon name="X" className="size-3.5" />
            </button>
          </header>

          {selected.error && (
            <p className="border-bad/30 bg-bad-soft text-bad mx-4 mb-2 rounded border px-2.5 py-1.5 text-[12px]">
              {selected.error}
            </p>
          )}

          {selected.attempts.length > 1 && (
            <div className="mx-4 mb-2 space-y-1">
              <h3 className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
                Attempts
              </h3>
              <ul className="space-y-1">
                {selected.attempts.map((attempt) => (
                  <li
                    key={attempt.attempt}
                    className="border-line bg-sunken flex items-center gap-2 rounded border px-2 py-1 text-[11.5px]"
                  >
                    <span className="text-ink-faint">#{attempt.attempt}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                        statusStyle(attempt.status).badge,
                      )}
                    >
                      {statusStyle(attempt.status).label}
                    </span>
                    <span className="text-ink-faint font-mono">
                      {attempt.startedAt && attempt.finishedAt
                        ? formatDuration(
                            new Date(attempt.finishedAt).getTime() -
                              new Date(attempt.startedAt).getTime(),
                          )
                        : "—"}
                    </span>
                    {attempt.error && (
                      <span
                        className="text-bad min-w-0 flex-1 truncate"
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

          <div className="grid [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] gap-3 px-4 pb-3">
            <Payload label="Input" value={selected.input} />
            <Payload label="Output" value={selected.output} />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <h2 className="text-ink-faint text-[11px] font-semibold tracking-wider uppercase">
            Output
          </h2>
          {selected && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="bg-accent-soft text-accent flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
            >
              {selected.label}
              <Icon name="X" className="size-3" />
            </button>
          )}
          <span className="text-ink-faint ml-auto text-[11px]">
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
      <h3 className="text-ink-faint mb-1 text-[11px] font-semibold tracking-wider uppercase">
        {label}
      </h3>
      <pre className="border-line bg-sunken text-ink-soft max-h-48 overflow-auto rounded border p-2 font-mono text-[11px] leading-[1.5]">
        {empty ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
