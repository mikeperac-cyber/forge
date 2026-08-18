import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createWorkflow, saveGraph } from "@/data/workflows";
import { getVersionGraph, listVersions } from "@/data/versions";
import { diffGraphs, summariseDiff } from "@/lib/engine/diff";
import type { WorkflowGraph } from "@/lib/engine/types";

/**
 * Version history against the real database.
 *
 * The subtle part is that snapshots are of *past* graphs — the live graph never
 * has a `WorkflowVersion` row of its own — so every read has to reconcile two
 * sources. These assertions exist to catch an off-by-one there.
 */
describe("version history (integration)", () => {
  let userId: string;
  let workflowId: string;

  const graphA: WorkflowGraph = {
    nodes: [
      {
        id: "s",
        kind: "shell",
        position: { x: 0, y: 0 },
        data: { label: "Build", config: { command: "npm run build", cwd: "." } },
      },
    ],
    edges: [],
  };

  const graphB: WorkflowGraph = {
    nodes: [
      {
        id: "s",
        kind: "shell",
        position: { x: 0, y: 0 },
        data: { label: "Build", config: { command: "npm test", cwd: "." } },
      },
      {
        id: "t",
        kind: "transform",
        position: { x: 240, y: 0 },
        data: { label: "Shape", config: { expression: "input" } },
      },
    ],
    edges: [
      { id: "e1", source: "s", target: "t", sourceHandle: "stdout", targetHandle: "in" },
    ],
  };

  beforeAll(async () => {
    const user = await prisma.user.findFirst();
    expect(user, "seed the database first: npx tsx prisma/seed.ts").toBeTruthy();
    userId = user!.id;

    const workflow = await createWorkflow(userId, { name: "Version fixture" });
    workflowId = workflow.id;
  });

  afterAll(async () => {
    if (workflowId) {
      await prisma.workflow.delete({ where: { id: workflowId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it("archives the outgoing graph on each save", async () => {
    await saveGraph(userId, workflowId, graphA);
    await saveGraph(userId, workflowId, graphB);

    const versions = await listVersions(userId, workflowId);

    // v1 empty (as created) → v2 graphA → v3 graphB, newest first.
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0].isCurrent).toBe(true);
    expect(versions.slice(1).every((v) => !v.isCurrent)).toBe(true);

    expect(versions[0].graph.nodes).toHaveLength(2);
    expect(versions[1].graph.nodes).toHaveLength(1);
    expect(versions[2].graph.nodes).toHaveLength(0);
  });

  it("resolves the live version from the workflow, not a snapshot", async () => {
    const live = await getVersionGraph(userId, workflowId, 3);
    const archived = await getVersionGraph(userId, workflowId, 2);

    expect(live?.nodes.map((n) => n.id)).toEqual(["s", "t"]);
    expect(archived?.nodes.map((n) => n.id)).toEqual(["s"]);
    expect(await getVersionGraph(userId, workflowId, 99)).toBeNull();
  });

  it("describes what each version introduced", async () => {
    const versions = await listVersions(userId, workflowId);
    const diff = diffGraphs(versions[1].graph, versions[0].graph);

    expect(summariseDiff(diff)).toBe("1 node added, 1 node edited, 1 connection added");
    expect(diff.nodesChanged[0].fields).toEqual(["config.command"]);
  });

  it("restoring is itself a save, so it is reversible", async () => {
    const restored = await getVersionGraph(userId, workflowId, 2);
    await saveGraph(userId, workflowId, restored!, "Restored from v2");

    const versions = await listVersions(userId, workflowId);

    expect(versions[0].version).toBe(4);
    expect(versions[0].graph.nodes).toHaveLength(1);
    // The graph that was replaced is still reachable, so restore can be undone.
    expect(versions.find((v) => v.version === 3)?.graph.nodes).toHaveLength(2);
  });

  it("refuses to read another account's history", async () => {
    const stranger = await prisma.user.create({
      data: { email: `stranger-${workflowId}@local`, name: "Stranger", passwordHash: "x" },
    });

    expect(await listVersions(stranger.id, workflowId)).toEqual([]);
    expect(await getVersionGraph(stranger.id, workflowId, 2)).toBeNull();

    await prisma.user.delete({ where: { id: stranger.id } });
  });
});
