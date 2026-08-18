import { NextRequest } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getRunForReplay, getRunLogs, ownsRun } from "@/data/runs";
import { isRunning, subscribe } from "@/lib/engine/bus";
import type { EngineEvent } from "@/lib/engine/events";

// The bus lives in this process, so the stream must too.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-Sent Events for a single run.
 *
 * Replay first, then attach. Persisted log lines are flushed in `seq` order
 * before the live subscription starts, so reloading mid-run shows the full
 * history and keeps streaming. Without the replay step, a refresh at the wrong
 * moment silently loses everything already emitted — and it looks like the run
 * simply produced no output.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { id: runId } = await params;
  if (!(await ownsRun(userId, runId))) {
    // 404 rather than 403: a guessed id shouldn't confirm the run exists.
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const send = (
        event: EngineEvent | { type: string; [k: string]: unknown },
      ) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      // --- 1. replay -----------------------------------------------------
      const [run, logs] = await Promise.all([
        getRunForReplay(userId, runId),
        getRunLogs(userId, runId),
      ]);

      // Log rows reference the NodeRun row, not the graph node id the client
      // works in. Without this mapping, replayed lines arrive unattributed and
      // per-node filtering silently drops them.
      const nodeIdByNodeRunId = new Map(
        (run?.nodeRuns ?? []).map((nodeRun) => [nodeRun.id, nodeRun.nodeId]),
      );

      if (run) {
        for (const nodeRun of run.nodeRuns) {
          send({
            type: "node:finished",
            runId,
            nodeId: nodeRun.nodeId,
            status: nodeRun.status,
            replay: true,
            at: (
              nodeRun.finishedAt ??
              nodeRun.startedAt ??
              new Date()
            ).getTime(),
          });
        }
      }

      for (const line of logs) {
        send({
          type: "node:log",
          runId,
          nodeId: line.nodeRunId
            ? (nodeIdByNodeRunId.get(line.nodeRunId) ?? "")
            : "",
          stream: line.stream,
          text: line.text,
          seq: line.seq,
          at: line.ts.getTime(),
          replay: true,
        });
      }

      send({ type: "replay:done", runId, at: Date.now() });

      // --- 2. if it already finished, say so and stop ---------------------
      if (run && !isRunning(runId) && run.status !== "running") {
        send({
          type: "run:finished",
          runId,
          status: run.status,
          at: Date.now(),
        });
        closed = true;
        controller.close();
        return;
      }

      // --- 3. attach to the live bus -------------------------------------
      const unsubscribe = subscribe(runId, (event) => {
        send(event);
        if (event.type === "run:finished") {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      });

      // Proxies and browsers drop idle connections; a comment frame is enough
      // to keep it warm without polluting the event stream.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 15000);

      function cleanup() {
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
      }

      request.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disables proxy buffering, which otherwise batches the whole stream.
      "x-accel-buffering": "no",
    },
  });
}
