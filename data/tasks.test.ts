import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  countOpenTasks,
  createTask,
  deleteTask,
  listTasks,
  setTaskStatus,
} from "@/data/tasks";

/**
 * Tasks point at files and folders, but `data/tasks.ts` never touches the
 * disk — these tests care about the parts that can actually corrupt state:
 * per-user scoping, the goal-ownership check, and the completedAt invariant.
 */
describe("tasks data layer (integration)", () => {
  let userId: string;
  let otherUserId: string;
  let otherGoalId: string;
  const createdGoalIds: string[] = [];

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `tasks-test-${Date.now()}@local`,
        name: "Tasks fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    // A goal that belongs to *someone else* — used to prove createTask refuses
    // to hang a task off a goal the caller doesn't own.
    const otherGoal = await prisma.goal.create({
      data: { userId: otherUserId, title: "Someone else's goal" },
    });
    otherGoalId = otherGoal.id;
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
    if (createdGoalIds.length > 0) {
      await prisma.goal.deleteMany({ where: { id: { in: createdGoalIds } } });
    }
    await prisma.goal.deleteMany({ where: { id: otherGoalId } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  it("lists only the asking user's tasks", async () => {
    await createTask(otherUserId, { title: "Their task" });
    await createTask(userId, { title: "My task" });

    const mine = await listTasks(userId);
    expect(mine.map((t) => t.title)).toContain("My task");
    expect(mine.map((t) => t.title)).not.toContain("Their task");
  });

  it("keeps the canonical path and the display path apart", async () => {
    const task = await createTask(userId, {
      title: "Fix the build",
      path: "c:\\__forge_tasks__\\app",
      displayPath: "C:\\__forge_tasks__\\app",
      pathKind: "folder",
    });
    expect(task?.path).toBe("c:\\__forge_tasks__\\app");
    expect(task?.displayPath).toBe("C:\\__forge_tasks__\\app");
    expect(task?.pathKind).toBe("folder");

    const [listed] = await listTasks(userId, { status: "open" });
    // Newest first.
    expect(listed.id).toBe(task?.id);
  });

  it("refuses to attach a task to another user's goal", async () => {
    const task = await createTask(userId, {
      title: "Forged link",
      goalId: otherGoalId,
    });
    expect(task).toBeNull();
  });

  it("accepts a goal the caller owns", async () => {
    const goal = await prisma.goal.create({
      data: { userId, title: "Tasks fixture goal" },
    });
    createdGoalIds.push(goal.id);

    const task = await createTask(userId, {
      title: "Owned link",
      goalId: goal.id,
    });
    expect(task?.goalId).toBe(goal.id);
  });

  it("stamps completedAt on done and clears it on reopen", async () => {
    const task = await createTask(userId, { title: "Toggle me" });

    await setTaskStatus(userId, task!.id, "done");
    let stored = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(stored?.status).toBe("done");
    expect(stored?.completedAt).toBeInstanceOf(Date);

    await setTaskStatus(userId, task!.id, "open");
    stored = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(stored?.status).toBe("open");
    // The invariant: a reopened task must not keep a completion time.
    expect(stored?.completedAt).toBeNull();
  });

  it("refuses to touch another user's task", async () => {
    const theirs = await createTask(otherUserId, { title: "Untouchable" });

    expect(await setTaskStatus(userId, theirs!.id, "done")).toBe(false);
    expect(await deleteTask(userId, theirs!.id)).toBe(false);

    const stored = await prisma.task.findUnique({ where: { id: theirs!.id } });
    expect(stored?.status).toBe("open");
  });

  it("counts only open tasks for the asking user", async () => {
    const fresh = await prisma.user.create({
      data: {
        email: `tasks-count-${Date.now()}@local`,
        name: "Count fixture",
        passwordHash: "x",
      },
    });
    try {
      await createTask(fresh.id, { title: "One" });
      await createTask(fresh.id, { title: "Two" });
      const done = await createTask(fresh.id, { title: "Three" });
      await setTaskStatus(fresh.id, done!.id, "done");

      expect(await countOpenTasks(fresh.id)).toBe(2);
      // And the fixture user's open rows never leak into that count.
      expect(await countOpenTasks(userId)).toBeGreaterThanOrEqual(1);
    } finally {
      await prisma.task.deleteMany({ where: { userId: fresh.id } });
      await prisma.user.delete({ where: { id: fresh.id } });
    }
  });
});
