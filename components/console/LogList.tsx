"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { LogEntry } from "./use-run-stream";

/**
 * Presentational log view. Deliberately owns no subscription: whoever renders
 * it already has the stream, and a second `EventSource` for the same run would
 * replay the whole history twice.
 */
export function LogList({
  logs,
  nodeId,
  replaying,
  className,
}: {
  logs: LogEntry[];
  /** Narrow to one node's output. Null shows everything. */
  nodeId?: string | null;
  replaying: boolean;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const lines = nodeId ? logs.filter((line) => line.nodeId === nodeId) : logs;

  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [lines.length]);

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        // Stop following the tail the moment the reader scrolls up.
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
      className={cn(
        "overflow-y-auto bg-sunken px-4 py-2 font-mono text-[11.5px] leading-[1.6]",
        className,
      )}
    >
      {lines.length === 0 ? (
        <p className="text-ink-faint">
          {replaying
            ? "Loading output…"
            : nodeId
              ? "This step produced no output."
              : "This run produced no output."}
        </p>
      ) : (
        lines.map((line) => (
          <div key={line.seq} className="flex gap-2">
            <span className="shrink-0 select-none text-ink-faint">
              {new Date(line.at).toLocaleTimeString(undefined, { hour12: false })}
            </span>
            <span
              className={cn(
                "whitespace-pre-wrap break-all",
                line.stream === "stderr" && "text-bad",
                line.stream === "system" && "text-ink-faint",
              )}
            >
              {line.text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
