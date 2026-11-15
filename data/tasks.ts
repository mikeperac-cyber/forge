import "server-only";
import { prisma } from "@/lib/db";

/**
 * Tasks — things to do, optionally pinned to a file or folder.
 *
 * Same rule as everywhere else in `data/`: `userId` first, filtered on, no
 * exceptions. Nothing here reads, writes or even stat()s the path a task
 * points at; the path is a reference the row carries, not a resource this
 * layer owns.
 */

export interface TaskSummary {
  id: string;
  title: string;
  note: string | null;
  status: string;
  /** Canonical target path — for matching, never for display. */
  path: string | null;
  /** Original casing — this is the one the screen shows. */
  displayPath: string | null;
  /** file | folder, when the task has a target. */
  pathKind: string | null;
  goal: { id: string; title: string } | null;
  createdAt: Date;
  completedAt: Date | null;
}

export async function listTasks(
  userId: string,
  opts: { status?: string; limit?: number } = {},
): Promise<TaskSummary[]> {
  const rows = await prisma.task.findMany({
    where: { userId, ...(opts.status ? { status: opts.status } : {}) },
    orderBy: [{ createdAt: "desc" }],
    take: opts.limit,
    include: { goal: { select: { id: true, title: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    note: row.note,
    status: row.status,
    path: row.path,
    displayPath: row.displayPath,
    pathKind: row.pathKind,
    goal: row.goal,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  }));
}

export async function createTask(
  userId: string,
  input: {
    title: string;
    note?: string | null;
    path?: string | null;
    displayPath?: string | null;
    pathKind?: "file" | "folder" | null;
    goalId?: string | null;
  },
) {
  // Ownership first — a forged goalId would otherwise hang someone else's goal
  // off this task, exactly like the project-linking check next door.
  if (input.goalId) {
    const owned = await prisma.goal.count({
      where: { id: input.goalId, userId },
    });
    if (!owned) return null;
  }

  return prisma.task.create({
    data: {
      userId,
      title: input.title,
      note: input.note || null,
      path: input.path || null,
      displayPath: input.displayPath || null,
      pathKind: input.pathKind ?? null,
      goalId: input.goalId || null,
    },
  });
}

export async function setTaskStatus(
  userId: string,
  taskId: string,
  status: "open" | "done",
) {
  const result = await prisma.task.updateMany({
    where: { id: taskId, userId },
    data: {
      status,
      // Cleared on reopen, so "done when?" always reflects the current state
      // rather than the first time it was ticked.
      completedAt: status === "done" ? new Date() : null,
    },
  });
  return result.count > 0;
}

export async function deleteTask(userId: string, taskId: string) {
  const result = await prisma.task.deleteMany({
    where: { id: taskId, userId },
  });
  return result.count > 0;
}

/** Just the number, for the sidebar badge — same reasoning as countActiveGoals. */
export async function countOpenTasks(userId: string): Promise<number> {
  return prisma.task.count({ where: { userId, status: "open" } });
}

/** Open tasks for a specific target path, for the project row hint. */
export async function countOpenTasksForPath(
  userId: string,
  path: string,
): Promise<number> {
  return prisma.task.count({ where: { userId, path, status: "open" } });
}
