"use client";

import { cn } from "@/lib/cn";
import { formatDuration, statusStyle } from "@/lib/status";

export interface TimelineNode {
  nodeId: string;
  label: string;
  kind: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * A Gantt of node spans.
 *
 * Its whole job is to make concurrency visible: overlapping bars mean the
 * scheduler genuinely ran those steps in parallel, staggered bars mean it
 * didn't. A status list alone can't show you that.
 */
export function RunTimeline({
  nodes,
  runStart,
  runEnd,
  selectedNodeId,
  onSelect,
}: {
  nodes: TimelineNode[];
  runStart: string;
  runEnd: string | null;
  selectedNodeId?: string | null;
  onSelect?: (nodeId: string) => void;
}) {
  const start = new Date(runStart).getTime();

  // A still-running run has no end timestamp. Reading the wall clock here would
  // make render impure — the span would differ every time React re-rendered,
  // so bars would jitter. Fall back to the latest timestamp the run actually
  // recorded, which is stable for a given set of props.
  const end = runEnd
    ? new Date(runEnd).getTime()
    : nodes.reduce((latest, node) => {
        const stamp = node.finishedAt ?? node.startedAt;
        return stamp ? Math.max(latest, new Date(stamp).getTime()) : latest;
      }, start);

  // Guard against a zero-width span on runs that finish within the same ms.
  const total = Math.max(end - start, 1);

  if (nodes.every((n) => !n.startedAt)) {
    return (
      <p className="px-4 py-3 text-[12px] text-ink-faint">
        No steps executed — every node was skipped.
      </p>
    );
  }

  return (
    <div className="p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-ink-faint">
        <span>0ms</span>
        <span>{formatDuration(total)}</span>
      </div>

      <div className="space-y-0.5">
        {nodes.map((node) => {
          const style = statusStyle(node.status);
          const nodeStart = node.startedAt
            ? new Date(node.startedAt).getTime()
            : start;
          const nodeEnd = node.finishedAt
            ? new Date(node.finishedAt).getTime()
            : end;
          const left = ((nodeStart - start) / total) * 100;
          // Floor the width so instant steps stay visible instead of vanishing.
          const width = Math.max(((nodeEnd - nodeStart) / total) * 100, 0.8);
          const isSelected = node.nodeId === selectedNodeId;

          return (
            <button
              key={node.nodeId}
              type="button"
              onClick={() => onSelect?.(node.nodeId)}
              className={cn(
                "flex w-full items-center gap-2 rounded px-1 py-0.5 text-left",
                isSelected ? "bg-accent-soft" : "hover:bg-line/40",
              )}
            >
              <span
                className={cn(
                  "w-36 shrink-0 truncate text-[11.5px]",
                  isSelected ? "text-accent" : "text-ink-soft",
                )}
              >
                {node.label}
              </span>

              <span className="relative h-4 flex-1 rounded bg-sunken">
                <span
                  className={cn(
                    "absolute top-0.5 h-3 rounded-sm",
                    style.dot,
                    !node.startedAt && "opacity-30",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${node.label} — ${style.label}`}
                />
              </span>

              <span className="w-16 shrink-0 text-right font-mono text-[11px] text-ink-faint">
                {node.startedAt && node.finishedAt
                  ? formatDuration(nodeEnd - nodeStart)
                  : style.label.toLowerCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
