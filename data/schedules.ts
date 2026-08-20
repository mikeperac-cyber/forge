import "server-only";
import { prisma } from "@/lib/db";
import { computeNextRun, type ScheduleKind } from "@/lib/schedule";

/**
 * Same rule as everywhere else in `data/`: `userId` first, filtered on — with
 * one deliberate exception. `dueSchedules()` has no `userId` because the
 * poller (`scripts/run-schedules.ts`) runs system-wide across every account
 * on this machine; it is never called from a request, so there is no session
 * to scope it to. Every other function here keeps the rule.
 */

export interface ScheduleSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowSlug: string;
  kind: ScheduleKind;
  config: unknown;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date;
}

export async function listSchedules(
  userId: string,
): Promise<ScheduleSummary[]> {
  const rows = await prisma.schedule.findMany({
    where: { userId },
    orderBy: { nextRunAt: "asc" },
    include: { workflow: { select: { name: true, slug: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    workflowId: row.workflowId,
    workflowName: row.workflow.name,
    workflowSlug: row.workflow.slug,
    kind: row.kind as ScheduleKind,
    config: row.config,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
  }));
}

export async function createSchedule(
  userId: string,
  input: { workflowId: string; kind: ScheduleKind; config: unknown },
) {
  // Ownership first — a forged workflowId would otherwise schedule someone
  // else's workflow to run on this account's clock.
  const owned = await prisma.workflow.count({
    where: { id: input.workflowId, userId },
  });
  if (!owned) return null;

  return prisma.schedule.create({
    data: {
      userId,
      workflowId: input.workflowId,
      kind: input.kind,
      config: input.config as never,
      nextRunAt: computeNextRun(input.kind, input.config, new Date()),
    },
  });
}

export async function setScheduleEnabled(
  userId: string,
  scheduleId: string,
  enabled: boolean,
) {
  const schedule = await prisma.schedule.findFirst({
    where: { id: scheduleId, userId },
  });
  if (!schedule) return false;

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      enabled,
      // Re-enabling from a stale nextRunAt would fire it immediately for
      // however long it sat off — recompute from now instead.
      nextRunAt: enabled
        ? computeNextRun(
            schedule.kind as ScheduleKind,
            schedule.config,
            new Date(),
          )
        : schedule.nextRunAt,
    },
  });
  return true;
}

export async function deleteSchedule(userId: string, scheduleId: string) {
  const result = await prisma.schedule.deleteMany({
    where: { id: scheduleId, userId },
  });
  return result.count > 0;
}

/**
 * Every schedule ready to fire, across every account — the poller's one
 * query. Indexed on `(enabled, nextRunAt)` so this stays a single lookup
 * regardless of how many schedules accumulate.
 */
export async function dueSchedules(now: Date) {
  return prisma.schedule.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    include: { workflow: true },
  });
}

/** Called once a due schedule has actually been fired. */
export async function markScheduleFired(scheduleId: string, firedAt: Date) {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule) return;

  await prisma.schedule.update({
    where: { id: scheduleId },
    data: {
      lastRunAt: firedAt,
      nextRunAt: computeNextRun(
        schedule.kind as ScheduleKind,
        schedule.config,
        firedAt,
      ),
    },
  });
}
