import "server-only";
import { prisma } from "@/lib/db";
import { getObservedMinutesByGoal } from "@/data/projects";

/**
 * Goals, with time rolled up from sessions.
 *
 * Same rule as everywhere else in `data/`: `userId` first, filtered on, no
 * exceptions. Nothing here can reach another account's rows.
 */

export interface GoalSummary {
  id: string;
  title: string;
  why: string | null;
  status: string;
  targetDate: Date | null;
  targetMinutes: number | null;
  /** Minutes you *claimed* — logged by hand, from finished sessions. */
  spentMinutes: number;
  /**
   * Minutes a tool *witnessed*, via projects linked to this goal.
   *
   * Zero means nothing was observed — usually because no project is linked, not
   * because no work happened. It is never a substitute for `spentMinutes`.
   */
  observedMinutes: number;
  /** 0–100, or null when the goal has no time target to measure against. */
  progress: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

/**
 * The best available estimate of effort against a goal.
 *
 * `max`, never `+`. The two numbers measure overlapping work, not disjoint
 * work: an hour spent with a timer running *and* Claude Code open appears in
 * both, and adding them counts it twice — which on ordinary usage is most
 * hours.
 *
 * Taking the larger is defensible because both are lower bounds. Claimed time
 * misses whatever you forgot to log; observed time misses everything outside a
 * tool in a linked folder — reading, thinking, meetings. Neither can be
 * corrected into the other, so the honest single number is whichever saw more,
 * and both are kept alongside it so the gap stays visible.
 */
export function effortMinutes(
  goal: Pick<GoalSummary, "spentMinutes" | "observedMinutes">,
): number {
  return Math.max(goal.spentMinutes, goal.observedMinutes);
}

export async function listGoals(
  userId: string,
  opts: { status?: string } = {},
): Promise<GoalSummary[]> {
  // Summed in the database rather than by loading every session row and adding
  // it up here — the same shape as `listProjects`. This is what
  // `Session.minutes` exists for.
  const [goals, claimed, observed] = await Promise.all([
    prisma.goal.findMany({
      where: { userId, ...(opts.status ? { status: opts.status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    prisma.session.groupBy({
      by: ["goalId"],
      where: { userId, goalId: { not: null }, endedAt: { not: null } },
      _sum: { minutes: true },
    }),
    getObservedMinutesByGoal(userId),
  ]);

  const claimedByGoal = new Map(
    claimed.map((row) => [row.goalId!, row._sum.minutes ?? 0]),
  );

  return goals.map((goal) => {
    const spentMinutes = claimedByGoal.get(goal.id) ?? 0;
    const observedMinutes = observed.get(goal.id) ?? 0;

    // Progress is measured against effort, not claimed time alone. Otherwise a
    // goal you are demonstrably working on — its project linked, its sessions
    // harvested — shows a bar that never moves, because you never remembered
    // to start a timer.
    const effort = effortMinutes({ spentMinutes, observedMinutes });

    return {
      id: goal.id,
      title: goal.title,
      why: goal.why,
      status: goal.status,
      targetDate: goal.targetDate,
      targetMinutes: goal.targetMinutes,
      spentMinutes,
      observedMinutes,
      progress: goal.targetMinutes
        ? Math.min(100, Math.round((effort / goal.targetMinutes) * 100))
        : null,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt,
    };
  });
}

/**
 * Just the count, for the sidebar badge.
 *
 * `listGoals` joins every goal's sessions and rolls up observed minutes across
 * linked projects. The app shell runs on every navigation and only wants a
 * number, so it must not pay for any of that.
 */
export async function countActiveGoals(userId: string): Promise<number> {
  return prisma.goal.count({ where: { userId, status: "active" } });
}

/**
 * Just id and title, for pickers.
 *
 * Same reasoning as `countActiveGoals`: a dropdown needs two columns, not a
 * rolled-up summary of every session and every linked project.
 */
export async function listGoalOptions(
  userId: string,
): Promise<{ id: string; title: string }[]> {
  return prisma.goal.findMany({
    where: { userId, status: "active" },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getGoal(userId: string, goalId: string) {
  return prisma.goal.findFirst({ where: { id: goalId, userId } });
}

export async function createGoal(
  userId: string,
  input: {
    title: string;
    why?: string;
    targetDate?: Date | null;
    targetMinutes?: number | null;
  },
) {
  return prisma.goal.create({
    data: {
      userId,
      title: input.title,
      why: input.why || null,
      targetDate: input.targetDate ?? null,
      targetMinutes: input.targetMinutes ?? null,
    },
  });
}

export async function setGoalStatus(
  userId: string,
  goalId: string,
  status: "active" | "done" | "archived",
) {
  const result = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: {
      status,
      // Recorded on completion and cleared on reopen, so "done when?" always
      // reflects the current state rather than the first time it was ticked.
      completedAt: status === "done" ? new Date() : null,
    },
  });
  return result.count > 0;
}

export async function deleteGoal(userId: string, goalId: string) {
  const result = await prisma.goal.deleteMany({ where: { id: goalId, userId } });
  return result.count > 0;
}
