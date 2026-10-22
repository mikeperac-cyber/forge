import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getRunForReplay,
  getRunLogs,
  getRunStats,
  listRuns,
  ownsRun,
} from "@/data/runs";
import { createWorkflow } from "@/data/workflows";

describe("runs data layer (integration)", () => {
  let userId: string;
  let otherUserId: string;
  let workflowId: string;
  let otherWorkflowId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `runs-test-${Date.now()}@local`,
        name: "Runs fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const wf1 = await createWorkflow(userId, { name: "Runs Test Workflow 1" });
    workflowId = wf1.id;

    const wf2 = await createWorkflow(otherUserId, {
      name: "Runs Test Other Workflow",
    });
    otherWorkflowId = wf2.id;
  });

  afterAll(async () => {
    await prisma.run.deleteMany({
      where: { workflowId: { in: [workflowId, otherWorkflowId] } },
    });
    await prisma.workflow.deleteMany({
      where: { id: { in: [workflowId, otherWorkflowId] } },
    });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  describe("getRunStats", () => {
    it("returns zero stats and null medianMs when user has no runs", async () => {
      const stats = await getRunStats(otherUserId);
      expect(stats).toEqual({
        total: 0,
        succeeded: 0,
        failed: 0,
        running: 0,
        medianMs: null,
      });
    });

    it("calculates status counts, duration median, and isolates users correctly", async () => {
      // Create runs for main user
      const baseTime = new Date("2026-08-20T10:00:00Z");

      // Run 1: succeeded, duration 1000ms
      const run1 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "succeeded",
          trigger: "manual",
          startedAt: baseTime,
          finishedAt: new Date(baseTime.getTime() + 1000),
        },
      });

      // Run 2: succeeded, duration 3000ms
      const run2 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "succeeded",
          trigger: "manual",
          startedAt: new Date(baseTime.getTime() + 10000),
          finishedAt: new Date(baseTime.getTime() + 13000),
        },
      });

      // Run 3: failed, duration 2000ms
      const run3 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "failed",
          trigger: "manual",
          startedAt: new Date(baseTime.getTime() + 20000),
          finishedAt: new Date(baseTime.getTime() + 22000),
        },
      });

      // Run 4: running, no finishedAt
      const run4 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "running",
          trigger: "manual",
          startedAt: new Date(baseTime.getTime() + 30000),
        },
      });

      // Run for other user: failed, duration 5000ms
      const otherRun = await prisma.run.create({
        data: {
          workflowId: otherWorkflowId,
          version: 1,
          status: "failed",
          trigger: "manual",
          startedAt: baseTime,
          finishedAt: new Date(baseTime.getTime() + 5000),
        },
      });

      try {
        const stats = await getRunStats(userId);

        expect(stats.total).toBe(4);
        expect(stats.succeeded).toBe(2);
        expect(stats.failed).toBe(1);
        expect(stats.running).toBe(1);

        // Finished durations: 1000, 2000, 3000 -> sorted [1000, 2000, 3000]
        // floor(3 / 2) = index 1 -> 2000ms
        expect(stats.medianMs).toBe(2000);

        // Verify other user's stats remain isolated
        const otherStats = await getRunStats(otherUserId);
        expect(otherStats.total).toBe(1);
        expect(otherStats.failed).toBe(1);
        expect(otherStats.medianMs).toBe(5000);
      } finally {
        await prisma.run.deleteMany({
          where: {
            id: { in: [run1.id, run2.id, run3.id, run4.id, otherRun.id] },
          },
        });
      }
    });

    it("calculates medianMs correctly with an even number of finished runs", async () => {
      const baseTime = new Date("2026-08-20T10:00:00Z");

      const run1 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "succeeded",
          trigger: "manual",
          startedAt: baseTime,
          finishedAt: new Date(baseTime.getTime() + 1000),
        },
      });

      const run2 = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "succeeded",
          trigger: "manual",
          startedAt: new Date(baseTime.getTime() + 5000),
          finishedAt: new Date(baseTime.getTime() + 9000), // 4000ms
        },
      });

      try {
        const stats = await getRunStats(userId);
        // Durations: [1000, 4000], index floor(2/2) = 1 -> 4000
        expect(stats.medianMs).toBe(4000);
      } finally {
        await prisma.run.deleteMany({
          where: { id: { in: [run1.id, run2.id] } },
        });
      }
    });

    it("respects the 200 runs limit cap ordered by startedAt desc", async () => {
      const baseTime = new Date("2026-08-01T00:00:00Z");

      // Create 205 runs. The oldest 5 have status 'failed', the newest 200 have status 'succeeded'.
      const runsData = [];
      for (let i = 0; i < 205; i++) {
        runsData.push({
          workflowId,
          version: 1,
          status: i < 5 ? "failed" : "succeeded",
          trigger: "manual",
          startedAt: new Date(baseTime.getTime() + i * 1000),
          finishedAt: new Date(baseTime.getTime() + i * 1000 + 500),
        });
      }

      await prisma.run.createMany({ data: runsData });

      try {
        const stats = await getRunStats(userId);
        expect(stats.total).toBe(200);
        expect(stats.succeeded).toBe(200);
        expect(stats.failed).toBe(0);
      } finally {
        await prisma.run.deleteMany({ where: { workflowId } });
      }
    });
  });

  describe("listRuns, ownsRun, getRunForReplay, getRunLogs", () => {
    it("listRuns filters by workflowId, limit, and isolates user", async () => {
      const run = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "succeeded",
          trigger: "manual",
          startedAt: new Date(),
        },
      });

      try {
        const runs = await listRuns(userId, { workflowId, limit: 10 });
        expect(runs).toHaveLength(1);
        expect(runs[0].id).toBe(run.id);

        const otherRuns = await listRuns(otherUserId);
        expect(otherRuns).toHaveLength(0);
      } finally {
        await prisma.run.delete({ where: { id: run.id } });
      }
    });

    it("ownsRun returns true for owner and false for non-owner or invalid id", async () => {
      const run = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "running",
          trigger: "manual",
          startedAt: new Date(),
        },
      });

      try {
        expect(await ownsRun(userId, run.id)).toBe(true);
        expect(await ownsRun(otherUserId, run.id)).toBe(false);
        expect(await ownsRun(userId, "non-existent-run-id")).toBe(false);
      } finally {
        await prisma.run.delete({ where: { id: run.id } });
      }
    });

    it("getRunForReplay retrieves run status and node runs for authorized user", async () => {
      const run = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "running",
          trigger: "manual",
          startedAt: new Date(),
          nodeRuns: {
            create: {
              nodeId: "node-1",
              kind: "transform",
              status: "succeeded",
              startedAt: new Date(),
              finishedAt: new Date(),
            },
          },
        },
      });

      try {
        const replay = await getRunForReplay(userId, run.id);
        expect(replay).not.toBeNull();
        expect(replay?.status).toBe("running");
        expect(replay?.nodeRuns).toHaveLength(1);
        expect(replay?.nodeRuns[0].nodeId).toBe("node-1");

        const unauthorizedReplay = await getRunForReplay(otherUserId, run.id);
        expect(unauthorizedReplay).toBeNull();
      } finally {
        await prisma.run.delete({ where: { id: run.id } });
      }
    });

    it("getRunLogs fetches logs after a given sequence number and isolates user", async () => {
      const run = await prisma.run.create({
        data: {
          workflowId,
          version: 1,
          status: "running",
          trigger: "manual",
          startedAt: new Date(),
        },
      });

      await prisma.logLine.createMany({
        data: [
          {
            runId: run.id,
            seq: 1,
            ts: new Date(),
            stream: "stdout",
            text: "Line 1",
          },
          {
            runId: run.id,
            seq: 2,
            ts: new Date(),
            stream: "stdout",
            text: "Line 2",
          },
          {
            runId: run.id,
            seq: 3,
            ts: new Date(),
            stream: "stderr",
            text: "Line 3",
          },
        ],
      });

      try {
        const allLogs = await getRunLogs(userId, run.id, 0);
        expect(allLogs).toHaveLength(3);
        expect(allLogs[0].text).toBe("Line 1");

        const filteredLogs = await getRunLogs(userId, run.id, 1);
        expect(filteredLogs).toHaveLength(2);
        expect(filteredLogs[0].seq).toBe(2);

        const otherLogs = await getRunLogs(otherUserId, run.id, 0);
        expect(otherLogs).toHaveLength(0);
      } finally {
        await prisma.run.delete({ where: { id: run.id } });
      }
    });
  });
});
