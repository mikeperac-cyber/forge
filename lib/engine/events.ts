import type { LogStream, RunStatus } from "./types";

/**
 * What travels on the bus.
 *
 * `RunEvent` is what an executor yields about itself; `EngineEvent` is that
 * same information stamped with run/node identity and a sequence number, which
 * is what persistence, the SSE stream and the UI all consume.
 */
export type EngineEvent =
  | { type: "run:started"; runId: string; at: number }
  | {
      type: "node:started";
      runId: string;
      nodeId: string;
      kind: string;
      /**
       * What upstream nodes handed this one. Carried on the event so it can be
       * persisted — otherwise `NodeRun.input` stays null and "why did this step
       * do that?" has no answer after the fact.
       */
      inputs: Record<string, unknown>;
      /** Which attempt this is, starting at 1. */
      attempt: number;
      at: number;
    }
  | {
      type: "node:log";
      runId: string;
      nodeId: string;
      stream: LogStream;
      text: string;
      /** Monotonic per run — the replay key for reconnecting clients. */
      seq: number;
      at: number;
    }
  | { type: "node:progress"; runId: string; nodeId: string; pct: number }
  | {
      type: "node:retrying";
      runId: string;
      nodeId: string;
      /** The attempt that just failed. */
      attempt: number;
      /** The attempt about to be dispatched once the delay elapses. */
      nextAttempt: number;
      maxAttempts: number;
      error: string;
      delayMs: number;
      at: number;
    }
  | {
      type: "node:finished";
      runId: string;
      nodeId: string;
      status: RunStatus;
      outputs?: Record<string, unknown>;
      error?: string;
      /** Which attempt this terminal outcome belongs to. */
      attempt: number;
      at: number;
    }
  | {
      type: "run:finished";
      runId: string;
      status: RunStatus;
      error?: string;
      at: number;
    };

export type EngineEventType = EngineEvent["type"];

export type Emit = (event: EngineEvent) => void;
