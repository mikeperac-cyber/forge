import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { demoGraph } from "../lib/demo-workflow";
import type { WorkflowGraph } from "../lib/engine/types";

/**
 * Dev convenience: give the demo workflow a couple of edits so the Versions
 * page has something to show. Mirrors `data/workflows.ts:saveGraph` — archive
 * the outgoing graph, then bump — but talks to Prisma directly, because that
 * module is `server-only` and this runs as a plain script.
 *
 *   npx tsx prisma/seed-history.ts
 */
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! }),
});

async function save(workflowId: string, graph: WorkflowGraph, note: string) {
  const current = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
  });

  await prisma.workflowVersion.upsert({
    where: {
      workflowId_version: { workflowId, version: current.version },
    },
    create: {
      workflowId,
      version: current.version,
      graph: current.graph as never,
      // The outgoing version keeps its own note, not the incoming one.
      note: current.note,
    },
    update: {},
  });

  await prisma.workflow.update({
    where: { id: workflowId },
    data: { graph: graph as never, version: { increment: 1 }, note },
  });
}

async function main() {
  const workflow = await prisma.workflow.findFirst({
    where: { slug: "build-and-notify" },
  });
  if (!workflow) {
    console.log(
      "Demo workflow not found — run `npx tsx prisma/seed.ts` first.",
    );
    return;
  }

  // Idempotent: reset to a pristine v1 so re-running doesn't pile up versions.
  await prisma.workflowVersion.deleteMany({
    where: { workflowId: workflow.id },
  });
  await prisma.workflow.update({
    where: { id: workflow.id },
    data: { graph: demoGraph() as never, version: 1, note: "Initial version" },
  });

  // Edit 1: retune the simulated failure rate.
  const tuned = demoGraph();
  tuned.nodes.find((n) => n.id === "test")!.data.config.failureRate = 0.4;
  await save(workflow.id, tuned, "Raised simulated failure rate");

  // Edit 2: add a step and wire it in, so the diff shows structural change.
  const extended = structuredClone(tuned);
  extended.nodes.push({
    id: "shape",
    kind: "transform",
    position: { x: 850, y: 480 },
    data: {
      label: "Shape result",
      config: { expression: "({ ok: input === 0 })" },
    },
  });
  extended.edges.push({
    id: "e7",
    source: "test",
    target: "shape",
    sourceHandle: "exitCode",
    targetHandle: "in",
  });
  await save(workflow.id, extended, "Added a shaping step");

  const after = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflow.id },
  });
  console.log(`"${after.name}" is now at v${after.version}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
