import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { effortMinutes, listGoals } from "@/data/goals";

/**
 * Claimed time and observed time, and the rule for combining them.
 *
 * The rule is `max`, not `+`. These assertions exist because the sum is the
 * obvious-looking thing to write, it is wrong, and nothing about the code
 * shouts that — the two numbers cover overlapping work, so adding them counts
 * every hour you had a timer running *and* a tool open twice.
 */
describe("effortMinutes", () => {
  it("takes the larger, never the sum", () => {
    expect(effortMinutes({ spentMinutes: 60, observedMinutes: 45 })).toBe(60);
    expect(effortMinutes({ spentMinutes: 45, observedMinutes: 60 })).toBe(60);
    // The sum would be 105. That is the bug this test exists to catch.
    expect(effortMinutes({ spentMinutes: 60, observedMinutes: 45 })).not.toBe(
      105,
    );
  });

  it("falls back to whichever measurement exists", () => {
    expect(effortMinutes({ spentMinutes: 0, observedMinutes: 30 })).toBe(30);
    expect(effortMinutes({ spentMinutes: 30, observedMinutes: 0 })).toBe(30);
  });

  it("is zero when nothing was recorded either way", () => {
    expect(effortMinutes({ spentMinutes: 0, observedMinutes: 0 })).toBe(0);
  });
});

describe("goal effort (integration)", () => {
  const FIXTURE_PATH =
    process.platform === "win32"
      ? "c:\\__forge_goals__\\app"
      : "/__forge_goals__/app";

  let userId: string;
  let goalId: string;
  let sessionId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const goal = await prisma.goal.create({
      data: { userId, title: "Goal effort fixture", targetMinutes: 240 },
    });
    goalId = goal.id;

    const project = await prisma.project.create({
      data: {
        userId,
        path: FIXTURE_PATH,
        displayPath: FIXTURE_PATH,
        name: "app",
        goalId,
      },
    });

    // 90 minutes witnessed by a tool.
    await prisma.activity.create({
      data: {
        userId,
        projectId: project.id,
        tool: "goal-test-tool",
        sessionRef: "g1",
        startedAt: new Date("2026-08-16T09:00:00.000Z"),
        endedAt: new Date("2026-08-16T12:00:00.000Z"),
        activeMinutes: 90,
        messageCount: 5,
      },
    });

    // 60 minutes claimed by hand, overlapping the same window.
    //
    // `minutes` is set explicitly because this bypasses `stopSession`, which is
    // normally the only thing that finishes a session. A fixture that skipped it
    // would sum to zero and the assertions below would be measuring nothing.
    const session = await prisma.session.create({
      data: {
        userId,
        goalId,
        startedAt: new Date("2026-08-16T09:30:00.000Z"),
        endedAt: new Date("2026-08-16T10:30:00.000Z"),
        minutes: 60,
      },
    });
    sessionId = session.id;
  });

  afterAll(async () => {
    await prisma.activity.deleteMany({
      where: { userId, tool: "goal-test-tool" },
    });
    await prisma.project.deleteMany({ where: { userId, path: FIXTURE_PATH } });
    // Before the goal: `Session.goalId` is `onDelete: SetNull`, so removing the
    // goal first orphans this row instead of taking it along, and every run
    // would leave another hour of phantom time in the real dev database.
    await prisma.session.deleteMany({ where: { id: sessionId } });
    await prisma.goal.deleteMany({ where: { id: goalId } });
  });

  it("reports both measurements separately", async () => {
    const goal = (await listGoals(userId)).find((g) => g.id === goalId)!;

    expect(goal.spentMinutes).toBe(60);
    expect(goal.observedMinutes).toBe(90);
  });

  it("measures progress against the larger, not the sum", async () => {
    const goal = (await listGoals(userId)).find((g) => g.id === goalId)!;

    // Target is 240m. Effort is max(60, 90) = 90 → 38%.
    // The sum, 150, would read 63% — an hour and a half of work reported as
    // two and a half, because the overlap is counted twice.
    expect(goal.progress).toBe(38);
  });

  it("leaves observed at zero for a goal with no linked project", async () => {
    const bare = await prisma.goal.create({
      data: { userId, title: "Unlinked fixture" },
    });

    const goal = (await listGoals(userId)).find((g) => g.id === bare.id)!;
    expect(goal.observedMinutes).toBe(0);

    await prisma.goal.delete({ where: { id: bare.id } });
  });
});
