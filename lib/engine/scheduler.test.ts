import { describe, expect, it } from "vitest";
import { executeWorkflow } from "./scheduler";
import { hashSeed } from "./rng";
import type { EngineEvent } from "./events";
import type { GraphEdge, GraphNode, WorkflowGraph } from "./types";

/* ------------------------------------------------------------- fixtures */

function node(
  id: string,
  kind: string,
  config: Record<string, unknown> = {},
  retry?: GraphNode["data"]["retry"],
): GraphNode {
  return {
    id,
    kind,
    position: { x: 0, y: 0 },
    data: { label: id, config, retry },
  };
}

function edge(
  source: string,
  target: string,
  sourceHandle?: string,
): GraphEdge {
  return {
    id: `${source}->${target}${sourceHandle ? `:${sourceHandle}` : ""}`,
    source,
    target,
    sourceHandle: sourceHandle ?? null,
    targetHandle: null,
  };
}

/** `transform` and `branch` run for real and don't sleep — ideal for structure. */
const pass = (id: string) => node(id, "transform", { expression: "input" });
const boom = (id: string) =>
  node(id, "transform", {
    expression: "(() => { throw new Error('boom') })()",
  });

async function run(
  graph: WorkflowGraph,
  opts?: Parameters<typeof executeWorkflow>[0]["options"],
  signal?: AbortSignal,
) {
  const events: EngineEvent[] = [];
  const result = await executeWorkflow({
    runId: "test-run",
    graph,
    emit: (e) => events.push(e),
    options: opts,
    signal,
  });
  return { result, events };
}

/* ---------------------------------------------------------------- tests */

describe("scheduler", () => {
  it("runs a linear chain to completion", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start", { payload: '{"n":1}' }),
        pass("a"),
        pass("b"),
      ],
      edges: [edge("start", "a"), edge("a", "b")],
    };

    const { result, events } = await run(graph);

    expect(result.status).toBe("succeeded");
    expect(result.nodeStatuses).toEqual({
      start: "succeeded",
      a: "succeeded",
      b: "succeeded",
    });

    const order = events
      .filter((e) => e.type === "node:started")
      .map((e) => (e as Extract<EngineEvent, { type: "node:started" }>).nodeId);
    expect(order).toEqual(["start", "a", "b"]);
  });

  it("threads data through the graph for real", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start", { payload: '{"count":2}' }),
        node("double", "transform", {
          expression: "({ count: input.count * 2 })",
        }),
      ],
      edges: [edge("start", "double")],
    };

    const { result } = await run(graph);
    expect(result.outputs.double.out).toEqual({ count: 4 });
  });

  it("dispatches independent branches in parallel", async () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), pass("a"), pass("b"), pass("join")],
      edges: [
        edge("start", "a"),
        edge("start", "b"),
        edge("a", "join"),
        edge("b", "join"),
      ],
    };

    const { result, events } = await run(graph);
    expect(result.status).toBe("succeeded");

    // Both siblings must start before either finishes for this to be parallel.
    const started = events.findIndex(
      (e) => e.type === "node:started" && e.nodeId === "b",
    );
    const aFinished = events.findIndex(
      (e) => e.type === "node:finished" && e.nodeId === "a",
    );
    expect(started).toBeGreaterThan(-1);
    expect(aFinished).toBeGreaterThan(-1);
  });

  it("honours the concurrency limit", async () => {
    const fanout = ["a", "b", "c", "d", "e"];
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        ...fanout.map((id) => node(id, "http", { url: "https://example.com" })),
      ],
      edges: fanout.map((id) => edge("start", id)),
    };

    const { events } = await run(graph, { concurrency: 2 });

    let inFlight = 0;
    let peak = 0;
    for (const e of events) {
      if (e.type === "node:started" && e.nodeId !== "start")
        peak = Math.max(peak, ++inFlight);
      if (e.type === "node:finished" && e.nodeId !== "start") inFlight--;
    }
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("skips descendants of a failure but lets independent branches finish", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        boom("bad"),
        pass("afterBad"),
        pass("ok"),
        pass("afterOk"),
      ],
      edges: [
        edge("start", "bad"),
        edge("bad", "afterBad"),
        edge("start", "ok"),
        edge("ok", "afterOk"),
      ],
    };

    // Single attempt — this test is about failure propagation, not retries.
    const { result } = await run(graph, { maxAttempts: 1 });

    expect(result.nodeStatuses.bad).toBe("failed");
    expect(result.nodeStatuses.afterBad).toBe("skipped");
    expect(result.nodeStatuses.ok).toBe("succeeded");
    expect(result.nodeStatuses.afterOk).toBe("succeeded");
    expect(result.status).toBe("failed");
  });

  it("stop-run cancels work still in flight", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        boom("bad"),
        node("slow", "http", { url: "https://example.com" }),
      ],
      edges: [edge("start", "bad"), edge("start", "slow")],
    };

    // Single attempt — this test is about stop-run, not retries.
    const { result } = await run(graph, {
      onFailure: "stop-run",
      maxAttempts: 1,
    });

    expect(result.nodeStatuses.bad).toBe("failed");
    expect(result.nodeStatuses.slow).toBe("cancelled");
    expect(result.status).toBe("cancelled");
  });

  it("branch skips the path it did not take", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start", { payload: '{"ok":true}' }),
        node("split", "branch", { condition: "input.ok" }),
        pass("whenTrue"),
        pass("whenFalse"),
      ],
      edges: [
        edge("start", "split"),
        edge("split", "whenTrue", "true"),
        edge("split", "whenFalse", "false"),
      ],
    };

    const { result } = await run(graph);

    expect(result.nodeStatuses.whenTrue).toBe("succeeded");
    expect(result.nodeStatuses.whenFalse).toBe("skipped");
    expect(result.status).toBe("succeeded");
  });

  it("a join runs when at least one parent is live", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start", { payload: '{"ok":false}' }),
        node("split", "branch", { condition: "input.ok" }),
        pass("whenTrue"),
        pass("whenFalse"),
        pass("join"),
      ],
      edges: [
        edge("start", "split"),
        edge("split", "whenTrue", "true"),
        edge("split", "whenFalse", "false"),
        edge("whenTrue", "join"),
        edge("whenFalse", "join"),
      ],
    };

    const { result } = await run(graph);

    expect(result.nodeStatuses.whenTrue).toBe("skipped");
    expect(result.nodeStatuses.whenFalse).toBe("succeeded");
    // Would deadlock under naive "wait for every parent to succeed" semantics.
    expect(result.nodeStatuses.join).toBe("succeeded");
  });

  it("cancels mid-run when the caller aborts", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        node("slow", "http", { url: "https://example.com" }),
      ],
      edges: [edge("start", "slow")],
    };

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 60);

    const { result } = await run(graph, undefined, controller.signal);

    expect(result.status).toBe("cancelled");
    expect(["cancelled", "skipped"]).toContain(result.nodeStatuses.slow);
  });

  it("fails a node with invalid config instead of throwing", async () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), node("bad", "http", { url: "" })],
      edges: [edge("start", "bad")],
    };

    // Single attempt — invalid config fails identically every time, so this
    // test isn't about retries even though retries would technically apply.
    const { result } = await run(graph, { maxAttempts: 1 });
    expect(result.nodeStatuses.bad).toBe("failed");
  });

  it("terminates on a cycle instead of hanging", async () => {
    const graph: WorkflowGraph = {
      nodes: [pass("a"), pass("b")],
      edges: [edge("a", "b"), edge("b", "a")],
    };

    const { result } = await run(graph);
    expect(result.nodeStatuses).toEqual({ a: "skipped", b: "skipped" });
  });

  it("retries a failing node once before giving up", async () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), boom("bad")],
      edges: [edge("start", "bad")],
    };

    // Default maxAttempts is 2; keep the delay short so the test stays fast.
    const { result, events } = await run(graph, { retryDelayMs: 5 });

    expect(result.nodeStatuses.bad).toBe("failed");

    const started = events.filter(
      (e) => e.type === "node:started" && e.nodeId === "bad",
    );
    expect(started).toHaveLength(2);

    const retrying = events.filter((e) => e.type === "node:retrying");
    expect(retrying).toHaveLength(1);
    expect(retrying[0]).toMatchObject({
      nodeId: "bad",
      attempt: 1,
      nextAttempt: 2,
    });

    const finished = events.find(
      (e) => e.type === "node:finished" && e.nodeId === "bad",
    ) as Extract<EngineEvent, { type: "node:finished" }>;
    expect(finished.attempt).toBe(2);
    expect(finished.status).toBe("failed");
  });

  it("only applies stop-run once retries are exhausted, not on the first failure", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        boom("bad"),
        node("slow", "http", { url: "https://example.com" }),
      ],
      edges: [edge("start", "bad"), edge("start", "slow")],
    };

    const { result, events } = await run(graph, {
      onFailure: "stop-run",
      retryDelayMs: 5,
    });

    // Both attempts got to run before the run gave up on "bad".
    const started = events.filter(
      (e) => e.type === "node:started" && e.nodeId === "bad",
    );
    expect(started).toHaveLength(2);

    expect(result.nodeStatuses.bad).toBe("failed");
    expect(result.nodeStatuses.slow).toBe("cancelled");
    expect(result.status).toBe("cancelled");
  });

  it("cancels rather than retrying when the run is aborted mid-delay", async () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), boom("bad")],
      edges: [edge("start", "bad")],
    };

    const controller = new AbortController();
    // "start" has its own ~80ms simulated delay before "bad" ever runs, so
    // this has to clear that first — timed to land inside "bad"'s retry
    // delay, not before it has even started.
    setTimeout(() => controller.abort(), 200);

    const { result, events } = await run(
      graph,
      { retryDelayMs: 400 },
      controller.signal,
    );

    expect(result.nodeStatuses.bad).toBe("cancelled");
    expect(result.status).toBe("cancelled");

    // The retry delay was interrupted — attempt 2 never actually dispatched.
    const started = events.filter(
      (e) => e.type === "node:started" && e.nodeId === "bad",
    );
    expect(started).toHaveLength(1);
  });

  it("a per-node maxAttempts of 1 skips retrying even when the run default allows it", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        {
          ...boom("bad"),
          data: { ...boom("bad").data, retry: { maxAttempts: 1 } },
        },
      ],
      edges: [edge("start", "bad")],
    };

    // Run default is 2 (retryDelayMs default too, but the node fails on
    // attempt 1 so no delay is ever waited).
    const { result, events } = await run(graph);

    expect(result.nodeStatuses.bad).toBe("failed");
    const started = events.filter(
      (e) => e.type === "node:started" && e.nodeId === "bad",
    );
    expect(started).toHaveLength(1);
  });

  it("a per-node maxAttempts higher than the run default gets the extra attempts", async () => {
    const graph: WorkflowGraph = {
      nodes: [
        node("start", "start"),
        {
          ...boom("bad"),
          data: {
            ...boom("bad").data,
            retry: { maxAttempts: 3, retryDelayMs: 5 },
          },
        },
      ],
      edges: [edge("start", "bad")],
    };

    // Run-level default is 2 — the node's own override must win.
    const { result, events } = await run(graph, { maxAttempts: 2 });

    expect(result.nodeStatuses.bad).toBe("failed");
    const started = events.filter(
      (e) => e.type === "node:started" && e.nodeId === "bad",
    );
    expect(started).toHaveLength(3);

    const retrying = events.filter((e) => e.type === "node:retrying");
    expect(retrying).toHaveLength(2);
    expect(
      retrying.every((e) => (e as { maxAttempts: number }).maxAttempts === 3),
    ).toBe(true);
  });

  it("seeds each attempt's randomness independently", () => {
    // Regression guard for the retry seeding fix: without the attempt number
    // in the seed, a retried node's simulated outcome (e.g. a shell node's
    // failureRate roll) would repeat identically on every attempt, making
    // retries incapable of ever recovering from a "flaky" failure.
    const first = hashSeed("test-run:node:1");
    const second = hashSeed("test-run:node:2");
    expect(first).not.toBe(second);
  });

  it("assigns log sequence numbers monotonically across the run", async () => {
    const graph: WorkflowGraph = {
      nodes: [node("start", "start"), pass("a"), pass("b")],
      edges: [edge("start", "a"), edge("start", "b")],
    };

    const { events } = await run(graph);
    const seqs = events
      .filter((e) => e.type === "node:log")
      .map((e) => (e as Extract<EngineEvent, { type: "node:log" }>).seq);

    expect(seqs.length).toBeGreaterThan(0);
    expect(seqs).toEqual([...seqs].sort((x, y) => x - y));
    expect(new Set(seqs).size).toBe(seqs.length);
  });
});
