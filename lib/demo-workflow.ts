import type { WorkflowGraph } from "./engine/types";

/**
 * The workflow a fresh account starts with.
 *
 * Deliberately exercises every interesting scheduler path: a fan-out into a
 * branch, port-level wiring (the gate reads `exitCode`, not `stdout`), two
 * mutually exclusive paths, and a join that runs on whichever one survives.
 */
export function demoGraph(): WorkflowGraph {
  return {
    nodes: [
      {
        id: "start",
        kind: "start",
        position: { x: 40, y: 220 },
        data: { label: "Trigger", config: { payload: '{ "branch": "main" }' } },
      },
      {
        id: "test",
        kind: "shell",
        position: { x: 300, y: 220 },
        data: {
          label: "Run tests",
          config: { command: "npm test", cwd: ".", failureRate: 0.25 },
        },
      },
      {
        id: "gate",
        kind: "branch",
        position: { x: 580, y: 220 },
        data: { label: "Tests passed?", config: { condition: "input === 0" } },
      },
      {
        id: "summarise",
        kind: "ai",
        position: { x: 850, y: 110 },
        data: {
          label: "Summarise result",
          config: {
            prompt: "Summarise this build result for the team: {{input}}",
            model: "claude-sonnet-5",
            temperature: 0.4,
          },
        },
      },
      {
        id: "notify",
        kind: "http",
        position: { x: 850, y: 340 },
        data: {
          label: "Notify on failure",
          config: {
            method: "POST",
            url: "https://hooks.example.com/build-failed",
            headers: '{ "content-type": "application/json" }',
            body: '{ "status": "failed" }',
          },
        },
      },
      {
        id: "done",
        kind: "end",
        position: { x: 1130, y: 220 },
        data: { label: "Done", config: { label: "Pipeline complete" } },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "start",
        target: "test",
        sourceHandle: "out",
        targetHandle: "in",
      },
      // Reads the exit code port specifically, not the default first output.
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
    ],
  };
}

export const DEMO_NAME = "Build & notify";
export const DEMO_DESCRIPTION =
  "Run the test suite, branch on the result, then summarise or alert.";
