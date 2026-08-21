"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { getExecutor } from "@/lib/engine/registry";
import { statusStyle } from "@/lib/status";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/shell/Icon";
import type { RunStatus } from "@/lib/engine/types";

export interface NodeCardData extends Record<string, unknown> {
  kind: string;
  label?: string;
  config: Record<string, unknown>;
  retry?: { maxAttempts?: number; retryDelayMs?: number };
  status?: RunStatus;
  progress?: number;
}

const ACCENTS: Record<string, string> = {
  emerald:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  fuchsia:
    "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  violet:
    "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  sky: "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

/**
 * One component renders every node kind: the executor's own declaration
 * supplies the icon, accent and port list, so a new kind appears on the canvas
 * correctly without touching this file.
 */
export function NodeCard({ data, selected }: NodeProps) {
  const node = data as NodeCardData;
  const executor = getExecutor(node.kind);
  const status = node.status ?? "pending";
  const style = statusStyle(status);
  const isRunning = status === "running";

  if (!executor) {
    return (
      <div className="border-bad bg-bad-soft text-bad rounded-md border px-3 py-2 text-[12px]">
        Unknown node kind: {node.kind}
      </div>
    );
  }

  const summary = summarise(node.kind, node.config);

  return (
    <div
      className={cn(
        "bg-panel w-56 rounded-md border shadow-sm transition-colors",
        selected ? "border-accent ring-accent ring-1" : "border-line",
        status !== "pending" && style.border,
        isRunning && "forge-pulse",
      )}
    >
      {executor.ports.inputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="target"
          position={Position.Left}
          style={{ top: 34 + index * 16 }}
          title={port.label}
        />
      ))}

      <header className="border-line flex items-center gap-2 border-b px-2.5 py-1.5">
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded",
            ACCENTS[executor.accent] ?? ACCENTS.slate,
          )}
        >
          <Icon name={executor.icon} className="size-3" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">
          {node.label || executor.label}
        </span>
        {status !== "pending" && (
          <span
            className={cn("size-1.5 shrink-0 rounded-full", style.dot)}
            title={style.label}
          />
        )}
      </header>

      <div className="px-2.5 py-1.5">
        <p
          className="text-ink-faint truncate font-mono text-[11px]"
          title={summary}
        >
          {summary}
        </p>

        {isRunning && node.progress !== undefined && (
          <div className="bg-line mt-1.5 h-0.5 overflow-hidden rounded-full">
            <div
              className="bg-busy h-full transition-all duration-200"
              style={{ width: `${node.progress}%` }}
            />
          </div>
        )}
      </div>

      {executor.ports.outputs.length > 0 && (
        <footer className="border-line flex flex-col gap-0.5 border-t px-2.5 py-1">
          {executor.ports.outputs.map((port) => (
            <span
              key={port.id}
              className="text-ink-faint text-right text-[10px] leading-tight"
            >
              {port.label}
            </span>
          ))}
        </footer>
      )}

      {executor.ports.outputs.map((port, index) => (
        <Handle
          key={port.id}
          id={port.id}
          type="source"
          position={Position.Right}
          style={{
            top: `calc(100% - ${10 + (executor.ports.outputs.length - 1 - index) * 14}px)`,
          }}
          title={port.label}
        />
      ))}
    </div>
  );
}

/** A one-line gist of the config, so the graph is readable without opening nodes. */
function summarise(kind: string, config: Record<string, unknown>): string {
  const text = (key: string) => String(config[key] ?? "").trim();
  switch (kind) {
    case "shell":
      return text("command") || "no command";
    case "http":
      return `${text("method") || "GET"} ${text("url") || "no url"}`;
    case "ai":
      return text("prompt") || "no prompt";
    case "transform":
      return text("expression") || "input";
    case "branch":
      return text("condition") || "no condition";
    case "start":
      return text("payload") || "{}";
    case "end":
      return text("label") || "Done";
    default:
      return "";
  }
}
