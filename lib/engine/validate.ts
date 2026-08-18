import { getExecutor } from "./registry";
import type { WorkflowGraph } from "./types";

export interface Problem {
  severity: "error" | "warning";
  nodeId?: string;
  message: string;
}

/**
 * Static checks that feed the Problems panel. Everything here is cheap enough
 * to run on every graph edit — the expensive checks belong to the run itself.
 */
export function validateGraph(graph: WorkflowGraph): Problem[] {
  const problems: Problem[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  if (graph.nodes.length === 0) {
    return [{ severity: "warning", message: "The canvas is empty." }];
  }

  if (!graph.nodes.some((n) => n.kind === "start")) {
    problems.push({
      severity: "warning",
      message: "No Start node — the run will begin at every node with no inputs.",
    });
  }

  for (const node of graph.nodes) {
    const executor = getExecutor(node.kind);
    if (!executor) {
      problems.push({
        severity: "error",
        nodeId: node.id,
        message: `Unknown node kind "${node.kind}".`,
      });
      continue;
    }

    const parsed = executor.configSchema.safeParse(node.data.config ?? {});
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push({
          severity: "error",
          nodeId: node.id,
          message: `${node.data.label ?? executor.label}: ${
            issue.path.join(".") || "config"
          } ${issue.message.toLowerCase()}`,
        });
      }
    }

    const hasIncoming = graph.edges.some((e) => e.target === node.id);
    const hasOutgoing = graph.edges.some((e) => e.source === node.id);

    if (executor.ports.inputs.length > 0 && !hasIncoming && node.kind !== "start") {
      problems.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.data.label ?? executor.label} has no input connected.`,
      });
    }
    if (executor.ports.outputs.length > 0 && !hasOutgoing) {
      problems.push({
        severity: "warning",
        nodeId: node.id,
        message: `${node.data.label ?? executor.label} output goes nowhere.`,
      });
    }
  }

  for (const cycle of findCycles(graph)) {
    problems.push({
      severity: "error",
      message: `Cycle detected: ${cycle
        .map((id) => byId.get(id)?.data.label ?? id)
        .join(" → ")}. The run would never start.`,
    });
  }

  return problems;
}

/**
 * Depth-first search with three-colour marking: a node still on the stack means
 * the edge closing back onto it forms a cycle. Recursive, which is fine for
 * hand-drawn graphs — revisit if graphs ever get generated at scale.
 */
function findCycles(graph: WorkflowGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) adjacency.get(edge.source)?.push(edge.target);

  const state = new Map<string, 0 | 1 | 2>(); // unvisited / on-stack / done
  const cycles: string[][] = [];
  const stack: string[] = [];

  function visit(id: string) {
    state.set(id, 1);
    stack.push(id);

    for (const next of adjacency.get(id) ?? []) {
      const nextState = state.get(next) ?? 0;
      if (nextState === 1) {
        const start = stack.indexOf(next);
        cycles.push([...stack.slice(start), next]);
      } else if (nextState === 0) {
        visit(next);
      }
    }

    stack.pop();
    state.set(id, 2);
  }

  for (const node of graph.nodes) {
    if ((state.get(node.id) ?? 0) === 0) visit(node.id);
  }

  return cycles;
}
