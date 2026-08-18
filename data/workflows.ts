import "server-only";
import { prisma } from "@/lib/db";
import { EMPTY_GRAPH, type WorkflowGraph } from "@/lib/engine/types";
import { uniqueSlug } from "@/lib/slug";

/**
 * The authorization boundary.
 *
 * Every function here takes `userId` first and filters on it. Server Actions
 * never touch `prisma` directly, so there is no code path that can read another
 * account's row — which is precisely the flaw the GitScrum original shipped
 * with, where slug lookups were unscoped and any logged-in user could read
 * anything by guessing.
 */

export interface WorkflowSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  version: number;
  updatedAt: Date;
  nodeCount: number;
  lastRun: { id: string; status: string; startedAt: Date } | null;
  runCount: number;
  successRate: number | null;
}

function graphOf(value: unknown): WorkflowGraph {
  if (!value || typeof value !== "object") return EMPTY_GRAPH;
  const candidate = value as Partial<WorkflowGraph>;
  return {
    nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
  };
}

export async function listWorkflows(userId: string): Promise<WorkflowSummary[]> {
  // Two bounded queries instead of dragging every run row into memory to
  // compute a percentage. `take: 1` fetches only the latest run per workflow,
  // and the tallies come back pre-aggregated as one row per (workflow, status).
  const [rows, tallies] = await Promise.all([
    prisma.workflow.findMany({
      where: { userId, archivedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        runs: {
          take: 1,
          orderBy: { startedAt: "desc" },
          select: { id: true, status: true, startedAt: true },
        },
        _count: { select: { runs: true } },
      },
    }),
    prisma.run.groupBy({
      by: ["workflowId", "status"],
      where: { workflow: { userId } },
      _count: { _all: true },
    }),
  ]);

  const outcomes = new Map<string, { finished: number; succeeded: number }>();
  for (const tally of tallies) {
    // A run still in flight, skipped or cancelled says nothing about success.
    if (tally.status !== "succeeded" && tally.status !== "failed") continue;
    const entry = outcomes.get(tally.workflowId) ?? { finished: 0, succeeded: 0 };
    entry.finished += tally._count._all;
    if (tally.status === "succeeded") entry.succeeded += tally._count._all;
    outcomes.set(tally.workflowId, entry);
  }

  return rows.map((row) => {
    const outcome = outcomes.get(row.id);

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      version: row.version,
      updatedAt: row.updatedAt,
      nodeCount: graphOf(row.graph).nodes.length,
      lastRun: row.runs[0] ?? null,
      runCount: row._count.runs,
      successRate: outcome?.finished
        ? Math.round((outcome.succeeded / outcome.finished) * 100)
        : null,
    };
  });
}

export async function getWorkflow(userId: string, slug: string) {
  const row = await prisma.workflow.findFirst({
    where: { userId, slug, archivedAt: null },
  });
  if (!row) return null;
  return { ...row, graph: graphOf(row.graph) };
}

export async function getWorkflowById(userId: string, id: string) {
  const row = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { ...row, graph: graphOf(row.graph) };
}

export async function createWorkflow(
  userId: string,
  input: { name: string; description?: string; graph?: WorkflowGraph },
) {
  const existing = await prisma.workflow.findMany({
    where: { userId },
    select: { slug: true },
  });

  return prisma.workflow.create({
    data: {
      userId,
      name: input.name,
      slug: uniqueSlug(input.name, existing.map((w) => w.slug)),
      description: input.description ?? null,
      graph: (input.graph ?? EMPTY_GRAPH) as never,
    },
  });
}

/**
 * Saves the graph and snapshots the previous version, so a run recorded against
 * version N stays interpretable after the graph moves on.
 */
export async function saveGraph(
  userId: string,
  workflowId: string,
  graph: WorkflowGraph,
  note?: string,
) {
  const current = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
  });
  if (!current) return null;

  return prisma.$transaction(async (tx) => {
    await tx.workflowVersion.upsert({
      where: {
        workflowId_version: {
          workflowId: current.id,
          version: current.version,
        },
      },
      create: {
        workflowId: current.id,
        version: current.version,
        graph: current.graph as never,
        // The outgoing version keeps *its own* note. Writing the incoming
        // note here would label every snapshot with the reason it was
        // replaced, which reads as an off-by-one in the history.
        note: current.note,
      },
      update: {},
    });

    return tx.workflow.update({
      where: { id: current.id },
      data: {
        graph: graph as never,
        version: { increment: 1 },
        note: note ?? null,
      },
    });
  });
}

export async function renameWorkflow(
  userId: string,
  workflowId: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const result = await prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data: { name: trimmed },
  });
  return result.count > 0;
}

export async function archiveWorkflow(userId: string, workflowId: string) {
  const result = await prisma.workflow.updateMany({
    where: { id: workflowId, userId },
    data: { archivedAt: new Date() },
  });
  return result.count > 0;
}
