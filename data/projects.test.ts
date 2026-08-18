import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getHarvestState,
  getObservedMinutesByGoal,
  listProjects,
  recordActivities,
  renameProject,
  saveHarvestState,
  setProjectGoal,
  setProjectStatus,
} from "@/data/projects";
import { canonicalPath, displayPath } from "@/lib/harvest/paths";
import type { HarvestSummary, RawActivity } from "@/lib/harvest/types";

/**
 * The ledger against the real database.
 *
 * The promise worth testing is idempotency: a harvest re-reads any transcript
 * that changed, which means the *same* session arrives again with a later
 * `endedAt`. If that writes a second row, a day's work doubles every time you
 * harvest, and the ledger becomes worse than no ledger.
 *
 * Fixtures live under a path no real project would use, so a run can't collide
 * with genuinely harvested rows in dev.db.
 */
const FIXTURE_ROOT =
  process.platform === "win32"
    ? "C:\\__forge_test__\\building"
    : "/__forge_test__/building";

function joinFixture(name: string): string {
  return process.platform === "win32"
    ? `${FIXTURE_ROOT}\\${name}`
    : `${FIXTURE_ROOT}/${name}`;
}

function activity(
  over: Partial<RawActivity> & { sessionRef: string; raw: string },
): RawActivity {
  const { raw, ...rest } = over;
  return {
    tool: "test-tool",
    path: canonicalPath(raw),
    displayPath: displayPath(raw),
    startedAt: new Date("2026-08-16T09:00:00.000Z"),
    endedAt: new Date("2026-08-16T10:00:00.000Z"),
    activeMinutes: 30,
    messageCount: 10,
    ...rest,
  };
}

describe("activity ledger (integration)", () => {
  let userId: string;
  let otherUserId: string;
  let otherGoalId: string;

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
        email: `ledger-test-${Date.now()}@local`,
        name: "Ledger fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;

    const goal = await prisma.goal.create({
      data: { userId: otherUserId, title: "Someone else's goal" },
    });
    otherGoalId = goal.id;
  });

  afterAll(async () => {
    // Cascades clear the other account's goal and any projects under it.
    await prisma.user.deleteMany({ where: { id: otherUserId } });
    await prisma.project.deleteMany({
      where: { userId, path: { startsWith: canonicalPath(FIXTURE_ROOT) } },
    });
    await prisma.activity.deleteMany({ where: { userId, tool: "test-tool" } });
    await prisma.harvestState.deleteMany({
      where: { userId, tool: "test-tool" },
    });
  });

  it("creates a project the first time its path is seen", async () => {
    const raw = joinFixture("forge");
    const result = await recordActivities(userId, [
      activity({ sessionRef: "s1", raw }),
    ]);

    expect(result.projectsCreated).toBe(1);
    expect(result.activitiesCreated).toBe(1);

    const project = await prisma.project.findUnique({
      where: { userId_path: { userId, path: canonicalPath(raw) } },
    });
    expect(project?.name).toBe("forge");
  });

  it("updates rather than duplicates when the same session is re-harvested", async () => {
    const raw = joinFixture("forge");

    // The session ran longer. This is the ordinary case, not an edge case:
    // every harvest re-reads whichever transcript is currently open.
    await recordActivities(userId, [
      activity({
        sessionRef: "s1",
        raw,
        endedAt: new Date("2026-08-16T11:00:00.000Z"),
        activeMinutes: 55,
        messageCount: 40,
      }),
    ]);

    const rows = await prisma.activity.findMany({
      where: { userId, tool: "test-tool", sessionRef: "s1" },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].activeMinutes).toBe(55);
    expect(rows[0].messageCount).toBe(40);
  });

  it("collapses two spellings of one folder into a single project", async () => {
    const trailing = `${joinFixture("forge")}${process.platform === "win32" ? "\\" : "/"}`;
    const result = await recordActivities(userId, [
      activity({ sessionRef: "s2", raw: trailing }),
    ]);

    // Same folder, written differently — it must not become a second project.
    expect(result.projectsCreated).toBe(0);

    const count = await prisma.project.count({
      where: { userId, path: canonicalPath(joinFixture("forge")) },
    });
    expect(count).toBe(1);
  });

  it("names a project from the cased path, not the canonical one", async () => {
    const raw = joinFixture("IELTS-4-Weeks");
    await recordActivities(userId, [activity({ sessionRef: "s3", raw })]);

    const project = await prisma.project.findUnique({
      where: { userId_path: { userId, path: canonicalPath(raw) } },
    });

    expect(project?.name).toBe("IELTS-4-Weeks");
    expect(project?.displayPath).toContain("IELTS-4-Weeks");
  });

  it("rolls up minutes and session counts per project", async () => {
    const projects = await listProjects(userId);
    const forge = projects.find((p) => p.name === "forge");

    // s1 (55m, updated) + s2 (30m) both landed on `forge`.
    expect(forge?.sessionCount).toBe(2);
    expect(forge?.activeMinutes).toBe(85);
    expect(forge?.lastActiveAt).toBeInstanceOf(Date);
  });

  it("refuses to link a project to another account's goal", async () => {
    const project = await prisma.project.findUnique({
      where: {
        userId_path: { userId, path: canonicalPath(joinFixture("forge")) },
      },
    });

    const linked = await setProjectGoal(userId, project!.id, otherGoalId);

    expect(linked).toBe(false);
    const after = await prisma.project.findUnique({
      where: { id: project!.id },
    });
    expect(after?.goalId).toBeNull();
  });

  it("attributes observed minutes to a linked goal", async () => {
    const goal = await prisma.goal.create({
      data: { userId, title: "Ledger fixture goal" },
    });

    const project = await prisma.project.findUnique({
      where: {
        userId_path: { userId, path: canonicalPath(joinFixture("forge")) },
      },
    });

    expect(await setProjectGoal(userId, project!.id, goal.id)).toBe(true);

    const totals = await getObservedMinutesByGoal(userId);
    expect(totals.get(goal.id)).toBe(85);

    await prisma.goal.delete({ where: { id: goal.id } });
  });

  it("will not rename a project to blank", async () => {
    const project = await prisma.project.findUnique({
      where: {
        userId_path: { userId, path: canonicalPath(joinFixture("forge")) },
      },
    });

    expect(await renameProject(userId, project!.id, "   ")).toBe(false);
    expect(await renameProject(userId, project!.id, "  Forge  ")).toBe(true);

    const after = await prisma.project.findUnique({
      where: { id: project!.id },
    });
    expect(after?.name).toBe("Forge");
  });

  it("hides archived projects when filtering by status", async () => {
    const project = await prisma.project.findUnique({
      where: {
        userId_path: {
          userId,
          path: canonicalPath(joinFixture("IELTS-4-Weeks")),
        },
      },
    });

    expect(await setProjectStatus(userId, project!.id, "archived")).toBe(true);

    const active = await listProjects(userId, { status: "active" });
    expect(active.some((p) => p.name === "IELTS-4-Weeks")).toBe(false);
  });

  it("remembers the harvest watermark", async () => {
    const summary: HarvestSummary = {
      tool: "test-tool",
      filesSeen: 7,
      filesSkipped: 2,
      activities: 5,
      unattributed: 1,
    };
    const at = new Date("2026-08-16T12:00:00.000Z");

    await saveHarvestState(userId, "test-tool", summary, at);
    const first = await getHarvestState(userId, "test-tool");
    expect(first?.lastHarvestedAt?.toISOString()).toBe(at.toISOString());
    expect(first?.filesSeen).toBe(7);

    // Upsert, not insert — a second harvest moves the watermark rather than
    // leaving two rows to disagree about where we got to.
    const later = new Date("2026-08-16T13:00:00.000Z");
    await saveHarvestState(
      userId,
      "test-tool",
      { ...summary, filesSeen: 9 },
      later,
    );

    const rows = await prisma.harvestState.findMany({
      where: { userId, tool: "test-tool" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].lastHarvestedAt?.toISOString()).toBe(later.toISOString());
    expect(rows[0].filesSeen).toBe(9);
  });
});
