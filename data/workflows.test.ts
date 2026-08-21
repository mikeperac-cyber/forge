import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createWorkflow,
  listFailingWorkflows,
  renameWorkflow,
} from "@/data/workflows";

/**
 * Rename is the one field on a workflow with no natural default: everything
 * else is either generated (slug, id) or starts empty (graph). Blank silently
 * accepted here would mean a stray click-away-with-empty-input erases the one
 * thing a person actually named on purpose.
 */
describe("renameWorkflow (integration)", () => {
  let userId: string;
  let otherUserId: string;
  let workflowId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    // A second account, purely to prove nothing crosses between them.
    const other = await prisma.user.create({
      data: {
        email: `rename-test-${Date.now()}@local`,
        name: "Rename fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const workflow = await createWorkflow(userId, { name: "Rename fixture" });
    workflowId = workflow.id;
  });

  afterAll(async () => {
    await prisma.workflow.deleteMany({ where: { id: workflowId } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("refuses a blank name", async () => {
    expect(await renameWorkflow(userId, workflowId, "   ")).toBe(false);

    const after = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    expect(after?.name).toBe("Rename fixture");
  });

  it("trims and saves a real name", async () => {
    expect(await renameWorkflow(userId, workflowId, "  Renamed  ")).toBe(true);

    const after = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    expect(after?.name).toBe("Renamed");
  });

  it("will not rename another account's workflow", async () => {
    expect(await renameWorkflow(otherUserId, workflowId, "Hijacked")).toBe(
      false,
    );

    const after = await prisma.workflow.findUnique({
      where: { id: workflowId },
    });
    expect(after?.name).toBe("Renamed");
  });
});

/**
 * The lean query `/today` relies on for its "Needs you" strip — proving it
 * reads *latest* run status, not "has ever failed," and stays scoped to the
 * caller's own account, without ever touching `data/runs.ts`'s heavier
 * `startRun` machinery.
 */
describe("listFailingWorkflows (integration)", () => {
  let userId: string;
  let otherUserId: string;
  const workflowIds: string[] = [];

  async function runFor(workflowId: string, status: string, startedAt: Date) {
    return prisma.run.create({
      data: {
        workflowId,
        version: 1,
        status,
        trigger: "manual",
        startedAt,
        finishedAt: startedAt,
      },
    });
  }

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `failing-wf-test-${Date.now()}@local`,
        name: "Failing workflow fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const succeeded = await createWorkflow(userId, { name: "All good" });
    const failed = await createWorkflow(userId, { name: "Broken" });
    const recovered = await createWorkflow(userId, { name: "Recovered" });
    const someoneElses = await createWorkflow(otherUserId, {
      name: "Not yours",
    });
    workflowIds.push(succeeded.id, failed.id, recovered.id, someoneElses.id);

    await runFor(succeeded.id, "succeeded", new Date("2026-08-18T09:00:00Z"));

    await runFor(failed.id, "failed", new Date("2026-08-18T09:00:00Z"));

    // Failed once, then succeeded on a later run — the latest run is what
    // counts, not "has ever failed."
    await runFor(recovered.id, "failed", new Date("2026-08-18T08:00:00Z"));
    await runFor(recovered.id, "succeeded", new Date("2026-08-18T09:00:00Z"));

    await runFor(someoneElses.id, "failed", new Date("2026-08-18T09:00:00Z"));
  });

  afterAll(async () => {
    await prisma.workflow.deleteMany({ where: { id: { in: workflowIds } } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("lists only workflows whose latest run failed", async () => {
    const failing = await listFailingWorkflows(userId);
    expect(failing.map((w) => w.name).sort()).toEqual(["Broken"]);
  });

  it("does not flag a workflow that recovered on its latest run", async () => {
    const failing = await listFailingWorkflows(userId);
    expect(failing.some((w) => w.name === "Recovered")).toBe(false);
  });

  it("never crosses into another account's workflows", async () => {
    const failing = await listFailingWorkflows(userId);
    expect(failing.some((w) => w.name === "Not yours")).toBe(false);
  });
});
