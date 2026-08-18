import "server-only";
import { prisma } from "@/lib/db";

/**
 * Ownership is always proven by joining through `workflow.userId`. There is no
 * function here that takes a run id without also taking the user it must
 * belong to — which is what stops a guessed id from returning anything.
 */

export async function listRuns(
  userId: string,
  opts: { workflowId?: string; limit?: number } = {},
) {
  return prisma.run.findMany({
    where: {
      workflow: { userId },
      ...(opts.workflowId ? { workflowId: opts.workflowId } : {}),
    },
    orderBy: { startedAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      workflow: { select: { name: true, slug: true } },
      _count: { select: { nodeRuns: true } },
    },
  });
}

/**
 * `nodeRuns` can hold more than one row per `nodeId` — a retried node gets one
 * row per attempt, oldest first. Callers that want "the" row for a node need
 * to pick the latest attempt themselves.
 */
export async function getRun(userId: string, runId: string) {
  return prisma.run.findFirst({
    where: { id: runId, workflow: { userId } },
    include: {
      workflow: { select: { id: true, name: true, slug: true, graph: true } },
      nodeRuns: { orderBy: [{ startedAt: "asc" }, { attempt: "asc" }] },
    },
  });
}

/** Cheap ownership probe for the SSE route, which needs no payload. */
export async function ownsRun(userId: string, runId: string): Promise<boolean> {
  const count = await prisma.run.count({
    where: { id: runId, workflow: { userId } },
  });
  return count > 0;
}

/**
 * The replay's half of a run: its status, and enough of each node to announce
 * that the node finished.
 *
 * Deliberately not `getRun`, which is shaped for the detail page and carries
 * the workflow's entire `graph` JSON plus every `NodeRun`'s `input` and
 * `output` payloads. The stream reads five columns and never looks at the
 * workflow at all — so reusing it meant every reconnect dragged the whole graph
 * and every captured payload across the wire from SQLite to be thrown away.
 */
export async function getRunForReplay(userId: string, runId: string) {
  return prisma.run.findFirst({
    where: { id: runId, workflow: { userId } },
    select: {
      status: true,
      nodeRuns: {
        orderBy: { startedAt: "asc" },
        select: {
          id: true,
          nodeId: true,
          status: true,
          startedAt: true,
          finishedAt: true,
        },
      },
    },
  });
}

/**
 * Backlog for a reconnecting client. Everything already emitted, in `seq`
 * order — without this, reloading mid-run silently loses prior output.
 *
 * The cap matches `MAX_LOGS` in `components/console/use-run-stream.ts`: sending
 * more than the client is willing to hold just fills a buffer that trims itself
 * on arrival.
 */
export const REPLAY_LIMIT = 5000;

export async function getRunLogs(userId: string, runId: string, afterSeq = 0) {
  return prisma.logLine.findMany({
    where: { runId, seq: { gt: afterSeq }, run: { workflow: { userId } } },
    orderBy: { seq: "asc" },
    take: REPLAY_LIMIT,
    // Only the five fields that reach the wire. `id` and `runId` are never
    // read — the client is already scoped to a single run.
    select: {
      seq: true,
      ts: true,
      stream: true,
      text: true,
      nodeRunId: true,
    },
  });
}

export async function getRunStats(userId: string) {
  const runs = await prisma.run.findMany({
    where: { workflow: { userId } },
    select: { status: true, startedAt: true, finishedAt: true },
    orderBy: { startedAt: "desc" },
    take: 200,
  });

  const finished = runs.filter((r) => r.finishedAt);
  const durations = finished.map(
    (r) => r.finishedAt!.getTime() - r.startedAt.getTime(),
  );

  return {
    total: runs.length,
    succeeded: runs.filter((r) => r.status === "succeeded").length,
    failed: runs.filter((r) => r.status === "failed").length,
    running: runs.filter((r) => r.status === "running").length,
    medianMs: durations.length
      ? durations.sort((a, b) => a - b)[Math.floor(durations.length / 2)]
      : null,
  };
}
