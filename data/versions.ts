import "server-only";
import { prisma } from "@/lib/db";
import { EMPTY_GRAPH, type WorkflowGraph } from "@/lib/engine/types";

/**
 * Version history.
 *
 * Snapshots in `WorkflowVersion` are of *past* graphs — `saveGraph` archives the
 * outgoing graph before bumping the number. The current version therefore has no
 * row of its own; it lives on `Workflow.graph`. Every read here reconciles those
 * two sources so callers never have to know that.
 */

export interface VersionEntry {
  version: number;
  graph: WorkflowGraph;
  note: string | null;
  createdAt: Date;
  isCurrent: boolean;
}

function graphOf(value: unknown): WorkflowGraph {
  if (!value || typeof value !== "object") return EMPTY_GRAPH;
  const candidate = value as Partial<WorkflowGraph>;
  return {
    nodes: Array.isArray(candidate.nodes) ? candidate.nodes : [],
    edges: Array.isArray(candidate.edges) ? candidate.edges : [],
  };
}

export async function listVersions(
  userId: string,
  workflowId: string,
): Promise<VersionEntry[]> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    include: { versions: { orderBy: { version: "desc" } } },
  });
  if (!workflow) return [];

  const current: VersionEntry = {
    version: workflow.version,
    graph: graphOf(workflow.graph),
    note: workflow.note,
    createdAt: workflow.updatedAt,
    isCurrent: true,
  };

  const archived = workflow.versions
    // Defensive: if a snapshot ever exists for the live version, the live graph
    // is the truth and the duplicate row would just confuse the list.
    .filter((row) => row.version !== workflow.version)
    .map<VersionEntry>((row) => ({
      version: row.version,
      graph: graphOf(row.graph),
      note: row.note,
      createdAt: row.createdAt,
      isCurrent: false,
    }));

  return [current, ...archived];
}

/** The graph as it stood at a given version, wherever that happens to live. */
export async function getVersionGraph(
  userId: string,
  workflowId: string,
  version: number,
): Promise<WorkflowGraph | null> {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
    select: { version: true, graph: true },
  });
  if (!workflow) return null;

  if (workflow.version === version) return graphOf(workflow.graph);

  const snapshot = await prisma.workflowVersion.findUnique({
    where: { workflowId_version: { workflowId, version } },
  });
  return snapshot ? graphOf(snapshot.graph) : null;
}
