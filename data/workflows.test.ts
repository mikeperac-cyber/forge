import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createWorkflow, renameWorkflow } from "@/data/workflows";

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
    expect(user, "seed the database first: npx tsx prisma/seed.ts").toBeTruthy();
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

    const after = await prisma.workflow.findUnique({ where: { id: workflowId } });
    expect(after?.name).toBe("Rename fixture");
  });

  it("trims and saves a real name", async () => {
    expect(await renameWorkflow(userId, workflowId, "  Renamed  ")).toBe(true);

    const after = await prisma.workflow.findUnique({ where: { id: workflowId } });
    expect(after?.name).toBe("Renamed");
  });

  it("will not rename another account's workflow", async () => {
    expect(await renameWorkflow(otherUserId, workflowId, "Hijacked")).toBe(false);

    const after = await prisma.workflow.findUnique({ where: { id: workflowId } });
    expect(after?.name).toBe("Renamed");
  });
});
