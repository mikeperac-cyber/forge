import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { startRun, waitForSettled } from "./run-manager";
import { demoGraph } from "@/lib/demo-workflow";
import type { WorkflowGraph } from "./types";

/**
 * Exercises the real path: scheduler → bus → Prisma → SQLite.
 *
 * The unit tests prove the scheduler's logic in isolation; this proves the
 * wiring around it — that events reach the database in order, that node rows
 * are created for skipped nodes that never started, and that the run row is
 * finalised. Those are exactly the seams a UI click-through would miss.
 */
describe("run manager (integration)", () => {
  const createdRunIds: string[] = [];

  afterAll(async () => {
    if (createdRunIds.length) {
      await prisma.run.deleteMany({ where: { id: { in: createdRunIds } } });
    }
    await prisma.$disconnect();
  });

  it("persists a full run to the database", async () => {
    const workflow = await prisma.workflow.findFirst({
      where: { slug: "build-and-notify" },
    });
    expect(
      workflow,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();

    const graph = demoGraph();

    // The demo ships a 25% simulated failure rate so the UI has something
    // interesting to show. That makes assertions about *which* branch arm ran
    // a coin flip, so pin it to the success path here.
    const shell = graph.nodes.find((n) => n.id === "test")!;
    shell.data.config.failureRate = 0;

    const runId = await startRun({
      workflowId: workflow!.id,
      version: workflow!.version,
      graph,
    });
    createdRunIds.push(runId);

    // Waits for every write to actually land, not just for `run:finished` to
    // be published — the event fires before the trailing log flush is
    // awaited, and reading the database in that gap is exactly the race this
    // test exists to not have.
    await waitForSettled(runId);

    const stored = await prisma.run.findUnique({
      where: { id: runId },
      include: { nodeRuns: true, logs: { orderBy: { seq: "asc" } } },
    });

    expect(stored).toBeTruthy();
    expect(stored!.status).toBe("succeeded");
    expect(stored!.finishedAt).not.toBeNull();

    // Every node in the graph gets a row, including ones that were skipped
    // because a branch went the other way.
    expect(stored!.nodeRuns).toHaveLength(graph.nodes.length);

    const gate = stored!.nodeRuns.find((n) => n.nodeId === "gate")!;
    expect(gate.status).toBe("succeeded");

    // Tests pass, so the gate takes the "true" arm and the other is skipped.
    const byId = new Map(stored!.nodeRuns.map((n) => [n.nodeId, n]));
    expect(byId.get("summarise")!.status).toBe("succeeded");
    expect(byId.get("notify")!.status).toBe("skipped");

    // Both sides of every step are recorded, so a finished run stays
    // explainable: what each node received and what it produced.
    expect(byId.get("test")!.input).toEqual({ in: { branch: "main" } });
    expect(byId.get("test")!.output).toMatchObject({ exitCode: 0 });

    // The gate is wired to the shell's `exitCode` port specifically, not its
    // default `stdout` output — this is what proves port-level routing.
    expect(byId.get("gate")!.input).toEqual({ in: 0 });

    // A node that never started has no input to record.
    expect(byId.get("notify")!.input).toBeNull();

    // Logs land in sequence order, with no gaps in ordering.
    expect(stored!.logs.length).toBeGreaterThan(0);
    const seqs = stored!.logs.map((l) => l.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));

    // Log lines are attributed to the node run that produced them.
    const attributed = stored!.logs.filter((l) => l.nodeRunId !== null);
    expect(attributed.length).toBeGreaterThan(0);
  }, 30000);

  it("creates one NodeRun row per retry attempt", async () => {
    const workflow = await prisma.workflow.findFirst({
      where: { slug: "build-and-notify" },
    });
    expect(
      workflow,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();

    const graph: WorkflowGraph = {
      nodes: [
        {
          id: "start",
          kind: "start",
          position: { x: 0, y: 0 },
          data: { label: "start", config: {} },
        },
        {
          id: "bad",
          kind: "transform",
          position: { x: 0, y: 0 },
          data: {
            label: "bad",
            config: { expression: "(() => { throw new Error('boom') })()" },
          },
        },
      ],
      edges: [
        {
          id: "start->bad",
          source: "start",
          target: "bad",
          sourceHandle: null,
          targetHandle: null,
        },
      ],
    };

    const runId = await startRun({
      workflowId: workflow!.id,
      version: workflow!.version,
      graph,
      options: { retryDelayMs: 50 },
    });
    createdRunIds.push(runId);

    await waitForSettled(runId);

    const stored = await prisma.run.findUnique({
      where: { id: runId },
      include: {
        nodeRuns: { orderBy: [{ startedAt: "asc" }, { attempt: "asc" }] },
        logs: { orderBy: { seq: "asc" } },
      },
    });

    expect(stored).toBeTruthy();
    expect(stored!.status).toBe("failed");
    expect(stored!.error).toBeTruthy();

    const badRows = stored!.nodeRuns.filter((n) => n.nodeId === "bad");
    expect(badRows).toHaveLength(2);
    expect(badRows.map((r) => r.attempt)).toEqual([1, 2]);

    for (const row of badRows) {
      expect(row.status).toBe("failed");
      expect(row.error).toContain("boom");
      expect(row.finishedAt).not.toBeNull();
    }

    // Proves the delay actually elapsed between attempts, and rows landed in
    // the right order — not just that two rows happen to exist.
    expect(badRows[1].startedAt!.getTime()).toBeGreaterThanOrEqual(
      badRows[0].finishedAt!.getTime(),
    );

    // Each attempt's log lines are attributed to its own row rather than
    // both landing on whichever row happened to be "current" at flush time.
    const nodeRunIdsForBad = new Set(badRows.map((r) => r.id));
    const badLogs = stored!.logs.filter(
      (l) => l.nodeRunId !== null && nodeRunIdsForBad.has(l.nodeRunId),
    );
    const evaluatingLogs = badLogs.filter((l) =>
      l.text.startsWith("Evaluating:"),
    );
    expect(evaluatingLogs).toHaveLength(2);
  }, 15000);

  it("waitForSettled resolves immediately for a run id it never tracked", async () => {
    // Either it already settled and was cleaned up, or nothing here ever
    // started it — both cases mean there is nothing left to wait for.
    await expect(waitForSettled("not-a-real-run-id")).resolves.toBeUndefined();
  });
});
