"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { statusStyle } from "@/lib/status";
import { Icon } from "@/components/shell/Icon";
import type { Problem } from "@/lib/engine/validate";
import type { RunStreamState } from "./use-run-stream";
import type { GraphNode } from "@/lib/engine/types";

type PanelTab = "console" | "problems";

/** Upper bound on rendered lines; the buffer itself is capped separately. */
const MAX_RENDERED = 1500;

interface Props {
  stream: RunStreamState;
  problems: Problem[];
  nodes: GraphNode[];
  runId: string | null;
  onCancel: () => void;
  onSelectNode: (nodeId: string) => void;
}

export function RunConsole({
  stream,
  problems,
  nodes,
  runId,
  onCancel,
  onSelectNode,
}: Props) {
  const [tab, setTab] = useState<PanelTab>("console");
  const [filter, setFilter] = useState<string>("all");
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const labels = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.data.label ?? n.kind])),
    [nodes],
  );

  const { visible, dropped } = useMemo(() => {
    const filtered =
      filter === "all"
        ? stream.logs
        : stream.logs.filter((line) => line.nodeId === filter);

    // Rendering every line of a chatty run puts thousands of nodes in the DOM
    // and makes scrolling crawl. Only the tail is interesting anyway.
    return filtered.length > MAX_RENDERED
      ? {
          visible: filtered.slice(-MAX_RENDERED),
          dropped: filtered.length - MAX_RENDERED,
        }
      : { visible: filtered, dropped: 0 };
  }, [stream.logs, filter]);

  // Follow the tail, but stop fighting the user the moment they scroll up.
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [visible.length]);

  const errorCount = problems.filter((p) => p.severity === "error").length;
  const isLive = runId !== null && stream.status === null;

  return (
    <div className="bg-panel flex h-full flex-col">
      <header className="border-line flex h-8 shrink-0 items-center gap-1 border-b px-2">
        <TabButton active={tab === "console"} onClick={() => setTab("console")}>
          Console
          {stream.logs.length > 0 && (
            <span className="text-ink-faint ml-1">{stream.logs.length}</span>
          )}
        </TabButton>
        <TabButton
          active={tab === "problems"}
          onClick={() => setTab("problems")}
        >
          Problems
          {problems.length > 0 && (
            <span
              className={cn(
                "ml-1 rounded px-1 text-[10px] font-semibold",
                errorCount > 0
                  ? "bg-bad-soft text-bad"
                  : "bg-warn-soft text-warn",
              )}
            >
              {problems.length}
            </span>
          )}
        </TabButton>

        <div className="ml-auto flex items-center gap-2">
          {tab === "console" && stream.logs.length > 0 && (
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="border-line bg-canvas rounded border px-1.5 py-0.5 text-[11.5px] outline-none"
            >
              <option value="all">All nodes</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.data.label ?? node.kind}
                </option>
              ))}
            </select>
          )}

          {isLive ? (
            <button
              type="button"
              onClick={onCancel}
              className="border-line text-bad hover:bg-bad-soft flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px]"
            >
              <Icon name="Square" className="size-3" />
              Cancel
            </button>
          ) : (
            stream.status && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                  statusStyle(stream.status).badge,
                )}
              >
                {statusStyle(stream.status).label}
              </span>
            )
          )}
        </div>
      </header>

      {tab === "console" ? (
        <div
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget;
            pinned.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          }}
          className="bg-sunken min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono text-[11.5px] leading-[1.6]"
        >
          {(dropped > 0 || stream.truncated) && (
            <p className="text-ink-faint mb-1">
              …{" "}
              {dropped > 0
                ? `${dropped} earlier lines hidden`
                : "older output dropped"}
            </p>
          )}
          {visible.length === 0 ? (
            <p className="text-ink-faint">
              {runId
                ? "Waiting for output…"
                : "No run yet. Press Run to start one."}
            </p>
          ) : (
            visible.map((line) => (
              <div key={line.seq} className="flex gap-2">
                <span className="text-ink-faint shrink-0 select-none">
                  {new Date(line.at).toLocaleTimeString(undefined, {
                    hour12: false,
                  })}
                </span>
                {line.nodeId && filter === "all" && (
                  <button
                    type="button"
                    onClick={() => onSelectNode(line.nodeId)}
                    className="text-ink-faint hover:text-accent w-28 shrink-0 truncate text-left"
                  >
                    {labels.get(line.nodeId) ?? line.nodeId}
                  </button>
                )}
                <span
                  className={cn(
                    "break-all whitespace-pre-wrap",
                    line.stream === "stderr" && "text-bad",
                    line.stream === "system" && "text-ink-faint",
                  )}
                >
                  {line.text}
                </span>
              </div>
            ))
          )}
          {stream.error && <p className="text-bad mt-2">✗ {stream.error}</p>}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {problems.length === 0 ? (
            <p className="text-ink-faint px-3 py-3 text-[12px]">
              No problems detected.
            </p>
          ) : (
            problems.map((problem, index) => (
              <button
                key={index}
                type="button"
                onClick={() => problem.nodeId && onSelectNode(problem.nodeId)}
                className="border-line hover:bg-line/40 flex w-full items-start gap-2 border-b px-3 py-1.5 text-left text-[12px]"
              >
                <Icon
                  name={
                    problem.severity === "error" ? "TriangleAlert" : "CircleDot"
                  }
                  className={cn(
                    "mt-0.5 size-3.5 shrink-0",
                    problem.severity === "error" ? "text-bad" : "text-warn",
                  )}
                />
                <span className="text-ink-soft">{problem.message}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-1 text-[12px]",
        active ? "bg-line/60 text-ink" : "text-ink-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
