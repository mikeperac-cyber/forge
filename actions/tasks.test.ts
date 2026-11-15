import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";

/**
 * The actions are the seam every button goes through: authenticate → parse →
 * delegate → revalidate. These tests drive that seam directly so validation,
 * path canonicalisation and the ownership checks are proven at the boundary the
 * UI actually calls, not just in the data layer underneath.
 */

const session = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/lib/session", () => ({
  requireUserId: async () => session.userId,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  browsePathsAction,
  createTaskAction,
  deleteTaskAction,
  setTaskStatusAction,
} = await import("./tasks");

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("task actions (integration)", () => {
  let otherUserId: string;
  let otherGoalId: string;
  let tmpRoot = "";

  beforeAll(async () => {
    const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    expect(
      user,
      "seed the database first: npx tsx prisma/seed.ts",
    ).toBeTruthy();
    session.userId = user!.id;

    const other = await prisma.user.create({
      data: {
        email: `tasks-actions-${Date.now()}@local`,
        name: "Actions fixture",
        passwordHash: "x",
      },
    });
    otherUserId = other.id;
    const otherGoal = await prisma.goal.create({
      data: { userId: otherUserId, title: "Not yours" },
    });
    otherGoalId = otherGoal.id;

    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "forge-browse-"));
    await fs.mkdir(path.join(tmpRoot, "inner"));
    await fs.writeFile(path.join(tmpRoot, "file.txt"), "hello");
  });

  afterAll(async () => {
    await prisma.task.deleteMany({
      where: { userId: { in: [session.userId, otherUserId] } },
    });
    await prisma.goal.deleteMany({ where: { id: otherGoalId } });
    await prisma.user.deleteMany({ where: { id: otherUserId } });
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("creates a task, canonicalising the path it was given", async () => {
    const entered = path.join(tmpRoot, "inner") + path.sep;
    const result = await createTaskAction(
      form({
        title: "  Polish the picker  ",
        path: entered,
        pathKind: "folder",
      }),
    );
    expect(result).toEqual({ ok: true });

    const stored = await prisma.task.findFirst({
      where: { userId: session.userId, title: "Polish the picker" },
    });
    expect(stored?.displayPath).toBe(entered.replace(/[\\/]$/, ""));
    expect(stored?.path).toBe(
      process.platform === "win32"
        ? entered.replace(/[\\/]$/, "").toLowerCase()
        : entered.replace(/[\\/]$/, ""),
    );
    expect(stored?.pathKind).toBe("folder");
  });

  it("stores no path when none was given", async () => {
    await createTaskAction(form({ title: "No target" }));
    const stored = await prisma.task.findFirst({
      where: { userId: session.userId, title: "No target" },
    });
    expect(stored?.path).toBeNull();
    expect(stored?.displayPath).toBeNull();
    expect(stored?.pathKind).toBeNull();
  });

  it("rejects an empty title before touching the database", async () => {
    const before = await prisma.task.count({
      where: { userId: session.userId },
    });
    const result = await createTaskAction(form({ title: "   " }));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/title/i);
    expect(await prisma.task.count({ where: { userId: session.userId } })).toBe(
      before,
    );
  });

  it("refuses a forged goal id", async () => {
    const result = await createTaskAction(
      form({ title: "Forged", goalId: otherGoalId }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/goal/i);
    expect(
      await prisma.task.count({
        where: { userId: session.userId, title: "Forged" },
      }),
    ).toBe(0);
  });

  it("completes and reopens through the action", async () => {
    await createTaskAction(form({ title: "Toggle via action" }));
    const task = await prisma.task.findFirst({
      where: { userId: session.userId, title: "Toggle via action" },
    });

    expect(await setTaskStatusAction(task!.id, "done")).toEqual({ ok: true });
    let stored = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(stored?.status).toBe("done");
    expect(stored?.completedAt).not.toBeNull();

    expect(await setTaskStatusAction(task!.id, "open")).toEqual({ ok: true });
    stored = await prisma.task.findUnique({ where: { id: task!.id } });
    expect(stored?.completedAt).toBeNull();
  });

  it("deletes through the action", async () => {
    await createTaskAction(form({ title: "Delete via action" }));
    const task = await prisma.task.findFirst({
      where: { userId: session.userId, title: "Delete via action" },
    });

    expect(await deleteTaskAction(task!.id)).toEqual({ ok: true });
    expect(
      await prisma.task.findUnique({ where: { id: task!.id } }),
    ).toBeNull();
  });

  it("lists a real directory with folders first", async () => {
    const result = await browsePathsAction(tmpRoot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.listing.dir).toBe(tmpRoot);
    expect(result.listing.entries.map((e) => e.kind)).toEqual([
      "folder",
      "file",
    ]);
    expect(result.listing.entries.map((e) => e.name)).toEqual([
      "inner",
      "file.txt",
    ]);
    expect(result.listing.parent).toBe(path.dirname(tmpRoot));
    expect(result.listing.roots).toContain(os.homedir());
    expect(result.listing.truncated).toBe(false);
  });

  it("explains a missing path instead of throwing", async () => {
    const result = await browsePathsAction(path.join(tmpRoot, "nope"));
    expect(result).toEqual({ ok: false, error: "That path doesn't exist" });
  });

  it("explains a file given as a folder", async () => {
    const result = await browsePathsAction(path.join(tmpRoot, "file.txt"));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not a folder/i);
  });
});
