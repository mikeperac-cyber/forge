import type { RunStatus } from "./engine/types";

/**
 * One place that maps status to how it looks, so a node on the canvas, a row in
 * run history, a bar on the timeline and a dot in the status bar can never
 * disagree about what "failed" means.
 */
export interface StatusStyle {
  label: string;
  /** Tailwind classes for a filled badge. */
  badge: string;
  /** Border colour for canvas nodes. */
  border: string;
  /** Solid dot. */
  dot: string;
  text: string;
}

const STYLES: Record<RunStatus, StatusStyle> = {
  pending: {
    label: "Pending",
    badge: "bg-idle-soft text-idle",
    border: "border-line",
    dot: "bg-idle",
    text: "text-idle",
  },
  running: {
    label: "Running",
    badge: "bg-busy-soft text-busy",
    border: "border-busy",
    dot: "bg-busy",
    text: "text-busy",
  },
  succeeded: {
    label: "Succeeded",
    badge: "bg-ok-soft text-ok",
    border: "border-ok",
    dot: "bg-ok",
    text: "text-ok",
  },
  failed: {
    label: "Failed",
    badge: "bg-bad-soft text-bad",
    border: "border-bad",
    dot: "bg-bad",
    text: "text-bad",
  },
  skipped: {
    label: "Skipped",
    badge: "bg-idle-soft text-ink-faint",
    border: "border-line",
    dot: "bg-ink-faint",
    text: "text-ink-faint",
  },
  cancelled: {
    label: "Cancelled",
    badge: "bg-warn-soft text-warn",
    border: "border-warn",
    dot: "bg-warn",
    text: "text-warn",
  },
};

export function statusStyle(status: string): StatusStyle {
  return STYLES[status as RunStatus] ?? STYLES.pending;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/** `diff` is assumed non-negative — callers pick the sign, this just buckets it. */
function bucketMagnitude(diff: number): string | null {
  if (diff < 60_000) return null;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function formatRelative(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const bucket = bucketMagnitude(Date.now() - then.getTime());
  return bucket ? `${bucket} ago` : "just now";
}

/** The future-facing twin of `formatRelative` — "in 15m", not "-15m ago". */
export function formatUntil(date: Date | string): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const diff = then.getTime() - Date.now();
  if (diff <= 0) return "any moment";
  const bucket = bucketMagnitude(diff);
  return bucket ? `in ${bucket}` : "any moment";
}
