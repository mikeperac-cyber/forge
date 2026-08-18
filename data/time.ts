import "server-only";
import { prisma } from "@/lib/db";

/**
 * Planned time (Block) and actual time (Session), kept apart on purpose.
 *
 * Collapsing them into one record would lose the only genuinely useful signal:
 * the gap between what you intended to do and what happened.
 */

export interface DayBlock {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  note: string | null;
  goal: { id: string; title: string } | null;
  plannedMinutes: number;
  actualMinutes: number;
}

export interface DayReport {
  date: Date;
  blocks: DayBlock[];
  plannedMinutes: number;
  actualMinutes: number;
  /** Time logged today that wasn't against any planned block. */
  unplannedMinutes: number;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60000));
}

/** Local-time day bounds — a UTC day would cut the evening off in most places. */
export function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function getDayReport(
  userId: string,
  date: Date,
  now: Date,
): Promise<DayReport> {
  const { start, end } = dayBounds(date);

  const [blocks, sessions] = await Promise.all([
    prisma.block.findMany({
      where: { userId, startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: "asc" },
      include: { goal: { select: { id: true, title: true } } },
    }),
    prisma.session.findMany({
      where: { userId, startedAt: { gte: start, lt: end } },
      select: { blockId: true, startedAt: true, endedAt: true },
    }),
  ]);

  // A running session counts up to `now`, passed in rather than read here so
  // the same report renders identically for a given moment.
  const actualFor = (blockId: string | null) =>
    sessions
      .filter((s) => s.blockId === blockId)
      .reduce(
        (total, s) => total + minutesBetween(s.startedAt, s.endedAt ?? now),
        0,
      );

  const dayBlocks: DayBlock[] = blocks.map((block) => ({
    id: block.id,
    title: block.title,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    note: block.note,
    goal: block.goal,
    plannedMinutes: minutesBetween(block.startsAt, block.endsAt),
    actualMinutes: actualFor(block.id),
  }));

  return {
    date: start,
    blocks: dayBlocks,
    plannedMinutes: dayBlocks.reduce((t, b) => t + b.plannedMinutes, 0),
    actualMinutes: sessions.reduce(
      (t, s) => t + minutesBetween(s.startedAt, s.endedAt ?? now),
      0,
    ),
    unplannedMinutes: actualFor(null),
  };
}

export async function createBlock(
  userId: string,
  input: {
    title: string;
    startsAt: Date;
    endsAt: Date;
    goalId?: string | null;
    note?: string;
  },
) {
  // Verify the goal belongs to this user before linking; a forged id would
  // otherwise attach a block to someone else's goal.
  if (input.goalId) {
    const owned = await prisma.goal.count({
      where: { id: input.goalId, userId },
    });
    if (!owned) return null;
  }

  return prisma.block.create({
    data: {
      userId,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      goalId: input.goalId ?? null,
      note: input.note || null,
    },
  });
}

export async function deleteBlock(userId: string, blockId: string) {
  const result = await prisma.block.deleteMany({
    where: { id: blockId, userId },
  });
  return result.count > 0;
}

/** The one session still running, if any. */
export async function getRunningSession(userId: string) {
  return prisma.session.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: {
      goal: { select: { id: true, title: true } },
      block: { select: { id: true, title: true } },
    },
  });
}

export async function startSession(
  userId: string,
  input: { goalId?: string | null; blockId?: string | null; note?: string },
) {
  // One timer at a time. Starting a second silently would produce overlapping
  // spans and double-count the day.
  const running = await prisma.session.findFirst({
    where: { userId, endedAt: null },
  });
  if (running) {
    const endedAt = new Date();
    await prisma.session.update({
      where: { id: running.id },
      data: { endedAt, minutes: minutesBetween(running.startedAt, endedAt) },
    });
  }

  return prisma.session.create({
    data: {
      userId,
      goalId: input.goalId ?? null,
      blockId: input.blockId ?? null,
      note: input.note || null,
    },
  });
}

export async function stopSession(userId: string, sessionId?: string) {
  const session = sessionId
    ? await prisma.session.findFirst({ where: { id: sessionId, userId } })
    : await prisma.session.findFirst({ where: { userId, endedAt: null } });

  if (!session || session.endedAt) return null;

  const endedAt = new Date();

  return prisma.session.update({
    where: { id: session.id },
    // `minutes` is written here and nowhere else. Setting `endedAt` without it
    // would drop this session out of every goal total silently — see the note
    // on the model.
    data: { endedAt, minutes: minutesBetween(session.startedAt, endedAt) },
  });
}

/** Minutes per day over a window, for the week view. */
export async function getRecentTotals(userId: string, days: number, now: Date) {
  const since = new Date(now);
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const sessions = await prisma.session.findMany({
    where: { userId, startedAt: { gte: since } },
    select: { startedAt: true, endedAt: true },
  });

  const totals = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const day = new Date(since);
    day.setDate(day.getDate() + i);
    totals.set(day.toDateString(), 0);
  }

  for (const session of sessions) {
    const key = session.startedAt.toDateString();
    if (!totals.has(key)) continue;
    totals.set(
      key,
      totals.get(key)! +
        minutesBetween(session.startedAt, session.endedAt ?? now),
    );
  }

  return [...totals.entries()].map(([date, minutes]) => ({ date, minutes }));
}
