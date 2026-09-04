import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createBlock,
  dayBounds,
  deleteBlock,
  getDayReport,
  getRecentTotals,
  getRunningSession,
  minutesBetween,
  startSession,
  stopSession,
} from "@/data/time";

describe("time utils (unit)", () => {
  it("minutesBetween calculates non-negative rounded minutes between two dates", () => {
    const d1 = new Date("2026-08-16T10:00:00.000Z");
    const d2 = new Date("2026-08-16T10:30:00.000Z");

    expect(minutesBetween(d1, d2)).toBe(30);
    expect(minutesBetween(d2, d1)).toBe(0);

    // Rounding check
    const d3 = new Date("2026-08-16T10:00:00.000Z");
    const d4 = new Date("2026-08-16T10:00:40.000Z"); // 40s -> 1 min
    expect(minutesBetween(d3, d4)).toBe(1);

    const d5 = new Date("2026-08-16T10:00:20.000Z"); // 20s -> 0 min
    expect(minutesBetween(d3, d5)).toBe(0);
  });

  it("dayBounds returns local start of day and start of next day", () => {
    const input = new Date("2026-08-16T14:32:10.000Z");
    const bounds = dayBounds(input);

    expect(bounds.start.getHours()).toBe(0);
    expect(bounds.start.getMinutes()).toBe(0);
    expect(bounds.start.getSeconds()).toBe(0);
    expect(bounds.start.getMilliseconds()).toBe(0);

    const expectedEnd = new Date(bounds.start);
    expectedEnd.setDate(expectedEnd.getDate() + 1);

    expect(bounds.end.getTime()).toBe(expectedEnd.getTime());
  });
});

describe("time tracking (integration)", () => {
  let userId: string;
  let otherUserId: string;
  let ownGoalId: string;
  let otherGoalId: string;

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `time-test-${Date.now()}@local`,
        name: "Time fixture user",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const ownGoal = await prisma.goal.create({
      data: { userId, title: "Time fixture own goal" },
    });
    ownGoalId = ownGoal.id;

    const otherGoal = await prisma.goal.create({
      data: { userId: otherUserId, title: "Time fixture other goal" },
    });
    otherGoalId = otherGoal.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
    await prisma.block.deleteMany({
      where: { userId: { in: [userId, otherUserId] } },
    });
    await prisma.goal.deleteMany({
      where: { id: { in: [ownGoalId, otherGoalId] } },
    });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
  });

  describe("createBlock & deleteBlock", () => {
    it("refuses to attach a block to another user's goal", async () => {
      const block = await createBlock(userId, {
        title: "Forged block",
        startsAt: new Date("2026-08-16T09:00:00.000Z"),
        endsAt: new Date("2026-08-16T10:00:00.000Z"),
        goalId: otherGoalId,
      });

      expect(block).toBeNull();
    });

    it("creates a block attached to an owned goal", async () => {
      const block = await createBlock(userId, {
        title: "Valid block",
        startsAt: new Date("2026-08-16T09:00:00.000Z"),
        endsAt: new Date("2026-08-16T10:00:00.000Z"),
        goalId: ownGoalId,
        note: "Testing block creation",
      });

      expect(block).toBeTruthy();
      expect(block?.title).toBe("Valid block");
      expect(block?.goalId).toBe(ownGoalId);
      expect(block?.note).toBe("Testing block creation");

      // Cleanup
      await deleteBlock(userId, block!.id);
    });

    it("will not delete another user's block", async () => {
      const block = await createBlock(userId, {
        title: "My block",
        startsAt: new Date("2026-08-16T09:00:00.000Z"),
        endsAt: new Date("2026-08-16T10:00:00.000Z"),
      });

      expect(await deleteBlock(otherUserId, block!.id)).toBe(false);
      expect(await deleteBlock(userId, block!.id)).toBe(true);
    });
  });

  describe("sessions: getRunningSession, startSession, stopSession", () => {
    it("starts a session and automatically stops any currently running session", async () => {
      // Ensure clean state
      await prisma.session.deleteMany({ where: { userId } });

      const s1 = await startSession(userId, {
        goalId: ownGoalId,
        note: "First session",
      });

      expect(s1.endedAt).toBeNull();

      const running1 = await getRunningSession(userId);
      expect(running1?.id).toBe(s1.id);
      expect(running1?.goal?.id).toBe(ownGoalId);

      // Start second session
      const s2 = await startSession(userId, {
        note: "Second session",
      });

      // s1 should now be ended and have minutes calculated
      const updatedS1 = await prisma.session.findUnique({
        where: { id: s1.id },
      });
      expect(updatedS1?.endedAt).toBeTruthy();
      expect(updatedS1?.minutes).toBeDefined();

      const running2 = await getRunningSession(userId);
      expect(running2?.id).toBe(s2.id);

      // Cleanup
      await stopSession(userId, s2.id);
      expect(await getRunningSession(userId)).toBeNull();
    });

    it("stops a session and calculates minutes correctly", async () => {
      const s = await startSession(userId, { note: "To be stopped" });

      const stopped = await stopSession(userId, s.id);
      expect(stopped).toBeTruthy();
      expect(stopped?.endedAt).toBeTruthy();
      expect(stopped?.minutes).toBeGreaterThanOrEqual(0);

      // Stopping an already stopped session returns null
      const reStopped = await stopSession(userId, s.id);
      expect(reStopped).toBeNull();
    });

    it("will not stop another user's session", async () => {
      const s = await startSession(userId, { note: "Owner session" });

      const attemptStop = await stopSession(otherUserId, s.id);
      expect(attemptStop).toBeNull();

      // Successfully stop by owner
      const stopped = await stopSession(userId, s.id);
      expect(stopped?.id).toBe(s.id);
    });
  });

  describe("getDayReport & getRecentTotals", () => {
    it("generates a day report including blocks, sessions, planned/actual minutes, and unplanned time", async () => {
      const targetDate = new Date("2026-08-16T12:00:00.000Z");
      const { start } = dayBounds(targetDate);

      // Create a block on targetDate
      const blockStart = new Date(start);
      blockStart.setHours(9, 0, 0, 0);
      const blockEnd = new Date(start);
      blockEnd.setHours(10, 0, 0, 0); // 60 mins planned

      const block = await createBlock(userId, {
        title: "Planned morning block",
        startsAt: blockStart,
        endsAt: blockEnd,
        goalId: ownGoalId,
      });

      // Session 1: completed against block (30 mins)
      const s1Start = new Date(start);
      s1Start.setHours(9, 0, 0, 0);
      const s1End = new Date(start);
      s1End.setHours(9, 30, 0, 0);

      await prisma.session.create({
        data: {
          userId,
          blockId: block!.id,
          goalId: ownGoalId,
          startedAt: s1Start,
          endedAt: s1End,
          minutes: 30,
        },
      });

      // Session 2: unplanned completed session (45 mins)
      const s2Start = new Date(start);
      s2Start.setHours(11, 0, 0, 0);
      const s2End = new Date(start);
      s2End.setHours(11, 45, 0, 0);

      await prisma.session.create({
        data: {
          userId,
          startedAt: s2Start,
          endedAt: s2End,
          minutes: 45,
        },
      });

      // Session 3: running unplanned session started at 14:00, evaluation `now` at 14:15 -> 15 mins
      const s3Start = new Date(start);
      s3Start.setHours(14, 0, 0, 0);

      await prisma.session.create({
        data: {
          userId,
          startedAt: s3Start,
          endedAt: null,
        },
      });

      const now = new Date(start);
      now.setHours(14, 15, 0, 0);

      const report = await getDayReport(userId, targetDate, now);

      expect(report.plannedMinutes).toBe(60);
      expect(report.blocks).toHaveLength(1);
      expect(report.blocks[0].plannedMinutes).toBe(60);
      expect(report.blocks[0].actualMinutes).toBe(30);

      // Unplanned minutes = Session 2 (45m) + Session 3 (15m running up to now) = 60m
      expect(report.unplannedMinutes).toBe(60);

      // Total actual minutes = Session 1 (30m) + Session 2 (45m) + Session 3 (15m) = 90m
      expect(report.actualMinutes).toBe(90);

      // Clean up blocks and sessions
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.block.deleteMany({ where: { userId } });
    });

    it("returns recent totals per day over specified window", async () => {
      const now = new Date("2026-08-16T12:00:00.000Z");

      // Log session today (60m)
      const todayStart = new Date(now);
      todayStart.setHours(9, 0, 0, 0);
      const todayEnd = new Date(now);
      todayEnd.setHours(10, 0, 0, 0);

      await prisma.session.create({
        data: {
          userId,
          startedAt: todayStart,
          endedAt: todayEnd,
          minutes: 60,
        },
      });

      // Log session yesterday (30m)
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      yesterdayStart.setHours(10, 0, 0, 0);
      const yesterdayEnd = new Date(yesterdayStart);
      yesterdayEnd.setHours(10, 30, 0, 0);

      await prisma.session.create({
        data: {
          userId,
          startedAt: yesterdayStart,
          endedAt: yesterdayEnd,
          minutes: 30,
        },
      });

      const totals = await getRecentTotals(userId, 3, now);

      expect(totals).toHaveLength(3);

      const todayKey = new Date(
        new Date(now).setHours(0, 0, 0, 0),
      ).toDateString();
      const yesterdayKey = new Date(
        new Date(yesterdayStart).setHours(0, 0, 0, 0),
      ).toDateString();

      const todayTotal = totals.find((t) => t.date === todayKey);
      const yesterdayTotal = totals.find((t) => t.date === yesterdayKey);

      expect(todayTotal?.minutes).toBe(60);
      expect(yesterdayTotal?.minutes).toBe(30);

      // Clean up
      await prisma.session.deleteMany({ where: { userId } });
    });
  });
});
