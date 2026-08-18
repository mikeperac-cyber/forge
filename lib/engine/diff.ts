import type { GraphEdge, GraphNode, WorkflowGraph } from "./types";

/**
 * Structural diff between two versions of a graph.
 *
 * Position is tracked separately from configuration. Dragging a node around the
 * canvas bumps the version but changes nothing about what the workflow *does*,
 * and a diff that reports "3 nodes changed" after a tidy-up is a diff nobody
 * reads twice.
 */

export interface ChangedNode {
  before: GraphNode;
  after: GraphNode;
  /** e.g. `kind`, `label`, `config.command` */
  fields: string[];
}

export interface GraphDiff {
  nodesAdded: GraphNode[];
  nodesRemoved: GraphNode[];
  nodesChanged: ChangedNode[];
  nodesMoved: GraphNode[];
  edgesAdded: GraphEdge[];
  edgesRemoved: GraphEdge[];
  /** True when nothing meaningful differs — moves alone don't count. */
  identical: boolean;
}

/**
 * Edges carry generated ids, so two structurally identical graphs would look
 * entirely different if compared by id. Compare by what an edge actually means:
 * which port it leaves and which port it enters.
 */
function edgeKey(edge: GraphEdge): string {
  return `${edge.source}:${edge.sourceHandle ?? ""}→${edge.target}:${edge.targetHandle ?? ""}`;
}

function configFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];

  for (const key of keys) {
    // Config values are JSON-shaped, so stringify is a sound deep compare here
    // and avoids hand-rolling one.
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.push(`config.${key}`);
    }
  }

  return changed;
}

export function diffGraphs(
  before: WorkflowGraph,
  after: WorkflowGraph,
): GraphDiff {
  const beforeNodes = new Map(before.nodes.map((n) => [n.id, n]));
  const afterNodes = new Map(after.nodes.map((n) => [n.id, n]));

  const nodesAdded: GraphNode[] = [];
  const nodesRemoved: GraphNode[] = [];
  const nodesChanged: ChangedNode[] = [];
  const nodesMoved: GraphNode[] = [];

  for (const [id, node] of afterNodes) {
    if (!beforeNodes.has(id)) nodesAdded.push(node);
  }

  for (const [id, previous] of beforeNodes) {
    const current = afterNodes.get(id);
    if (!current) {
      nodesRemoved.push(previous);
      continue;
    }

    const fields: string[] = [];
    if (previous.kind !== current.kind) fields.push("kind");
    if ((previous.data.label ?? "") !== (current.data.label ?? "")) {
      fields.push("label");
    }
    fields.push(
      ...configFields(previous.data.config ?? {}, current.data.config ?? {}),
    );

    if (fields.length > 0) {
      nodesChanged.push({ before: previous, after: current, fields });
    }

    if (
      previous.position.x !== current.position.x ||
      previous.position.y !== current.position.y
    ) {
      nodesMoved.push(current);
    }
  }

  const beforeEdges = new Map(before.edges.map((e) => [edgeKey(e), e]));
  const afterEdges = new Map(after.edges.map((e) => [edgeKey(e), e]));

  const edgesAdded = [...afterEdges].
    filter(([key]) => !beforeEdges.has(key)).
    map(([, edge]) => edge);
  const edgesRemoved = [...beforeEdges].
    filter(([key]) => !afterEdges.has(key)).
    map(([, edge]) => edge);

  return {
    nodesAdded,
    nodesRemoved,
    nodesChanged,
    nodesMoved,
    edgesAdded,
    edgesRemoved,
    identical:
      nodesAdded.length === 0 &&
      nodesRemoved.length === 0 &&
      nodesChanged.length === 0 &&
      edgesAdded.length === 0 &&
      edgesRemoved.length === 0,
  };
}

/** One-line gist for a version list row. */
export function summariseDiff(diff: GraphDiff): string {
  if (diff.identical) {
    return diff.nodesMoved.length > 0 ? "Layout only" : "No changes";
  }

  const parts: string[] = [];
  const add = (count: number, noun: string) => {
    if (count > 0) parts.push(`${count} ${noun}${count === 1 ? "" : "s"}`);
  };

  add(diff.nodesAdded.length, "node added");
  add(diff.nodesRemoved.length, "node removed");
  add(diff.nodesChanged.length, "node edited");
  add(diff.edgesAdded.length, "connection added");
  add(diff.edgesRemoved.length, "connection removed");

  return parts.join(", ");
}
