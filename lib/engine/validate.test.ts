import { describe, expect, it } from "vitest";
import { validateGraph } from "./validate";
import type { GraphEdge, GraphNode, WorkflowGraph } from "./types";

function node(
  id: string,
  kind: string,
  config: Record<string, unknown> = {},
  label?: string,
): GraphNode {
  return { id, kind, position: { x: 0, y: 0 }, data: { label, config } };
}

function edge(source: string, target: string): GraphEdge {
  return { id: `${source}->${target}`, source, target };
}

describe("validateGraph", () => {
  it("warns on an empty canvas and nothing else", () => {
    const problems = validateGraph({ nodes: [], edges: [] });
    expect(problems).toEqual([
      { severity: "warning", message: "The canvas is empty." },
    ]);
  });

  it("passes a fully wired, valid graph with no problems", () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), node("end", "end")],
      edges: [edge("start", "end")],
    };

    expect(validateGraph(graph)).toEqual([]);
  });

  it("warns when there is no start node", () => {
    const graph: WorkflowGraph = {
      nodes: [node("a", "transform", { expression: "input" })],
      edges: [],
    };

    const problems = validateGraph(graph);
    expect(problems).toContainEqual({
      severity: "warning",
      message:
        "No Start node — the run will begin at every node with no inputs.",
    });
  });

  it("errors on an unknown node kind", () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), node("mystery", "not-a-real-kind")],
      edges: [edge("start", "mystery")],
    };

    const problems = validateGraph(graph);
    expect(problems).toContainEqual({
      severity: "error",
      nodeId: "mystery",
      message: 'Unknown node kind "not-a-real-kind".',
    });
  });

  it("errors on config that fails the node's own schema", () => {
    // http requires a url; an empty one fails configSchema validation.
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), node("bad", "http", { url: "" })],
      edges: [edge("start", "bad")],
    };

    const problems = validateGraph(graph);
    const errors = problems.filter(
      (p) => p.nodeId === "bad" && p.severity === "error",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("warns when a node with input ports has nothing feeding it", () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        node("orphan", "transform", { expression: "input" }, "Orphan"),
      ],
      edges: [],
    };

    const problems = validateGraph(graph);
    expect(problems).toContainEqual({
      severity: "warning",
      nodeId: "orphan",
      message: "Orphan has no input connected.",
    });
  });

  it("warns when a node's output goes nowhere", () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start", {}, "Start")],
      edges: [],
    };

    const problems = validateGraph(graph);
    expect(problems).toContainEqual({
      severity: "warning",
      nodeId: "start",
      message: "Start output goes nowhere.",
    });
  });

  it("never asks the start node itself for an input connection", () => {
    // start has zero input ports, so this can't fire regardless — pinning it
    // down so a future port change to `start` can't silently regress this.
    const graph: WorkflowGraph = {
      nodes: [node("start", "start")],
      edges: [],
    };

    const problems = validateGraph(graph);
    expect(problems.some((p) => p.message.includes("no input connected"))).toBe(
      false,
    );
  });

  it("detects a direct cycle and names the nodes in it", () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("a", "transform", { expression: "input" }, "A"),
        node("b", "transform", { expression: "input" }, "B"),
      ],
      edges: [edge("a", "b"), edge("b", "a")],
    };

    const problems = validateGraph(graph);
    const cycleError = problems.find((p) =>
      p.message.startsWith("Cycle detected"),
    );
    expect(cycleError).toBeTruthy();
    expect(cycleError!.message).toContain("A → B → A");
  });

  it("detects a longer cycle through an intermediate node", () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("a", "transform", { expression: "input" }),
        node("b", "transform", { expression: "input" }),
        node("c", "transform", { expression: "input" }),
      ],
      edges: [edge("a", "b"), edge("b", "c"), edge("c", "a")],
    };

    const problems = validateGraph(graph);
    expect(problems.some((p) => p.message.startsWith("Cycle detected"))).toBe(
      true,
    );
  });

  it("does not flag a diamond as a cycle", () => {
    // start -> a -> join, start -> b -> join: reconverges but never loops.
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        node("a", "transform", { expression: "input" }),
        node("b", "transform", { expression: "input" }),
        node("join", "transform", { expression: "input" }),
      ],
      edges: [
        edge("start", "a"),
        edge("start", "b"),
        edge("a", "join"),
        edge("b", "join"),
      ],
    };

    const problems = validateGraph(graph);
    expect(problems.some((p) => p.message.startsWith("Cycle detected"))).toBe(
      false,
    );
  });
});
