import "server-only";
import { prisma } from "@/lib/db";
import { projectNameFromPath } from "@/lib/harvest/paths";
import type { HarvestSummary, RawActivity } from "@/lib/harvest/types";

/**
 * The project registry and the activity ledger.
 *
 * Same rule as everywhere else in `data/`: `userId` first, filtered on, no
 * exceptions. Nothing here can reach another account's rows.
 *
 * The distinction this file exists to protect: an `Activity` is time a tool
 * *witnessed*, a `Session` is time you *claimed*. They are never summed into
 * one number without saying which is which.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  /** Original casing — never show `path`, it's lowercased on Windows. */
  displayPath: string;
  status: string;
  note: string | null;
  goal: { id: string; title: string } | null;
  /** Idle-adjusted minutes across every harvested session. */
  activeMinutes: number;
  sessionCount: number;
  lastActiveAt: Date | null;
}

/**
 * Rolled up with `groupBy` rather than `include` + reduce.
 *
 * `listGoals` does the latter, which is fine when a goal has a handful of
 * sessions. Activities accumulate every time any tool is opened, so loading
 * them all into memory to add up one column stops being fine quite quickly.
 */
export async function listProjects(
  userId: string,
  opts: { status?: string } = {},
): Promise<ProjectSummary[]> {
  const projects = await prisma.project.findMany({
    where: { userId, ...(opts.status ? { status: opts.status } : {}) },
    include: { goal: { select: { id: true, title: true } } },
  });

  if (projects.length === 0) return [];

  const totals = await prisma.activity.groupBy({
    by: ["projectId"],
    where: { userId, projectId: { in: projects.map((p) => p.id) } },
    _sum: { activeMinutes: true },
    _count: { _all: true },
    _max: { endedAt: true },
  });

  const byProject = new Map(totals.map((t) => [t.projectId, t]));

  return (
    projects
      .map((project) => {
        const total = byProject.get(project.id);
        return {
          id: project.id,
          name: project.name,
          displayPath: project.displayPath,
          status: project.status,
          note: project.note,
          goal: project.goal,
          activeMinutes: total?._sum.activeMinutes ?? 0,
          sessionCount: total?._count._all ?? 0,
          lastActiveAt: total?._max.endedAt ?? null,
        };
      })
      // Most recently worked in first. A project nobody has touched sorts last
      // rather than arbitrarily.
      .sort(
        (a, b) =>
          (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0),
      )
  );
}

export async function getProject(userId: string, projectId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { goal: { select: { id: true, title: true } } },
  });
}

export interface RecordResult {
  projectsCreated: number;
  activitiesCreated: number;
  activitiesUpdated: number;
}

/**
 * One row as written. Declared here rather than pulled from the generated
 * Prisma namespace to keep this module's imports to the client itself — the
 * shape is still checked against the real input type at each call site.
 */
interface ActivityRow {
  userId: string;
  tool: string;
  sessionRef: string;
  projectId: string;
  startedAt: Date;
  endedAt: Date;
  activeMinutes: number;
  messageCount: number;
  gitBranch: string | null;
  label: string | null;
  harvestedAt: Date;
}

/**
 * Write harvested activity into the ledger.
 *
 * Idempotent by `(userId, tool, sessionRef)`: harvesting the same transcript
 * twice updates the row rather than adding a second one. That matters because
 * a session that is still open gets re-read on every harvest — its `endedAt`
 * and `activeMinutes` grow, and the row has to grow with it.
 *
 * A project is created on first sight of its path and never auto-deleted; a
 * folder you have stopped working in is history, not noise.
 */
export async function recordActivities(
  userId: string,
  activities: RawActivity[],
): Promise<RecordResult> {
  const result: RecordResult = {
    projectsCreated: 0,
    activitiesCreated: 0,
    activitiesUpdated: 0,
  };

  const usable = activities.filter((a) => a.path);
  if (usable.length === 0) return result;

  // A harvester yields one activity per session file, so duplicates shouldn't
  // arise — but a single repeat would fail the whole `createMany` on the unique
  // constraint, taking the batch with it. Last one wins.
  const byKey = new Map<string, RawActivity>();
  for (const activity of usable) {
    byKey.set(`${activity.tool}\0${activity.sessionRef}`, activity);
  }
  const batch = [...byKey.values()];

  const paths = [...new Set(batch.map((a) => a.path))];
  const known = await prisma.project.findMany({
    where: { userId, path: { in: paths } },
    select: { id: true, path: true },
  });
  const projectIdByPath = new Map(known.map((p) => [p.path, p.id]));

  const missing = paths.filter((p) => !projectIdByPath.has(p));
  if (missing.length > 0) {
    // The first activity to mention a path supplies its cased name.
    const firstSeen = new Map<string, RawActivity>();
    for (const activity of batch) {
      if (!firstSeen.has(activity.path)) firstSeen.set(activity.path, activity);
    }

    await prisma.project.createMany({
      data: missing.map((path) => {
        const activity = firstSeen.get(path)!;
        return {
          userId,
          path,
          displayPath: activity.displayPath,
          name: projectNameFromPath(activity.displayPath),
        };
      }),
    });
    result.projectsCreated = missing.length;

    // `createMany` doesn't return ids, so the new rows are read back once
    // rather than inserted one at a time to learn them.
    const created = await prisma.project.findMany({
      where: { userId, path: { in: missing } },
      select: { id: true, path: true },
    });
    for (const project of created)
      projectIdByPath.set(project.path, project.id);
  }

  /* ----------------------------------------------------- activities */

  // Group session references by tool to form compound query conditions.
  const refsByTool = new Map<string, string[]>();
  for (const activity of batch) {
    const list = refsByTool.get(activity.tool) ?? [];
    list.push(activity.sessionRef);
    refsByTool.set(activity.tool, list);
  }

  const existingByKey = new Map<
    string,
    {
      id: string;
      projectId: string;
      startedAt: Date;
      endedAt: Date;
      activeMinutes: number;
      messageCount: number;
      gitBranch: string | null;
      label: string | null;
    }
  >();

  if (refsByTool.size > 0) {
    const orConditions = Array.from(refsByTool.entries()).map(
      ([tool, sessionRefs]) => ({
        tool,
        sessionRef: { in: sessionRefs },
      }),
    );

    const rows = await prisma.activity.findMany({
      where: {
        userId,
        OR: orConditions,
      },
      select: {
        id: true,
        tool: true,
        sessionRef: true,
        projectId: true,
        startedAt: true,
        endedAt: true,
        activeMinutes: true,
        messageCount: true,
        gitBranch: true,
        label: true,
      },
    });

    for (const row of rows) {
      existingByKey.set(`${row.tool}\0${row.sessionRef}`, row);
    }
  }

  const harvestedAt = new Date();
  const toCreate: ActivityRow[] = [];
  const toUpdate: {
    id: string;
    data: Omit<ActivityRow, "userId" | "tool" | "sessionRef">;
  }[] = [];

  for (const activity of batch) {
    const projectId = projectIdByPath.get(activity.path);
    // Only possible if the project write above failed silently, which it
    // doesn't — but attributing an activity to nothing would corrupt the
    // ledger, so it is skipped rather than guessed at.
    if (!projectId) continue;

    const fields = {
      projectId,
      startedAt: activity.startedAt,
      endedAt: activity.endedAt,
      activeMinutes: activity.activeMinutes,
      messageCount: activity.messageCount,
      gitBranch: activity.gitBranch ?? null,
      label: activity.label ?? null,
    };

    const existing = existingByKey.get(
      `${activity.tool}\0${activity.sessionRef}`,
    );

    if (!existing) {
      toCreate.push({
        userId,
        tool: activity.tool,
        sessionRef: activity.sessionRef,
        ...fields,
        harvestedAt,
      });
      continue;
    }

    // A re-harvest re-reads whichever transcripts changed, and most of what it
    // finds is identical to what's already stored. Rewriting those rows would
    // be pure write amplification, so `activitiesUpdated` counts rows that
    // genuinely moved — and `harvestedAt` marks when a row last changed.
    const unchanged =
      existing.projectId === fields.projectId &&
      existing.startedAt.getTime() === fields.startedAt.getTime() &&
      existing.endedAt.getTime() === fields.endedAt.getTime() &&
      existing.activeMinutes === fields.activeMinutes &&
      existing.messageCount === fields.messageCount &&
      existing.gitBranch === fields.gitBranch &&
      existing.label === fields.label;

    if (!unchanged) {
      toUpdate.push({ id: existing.id, data: { ...fields, harvestedAt } });
    }
  }

  // One transaction: either the batch lands or none of it does, and a harvest
  // interrupted between batches leaves whole batches behind rather than half a
  // batch.
  if (toCreate.length > 0 || toUpdate.length > 0) {
    await prisma.$transaction([
      ...(toCreate.length > 0
        ? [prisma.activity.createMany({ data: toCreate })]
        : []),
      ...toUpdate.map((row) =>
        prisma.activity.update({ where: { id: row.id }, data: row.data }),
      ),
    ]);
  }

  result.activitiesCreated = toCreate.length;
  result.activitiesUpdated = toUpdate.length;
  return result;
}

/** Attach a project to a goal, so its harvested time counts toward it. */
export async function setProjectGoal(
  userId: string,
  projectId: string,
  goalId: string | null,
) {
  // Verify the goal is this user's before linking — a forged id would otherwise
  // attach a project to someone else's goal.
  if (goalId) {
    const owned = await prisma.goal.count({ where: { id: goalId, userId } });
    if (!owned) return false;
  }

  const result = await prisma.project.updateMany({
    where: { id: projectId, userId },
    data: { goalId },
  });
  return result.count > 0;
}

export async function setProjectStatus(
  userId: string,
  projectId: string,
  status: "active" | "archived",
) {
  const result = await prisma.project.updateMany({
    where: { id: projectId, userId },
    data: { status },
  });
  return result.count > 0;
}

export async function renameProject(
  userId: string,
  projectId: string,
  name: string,
) {
  const trimmed = name.trim();
  if (!trimmed) return false;

  const result = await prisma.project.updateMany({
    where: { id: projectId, userId },
    data: { name: trimmed },
  });
  return result.count > 0;
}

/**
 * Minutes per goal from harvested activity.
 *
 * Deliberately a separate number from `GoalSummary.spentMinutes`, which counts
 * manual sessions. A goal can show both; it must never show their sum as if it
 * were one measurement.
 */
export async function getObservedMinutesByGoal(
  userId: string,
): Promise<Map<string, number>> {
  /**
   * Grouped by goal in the database, in one query.
   *
   * `groupBy` can't do this: the goal lives on `Project`, and Prisma only
   * groups by columns of the model being queried. Grouping by `projectId`
   * instead meant a second query and a reduce here — every activity row's
   * contribution being re-added in JavaScript.
   *
   * Raw SQL is safe to reach for *here* specifically, because `JOIN … SUM …
   * GROUP BY` is identical on SQLite and Postgres. That is the opposite of the
   * session-duration case, where the arithmetic needs `julianday()` on one and
   * `EXTRACT(EPOCH …)` on the other — which is why that one is a stored column
   * rather than a query.
   *
   * Both tables carry `userId`, and both are filtered on it. The join alone
   * would be enough, but the rule in this directory is that every read proves
   * who is asking.
   */
  const rows = await prisma.$queryRaw<
    { goalId: string; minutes: number | bigint | null }[]
  >`
    SELECT p."goalId" AS "goalId", SUM(a."activeMinutes") AS "minutes"
    FROM "Activity" a
    JOIN "Project" p ON p."id" = a."projectId"
    WHERE a."userId" = ${userId}
      AND p."userId" = ${userId}
      AND p."goalId" IS NOT NULL
    GROUP BY p."goalId"
  `;

  // SUM comes back as a driver-dependent numeric — bigint on some adapters.
  return new Map(rows.map((row) => [row.goalId, Number(row.minutes ?? 0)]));
}

/* ------------------------------------------------------------------ harvest */

/** When this tool was last harvested, or null if it never has been. */
export async function getHarvestState(userId: string, tool: string) {
  return prisma.harvestState.findUnique({
    where: { userId_tool: { userId, tool } },
  });
}

export async function saveHarvestState(
  userId: string,
  tool: string,
  summary: HarvestSummary,
  harvestedAt: Date,
) {
  const counts = {
    filesSeen: summary.filesSeen,
    filesSkipped: summary.filesSkipped,
    activities: summary.activities,
    unattributed: summary.unattributed,
  };

  return prisma.harvestState.upsert({
    where: { userId_tool: { userId, tool } },
    create: { userId, tool, lastHarvestedAt: harvestedAt, ...counts },
    update: { lastHarvestedAt: harvestedAt, ...counts },
  });
}

export async function listHarvestState(userId: string) {
  return prisma.harvestState.findMany({
    where: { userId },
    orderBy: { tool: "asc" },
  });
}
