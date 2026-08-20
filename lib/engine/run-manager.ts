import "server-only";
import { prisma } from "@/lib/db";
import { activeRuns, publish, settlingRuns } from "./bus";
import type { EngineEvent } from "./events";
import { executeWorkflow } from "./scheduler";
import type { RunOptions, WorkflowGraph } from "./types";

/**
 * Owns a run's lifecycle: create the row, start the scheduler, mirror every
 * event to both the bus (for live viewers) and the database (for replay), and
 * keep the AbortController around so it can be cancelled.
 *
 * Writes are chained rather than awaited inline. The scheduler emits
 * synchronously and must not be slowed by disk I/O, but log lines still have to
 * land in `seq` order — a promise chain gives ordering without backpressure.
 *
 * Log lines are additionally *batched*: a chatty run emits hundreds of them,
 * and one INSERT per line is hundreds of sequential round trips. They collect
 * in a buffer and go out as a single `createMany`.
 */

interface StartRunArgs {
  workflowId: string;
  version: number;
  graph: WorkflowGraph;
  options?: Partial<RunOptions>;
  /** manual | schedule — a String because SQLite has no enums. */
  trigger?: string;
}

/** Flush the log buffer once it reaches this many lines. */
const LOG_BATCH_SIZE = 40;
/** …or this often, so a slow run still persists promptly for reconnects. */
const LOG_FLUSH_MS = 200;

interface BufferedLog {
  nodeId: string;
  seq: number;
  ts: Date;
  stream: string;
  text: string;
}

export async function startRun({
  workflowId,
  version,
  graph,
  options,
  trigger = "manual",
}: StartRunArgs): Promise<string> {
  const run = await prisma.run.create({
    data: { workflowId, version, status: "running", trigger },
  });

  const controller = new AbortController();
  activeRuns.set(run.id, controller);

  // nodeId -> NodeRun row id, filled in as nodes start.
  const nodeRunIds = new Map<string, string>();
  let chain: Promise<unknown> = Promise.resolve();
  let buffer: BufferedLog[] = [];

  const enqueue = (work: () => Promise<unknown>) => {
    chain = chain.then(work).catch((err) => {
      console.error(`[run ${run.id}] persistence error:`, err);
    });
  };

  /**
   * Hands the buffer to the chain rather than writing directly, so the batch
   * lands *after* any NodeRun creates already queued ahead of it. That ordering
   * is what lets `nodeRunIds` resolve — resolved inside the closure, at write
   * time, not at buffer time.
   */
  const flushLogs = () => {
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];

    enqueue(() =>
      prisma.logLine.createMany({
        data: batch.map((line) => ({
          runId: run.id,
          nodeRunId: nodeRunIds.get(line.nodeId) ?? null,
          seq: line.seq,
          ts: line.ts,
          stream: line.stream,
          text: line.text,
        })),
      }),
    );
  };

  const flushTimer = setInterval(flushLogs, LOG_FLUSH_MS);

  const emit = (event: EngineEvent) => {
    publish(event);

    switch (event.type) {
      case "node:started":
        enqueue(async () => {
          const row = await prisma.nodeRun.create({
            data: {
              runId: run.id,
              nodeId: event.nodeId,
              kind: event.kind,
              status: "running",
              attempt: event.attempt,
              input: (event.inputs ?? null) as never,
              startedAt: new Date(event.at),
            },
          });
          nodeRunIds.set(event.nodeId, row.id);
        });
        break;

      case "node:retrying":
        // Close out the attempt that just failed — same shape as node:finished
        // would write, since as far as this row is concerned it did finish.
        // Flush first so this attempt's log lines land against its own row.
        flushLogs();
        enqueue(async () => {
          const id = nodeRunIds.get(event.nodeId);
          if (id) {
            await prisma.nodeRun.update({
              where: { id },
              data: {
                status: "failed",
                error: event.error,
                finishedAt: new Date(event.at),
              },
            });
          }
          // Deliberately NOT clearing nodeRunIds here. The next attempt's own
          // node:started will overwrite the pointer once it actually starts —
          // but if the run is cancelled during the delay first, node:finished
          // arrives for this same nodeId with no new attempt ever having
          // started. Leaving the pointer in place lets that event update THIS
          // row to "cancelled" instead. Clearing it would send that update
          // through node:finished's create-fallback path, which defaults a
          // fresh row to attempt 1 — colliding with the row this very case
          // just wrote, since no new attempt claimed the next slot.
        });
        break;

      case "node:log":
        buffer.push({
          nodeId: event.nodeId,
          seq: event.seq,
          ts: new Date(event.at),
          stream: event.stream,
          text: event.text,
        });
        if (buffer.length >= LOG_BATCH_SIZE) flushLogs();
        break;

      case "node:finished":
        // Flush first so this node's output is durable before its row closes.
        flushLogs();
        enqueue(async () => {
          const id = nodeRunIds.get(event.nodeId);
          const data = {
            status: event.status,
            output: (event.outputs ?? null) as never,
            error: event.error ?? null,
            finishedAt: new Date(event.at),
          };

          if (id) {
            await prisma.nodeRun.update({ where: { id }, data });
            return;
          }

          // Skipped nodes never started, so no row exists yet.
          const row = await prisma.nodeRun.create({
            data: {
              runId: run.id,
              nodeId: event.nodeId,
              kind:
                graph.nodes.find((n) => n.id === event.nodeId)?.kind ??
                "unknown",
              ...data,
            },
          });
          nodeRunIds.set(event.nodeId, row.id);
        });
        break;

      case "run:finished":
        flushLogs();
        enqueue(() =>
          prisma.run.update({
            where: { id: run.id },
            data: {
              status: event.status,
              error: event.error ?? null,
              finishedAt: new Date(event.at),
            },
          }),
        );
        break;
    }
  };

  // Not awaited by the caller: the action returns the run id immediately and
  // the client follows along over SSE. The chain is still captured (rather
  // than `void`-discarded) and registered in `settlingRuns`, so a caller that
  // genuinely needs to know when every write has landed — see
  // `waitForSettled` — has a correct way to ask, instead of racing the
  // `run:finished` bus event against the trailing log flush.
  const settled = executeWorkflow({
    runId: run.id,
    graph,
    emit,
    options,
    signal: controller.signal,
  })
    .catch((err) => {
      console.error(`[run ${run.id}] scheduler crashed:`, err);
      enqueue(() =>
        prisma.run.update({
          where: { id: run.id },
          data: {
            status: "failed",
            error: (err as Error).message,
            finishedAt: new Date(),
          },
        }),
      );
    })
    .finally(async () => {
      clearInterval(flushTimer);
      flushLogs();
      // Let queued writes drain before the run is considered settled, so a
      // client reconnecting right after completion sees the full log.
      await chain;
      activeRuns.delete(run.id);
    })
    // Belt-and-suspenders: `chain` rejecting inside the `finally` above would
    // otherwise surface as an unhandled rejection whenever nobody calls
    // `waitForSettled` on this run (the ordinary request-handler case).
    .catch((err) => {
      console.error(`[run ${run.id}] settling failed:`, err);
    })
    .finally(() => {
      settlingRuns.delete(run.id);
    })
    // The success path resolves with `ExecuteResult`; callers of
    // `waitForSettled` only care that settling happened, not with what.
    .then(() => undefined);

  settlingRuns.set(run.id, settled);

  return run.id;
}

/**
 * Resolves once every write for this run — including the trailing log flush
 * — has actually landed, not merely once `run:finished` has been published.
 * A no-op resolve for an unknown run id: either it settled and was cleaned up
 * already, or it was never started here, and either way there is nothing left
 * to wait for.
 */
export function waitForSettled(runId: string): Promise<void> {
  return settlingRuns.get(runId) ?? Promise.resolve();
}
