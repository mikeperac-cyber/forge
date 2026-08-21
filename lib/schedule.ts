import { z } from "zod";

/**
 * Three recurrence shapes, not a cron string.
 *
 * Cron is more flexible, but it is also a text field nobody can read at a
 * glance and a parser this project would otherwise have no reason to carry.
 * Interval/daily/weekly covers what a personal automation actually needs —
 * "keep doing this," "once a day," "once a week" — and the UI can be three
 * plain fields instead of a syntax to learn.
 */
export const SCHEDULE_KINDS = ["interval", "daily", "weekly"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export interface IntervalConfig {
  /** Minimum enforced by the schema below — this is not a queue to hammer. */
  minutes: number;
}

export interface DailyConfig {
  hour: number;
  minute: number;
}

export interface WeeklyConfig {
  /** 0 = Sunday, matching `Date.getDay()`. */
  dayOfWeek: number;
  hour: number;
  minute: number;
}

export const intervalConfigSchema = z.object({
  minutes: z.number().int().min(5).max(10_080), // 5 minutes .. 1 week
});

export const dailyConfigSchema = z.object({
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

export const weeklyConfigSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.number().int().min(0).max(59),
});

/** The schema for a given `kind` — the one place that mapping lives. */
export function configSchemaFor(kind: ScheduleKind) {
  switch (kind) {
    case "interval":
      return intervalConfigSchema;
    case "daily":
      return dailyConfigSchema;
    case "weekly":
      return weeklyConfigSchema;
  }
}

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Human-readable summary for the schedules list — never a raw JSON dump. */
export function describeSchedule(kind: ScheduleKind, config: unknown): string {
  switch (kind) {
    case "interval": {
      const { minutes } = config as IntervalConfig;
      if (minutes % 60 === 0) {
        const hours = minutes / 60;
        return `Every ${hours} hour${hours === 1 ? "" : "s"}`;
      }
      return `Every ${minutes} minutes`;
    }
    case "daily": {
      const { hour, minute } = config as DailyConfig;
      return `Daily at ${pad(hour)}:${pad(minute)}`;
    }
    case "weekly": {
      const { dayOfWeek, hour, minute } = config as WeeklyConfig;
      return `Weekly on ${DAY_NAMES[dayOfWeek]} at ${pad(hour)}:${pad(minute)}`;
    }
  }
}

/**
 * The next occurrence strictly after `after` — never equal to it, so a
 * schedule whose time is exactly "now" doesn't compute its own next run as
 * itself and fire twice on the same poll.
 */
export function computeNextRun(
  kind: ScheduleKind,
  config: unknown,
  after: Date,
): Date {
  switch (kind) {
    case "interval": {
      const { minutes } = config as IntervalConfig;
      return new Date(after.getTime() + minutes * 60_000);
    }

    case "daily": {
      const { hour, minute } = config as DailyConfig;
      const next = new Date(after);
      next.setHours(hour, minute, 0, 0);
      if (next <= after) next.setDate(next.getDate() + 1);
      return next;
    }

    case "weekly": {
      const { dayOfWeek, hour, minute } = config as WeeklyConfig;
      const next = new Date(after);
      next.setHours(hour, minute, 0, 0);

      let daysUntil = (dayOfWeek - next.getDay() + 7) % 7;
      // Today, but the time already passed (or this computation IS "now") —
      // push a full week out rather than firing again today.
      if (daysUntil === 0 && next <= after) daysUntil = 7;
      next.setDate(next.getDate() + daysUntil);
      return next;
    }
  }
}
