import { describe, expect, it } from "vitest";
import { demoGraph, DEMO_NAME, DEMO_DESCRIPTION } from "./demo-workflow";
import { validateGraph } from "./engine/validate";

describe("demo-workflow", () => {
  it("exports valid DEMO_NAME and DEMO_DESCRIPTION constants", () => {
    expect(DEMO_NAME).toBe("Build & notify");
    expect(DEMO_DESCRIPTION).toBe(
      "Run the test suite, branch on the result, then summarise or alert.",
    );
  });

  describe("demoGraph", () => {
    it("returns a valid WorkflowGraph without validation errors or warnings", () => {
      const graph = demoGraph();
      const problems = validateGraph(graph);
      expect(problems).toEqual([]);
    });

    it("contains all expected nodes with correct IDs and kinds", () => {
      const graph = demoGraph();
      const nodeKinds = graph.nodes.map((node) => ({
        id: node.id,
        kind: node.kind,
      }));

      expect(nodeKinds).toEqual([
        { id: "start", kind: "start" },
        { id: "test", kind: "shell" },
        { id: "gate", kind: "branch" },
        { id: "summarise", kind: "ai" },
        { id: "notify", kind: "http" },
        { id: "done", kind: "end" },
      ]);
    });

    it("contains expected node configurations and data", () => {
      const graph = demoGraph();
      const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

      expect(nodesById.get("start")?.data).toEqual({
        label: "Trigger",
        config: { payload: '{ "branch": "main" }' },
      });

      expect(nodesById.get("test")?.data).toEqual({
        label: "Run tests",
        config: { command: "npm test", cwd: ".", failureRate: 0.25 },
      });

      expect(nodesById.get("gate")?.data).toEqual({
        label: "Tests passed?",
        config: { condition: "input === 0" },
      });

      expect(nodesById.get("summarise")?.data).toEqual({
        label: "Summarise result",
        config: {
          prompt: "Summarise this build result for the team: {{input}}",
          model: "claude-sonnet-5",
          temperature: 0.4,
        },
      });

      expect(nodesById.get("notify")?.data).toEqual({
        label: "Notify on failure",
        config: {
          method: "POST",
          url: "https://hooks.example.com/build-failed",
          headers: '{ "content-type": "application/json" }',
          body: '{ "status": "failed" }',
        },
      });

      expect(nodesById.get("done")?.data).toEqual({
        label: "Done",
        config: { label: "Pipeline complete" },
      });
    });

    it("wires edges correctly including non-default port handles", () => {
      const graph = demoGraph();

      expect(graph.edges).toEqual([
        {
          id: "e1",
          source: "start",
          target: "test",
          sourceHandle: "out",
          targetHandle: "in",
        },
        {
          id: "e2",
          source: "test",
          target: "gate",
          sourceHandle: "exitCode",
          targetHandle: "in",
        },
        {
          id: "e3",
          source: "gate",
          target: "summarise",
          sourceHandle: "true",
          targetHandle: "in",
        },
        {
          id: "e4",
          source: "gate",
          target: "notify",
          sourceHandle: "false",
          targetHandle: "in",
        },
        {
          id: "e5",
          source: "summarise",
          target: "done",
          sourceHandle: "text",
          targetHandle: "in",
        },
        {
          id: "e6",
          source: "notify",
          target: "done",
          sourceHandle: "status",
          targetHandle: "in",
        },
      ]);
    });
  });
});
