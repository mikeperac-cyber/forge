import type { z } from "zod";

/**
 * The plugin boundary.
 *
 * `NodeExecutor` is defined once and implemented twice: a simulator today, a
 * real runner later. The scheduler, event bus, persistence layer and UI all sit
 * above this interface and cannot tell the two apart — what differs is only
 * where the bytes come from, never how they flow.
 */

export const RUN_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number];

/** A status no longer subject to change. */
export const TERMINAL_STATUSES: readonly RunStatus[] = [
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
];

export function isTerminal(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export type PortType = "any" | "text" | "json" | "number" | "boolean";

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
}

export type LogStream = "stdout" | "stderr" | "system";

/** What an executor yields as it runs. */
export type RunEvent =
  | { type: "log"; stream: LogStream; text: string }
  | { type: "progress"; pct: number; note?: string }
  | {
      type: "succeeded";
      outputs?: Record<string, unknown>;
      /**
       * Output port ids that are live. Omitted means "all of them" — only
       * branching nodes narrow it, and the scheduler treats edges leaving an
       * unlisted port as dead, skipping whatever depends solely on them.
       */
      taken?: string[];
    }
  | { type: "failed"; error: string };

export interface ExecContext<TConfig> {
  /** Already parsed and narrowed by the executor's own `configSchema`. */
  config: TConfig;
  /** Resolved from upstream node outputs, keyed by this node's input port id. */
  inputs: Record<string, unknown>;
  signal: AbortSignal;
  nodeId: string;
  nodeRunId: string;
  /** Seeded per run so simulated output is reproducible. */
  random: () => number;
}

export interface NodeExecutor<TConfig = unknown> {
  kind: string;
  label: string;
  description: string;
  /** lucide-react icon name. */
  icon: string;
  /** Tailwind colour token used by the canvas node and the explorer. */
  accent: string;
  /**
   * One schema, three jobs: validates config on save, narrows `ctx.config`
   * via `z.infer`, and generates the inspector form by introspection.
   */
  configSchema: z.ZodType<TConfig>;
  ports: { inputs: PortDef[]; outputs: PortDef[] };
  run(ctx: ExecContext<TConfig>): AsyncIterable<RunEvent>;
}

/* ------------------------------------------------------------------ graph */

export interface GraphNode {
  id: string;
  kind: string;
  position: { x: number; y: number };
  data: {
    label?: string;
    config: Record<string, unknown>;
  };
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** Which output port of `source`. Branch nodes use this to pick a path. */
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const EMPTY_GRAPH: WorkflowGraph = { nodes: [], edges: [] };

/* --------------------------------------------------------------- policies */

/**
 * What a node failure does to the rest of the run.
 *
 * `skip-descendants` lets independent branches finish; `stop-run` aborts
 * everything still in flight. Both are defensible, which is why it's a knob.
 */
export type FailurePolicy = "skip-descendants" | "stop-run";

export interface RunOptions {
  concurrency: number;
  onFailure: FailurePolicy;
  /** Total attempts per node, including the first. Fixed for now, not per-node. */
  maxAttempts: number;
  /** Fixed delay before dispatching a retry. Not exponential. */
  retryDelayMs: number;
}

export const DEFAULT_RUN_OPTIONS: RunOptions = {
  concurrency: 4,
  onFailure: "skip-descendants",
  maxAttempts: 2,
  retryDelayMs: 3000,
};
