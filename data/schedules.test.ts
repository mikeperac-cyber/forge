import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createWorkflow } from "@/data/workflows";
import {
  createSchedule,
  deleteSchedule,
  dueSchedules,
  listSchedules,
  markScheduleFired,
  setScheduleEnabled,
} from "@/data/schedules";

describe("schedules (integration)", () => {
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
        email: `schedule-test-${Date.now()}@local`,
        name: "Schedule fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const workflow = await createWorkflow(userId, { name: "Schedule fixture" });
    workflowId = workflow.id;

    const otherWorkflow = await createWorkflow(otherUserId, {
      name: "Someone else's workflow",
    });
    otherWorkflowId = otherWorkflow.id;
  });

  afterAll(async () => {
    await prisma.workflow.deleteMany({
      where: { id: { in: [workflowId, otherWorkflowId] } },
    });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("refuses to schedule a workflow that isn't the caller's", async () => {
    const result = await createSchedule(userId, {
      workflowId: otherWorkflowId,
      kind: "interval",
      config: { minutes: 30 },
    });
    expect(result).toBeNull();
  });

  it("creates a schedule with nextRunAt computed ahead of now", async () => {
    const before = Date.now();
    const schedule = await createSchedule(userId, {
      workflowId,
      kind: "interval",
      config: { minutes: 5 },
    });

    expect(schedule).toBeTruthy();
    expect(schedule!.nextRunAt.getTime()).toBeGreaterThan(before);
    // Within a couple seconds of `before + 5m` — generous for test jitter.
    expect(schedule!.nextRunAt.getTime()).toBeLessThan(
      before + 5 * 60_000 + 5000,
    );
  });

  it("lists the schedule with its workflow name and slug joined in", async () => {
    const schedules = await listSchedules(userId);
    const mine = schedules.find((s) => s.workflowId === workflowId);

    expect(mine).toBeTruthy();
    expect(mine!.workflowName).toBe("Schedule fixture");
    expect(mine!.enabled).toBe(true);
  });

  it("does not appear as due until its time actually arrives", async () => {
    const due = await dueSchedules(new Date());
    expect(due.some((s) => s.workflowId === workflowId)).toBe(false);
  });

  it("appears as due once `now` reaches its nextRunAt", async () => {
    const farFuture = new Date(Date.now() + 10 * 60_000);
    const due = await dueSchedules(farFuture);
    expect(due.some((s) => s.workflowId === workflowId)).toBe(true);
  });

  it("marking it fired moves lastRunAt and pushes nextRunAt forward again", async () => {
    const before = await listSchedules(userId);
    const mine = before.find((s) => s.workflowId === workflowId)!;

    const firedAt = new Date();
    await markScheduleFired(mine.id, firedAt);

    const after = await listSchedules(userId);
    const updated = after.find((s) => s.workflowId === workflowId)!;

    expect(updated.lastRunAt?.getTime()).toBe(firedAt.getTime());
    expect(updated.nextRunAt.getTime()).toBeGreaterThan(firedAt.getTime());
  });

  it("a disabled schedule never shows up as due, however old its nextRunAt", async () => {
    const before = await listSchedules(userId);
    const mine = before.find((s) => s.workflowId === workflowId)!;

    expect(await setScheduleEnabled(userId, mine.id, false)).toBe(true);

    const due = await dueSchedules(new Date(Date.now() + 60 * 60_000));
    expect(due.some((s) => s.workflowId === workflowId)).toBe(false);
  });

  it("re-enabling recomputes nextRunAt from now rather than resuming a stale one", async () => {
    const before = await listSchedules(userId);
    const mine = before.find((s) => s.workflowId === workflowId)!;
    const staleNextRunAt = mine.nextRunAt.getTime();

    const resumedAt = Date.now();
    expect(await setScheduleEnabled(userId, mine.id, true)).toBe(true);

    const after = await listSchedules(userId);
    const updated = after.find((s) => s.workflowId === workflowId)!;

    // If it just resumed the old value, it would still equal `staleNextRunAt`
    // — instead it must be freshly computed from the moment it was resumed.
    expect(updated.nextRunAt.getTime()).toBeGreaterThanOrEqual(resumedAt);
    expect(updated.nextRunAt.getTime()).not.toBe(staleNextRunAt);
  });

  it("will not modify or delete another account's schedule", async () => {
    const before = await listSchedules(userId);
    const mine = before.find((s) => s.workflowId === workflowId)!;

    expect(await setScheduleEnabled(otherUserId, mine.id, false)).toBe(false);
    expect(await deleteSchedule(otherUserId, mine.id)).toBe(false);

    const after = await listSchedules(userId);
    expect(after.some((s) => s.id === mine.id)).toBe(true);
  });

  it("deletes the schedule for its own account", async () => {
    const before = await listSchedules(userId);
    const mine = before.find((s) => s.workflowId === workflowId)!;

    expect(await deleteSchedule(userId, mine.id)).toBe(true);

    const after = await listSchedules(userId);
    expect(after.some((s) => s.id === mine.id)).toBe(false);
  });
});
