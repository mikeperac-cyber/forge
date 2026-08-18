import { describe, expect, it } from "vitest";
import { diffGraphs, summariseDiff } from "./diff";
import type { GraphNode, WorkflowGraph } from "./types";

function node(
  id: string,
  kind = "transform",
  config: Record<string, unknown> = { expression: "input" },
  position = { x: 0, y: 0 },
  label?: string,
): GraphNode {
  return { id, kind, position, data: { label, config } };
}

function graph(nodes: GraphNode[], edges: WorkflowGraph["edges"] = []): WorkflowGraph {
  return { nodes, edges };
}

const edge = (
  id: string,
  source: string,
  target: string,
  sourceHandle: string | null = null,
) => ({ id, source, target, sourceHandle, targetHandle: null });

describe("diffGraphs", () => {
  it("reports an identical graph as identical", () => {
    const a = graph([node("x")], [edge("e1", "x", "y")]);
    const diff = diffGraphs(a, structuredClone(a));

    expect(diff.identical).toBe(true);
    expect(summariseDiff(diff)).toBe("No changes");
  });

  it("treats a moved node as layout only", () => {
    const before = graph([node("x")]);
    const after = graph([node("x", "transform", { expression: "input" }, { x: 400, y: 90 })]);
    const diff = diffGraphs(before, after);

    // Dragging changes the version but not the behaviour.
    expect(diff.identical).toBe(true);
    expect(diff.nodesChanged).toHaveLength(0);
    expect(diff.nodesMoved.map((n) => n.id)).toEqual(["x"]);
    expect(summariseDiff(diff)).toBe("Layout only");
  });

  it("detects added and removed nodes", () => {
    const diff = diffGraphs(graph([node("a"), node("b")]), graph([node("b"), node("c")]));

    expect(diff.nodesAdded.map((n) => n.id)).toEqual(["c"]);
    expect(diff.nodesRemoved.map((n) => n.id)).toEqual(["a"]);
    expect(diff.identical).toBe(false);
  });

  it("names the config keys that changed", () => {
    const before = graph([node("s", "shell", { command: "npm test", cwd: "." })]);
    const after = graph([node("s", "shell", { command: "npm run build", cwd: "." })]);
    const diff = diffGraphs(before, after);

    expect(diff.nodesChanged).toHaveLength(1);
    expect(diff.nodesChanged[0].fields).toEqual(["config.command"]);
  });

  it("detects label and kind changes", () => {
    const before = graph([node("n", "shell", {}, { x: 0, y: 0 }, "Old")]);
    const after = graph([node("n", "http", {}, { x: 0, y: 0 }, "New")]);
    const diff = diffGraphs(before, after);

    expect(diff.nodesChanged[0].fields).toEqual(expect.arrayContaining(["kind", "label"]));
  });

  it("compares edges by endpoints, not by generated id", () => {
    // Same connection, different edge id — a rewire would otherwise look like
    // a remove plus an add every time the canvas regenerates ids.
    const before = graph([node("a"), node("b")], [edge("e-old", "a", "b")]);
    const after = graph([node("a"), node("b")], [edge("e-new", "a", "b")]);

    expect(diffGraphs(before, after).identical).toBe(true);
  });

  it("treats a different source port as a different connection", () => {
    const before = graph([node("a"), node("b")], [edge("e1", "a", "b", "true")]);
    const after = graph([node("a"), node("b")], [edge("e1", "a", "b", "false")]);
    const diff = diffGraphs(before, after);

    expect(diff.edgesAdded).toHaveLength(1);
    expect(diff.edgesRemoved).toHaveLength(1);
  });

  it("summarises a mixed change", () => {
    const before = graph([node("a"), node("b")], [edge("e1", "a", "b")]);
    const after = graph(
      [node("a", "transform", { expression: "input.x" }), node("c")],
      [],
    );

    expect(summariseDiff(diffGraphs(before, after))).toBe(
      "1 node added, 1 node removed, 1 node edited, 1 connection removed",
    );
  });
});
