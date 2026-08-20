import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  configSchemaFor,
  describeSchedule,
  intervalConfigSchema,
} from "./schedule";

describe("computeNextRun", () => {
  describe("interval", () => {
    it("adds the interval to `after` exactly", () => {
      const after = new Date("2026-08-18T09:00:00.000Z");
      const next = computeNextRun("interval", { minutes: 30 }, after);
      expect(next.toISOString()).toBe("2026-08-18T09:30:00.000Z");
    });
  });

  describe("daily", () => {
    it("picks today's occurrence when the time hasn't passed yet", () => {
      const after = new Date(2026, 7, 18, 8, 0, 0); // 08:00 local
      const next = computeNextRun("daily", { hour: 9, minute: 0 }, after);
      expect(next.getDate()).toBe(18);
      expect(next.getHours()).toBe(9);
      expect(next.getMinutes()).toBe(0);
    });

    it("rolls to tomorrow when today's time already passed", () => {
      const after = new Date(2026, 7, 18, 10, 0, 0); // 10:00 local
      const next = computeNextRun("daily", { hour: 9, minute: 0 }, after);
      expect(next.getDate()).toBe(19);
    });

    it("rolls to tomorrow rather than firing again at the exact boundary", () => {
      const after = new Date(2026, 7, 18, 9, 0, 0);
      const next = computeNextRun("daily", { hour: 9, minute: 0 }, after);
      expect(next.getDate()).toBe(19);
    });

    it("crosses a month boundary correctly", () => {
      const after = new Date(2026, 7, 31, 10, 0, 0); // Aug 31, past 09:00
      const next = computeNextRun("daily", { hour: 9, minute: 0 }, after);
      expect(next.getMonth()).toBe(8); // September
      expect(next.getDate()).toBe(1);
    });
  });

  describe("weekly", () => {
    it("picks this week's occurrence when the day and time are still ahead", () => {
      // 2026-08-18 is a Tuesday (dayOfWeek 2).
      const after = new Date(2026, 7, 17, 12, 0, 0); // Monday noon
      const next = computeNextRun(
        "weekly",
        { dayOfWeek: 2, hour: 9, minute: 0 },
        after,
      );
      expect(next.getDay()).toBe(2);
      expect(next.getDate()).toBe(18);
    });

    it("rolls to next week when the target day already passed this week", () => {
      // Wednesday, targeting Tuesday — Tuesday won't come again for 6 days.
      const after = new Date(2026, 7, 19, 12, 0, 0); // Wednesday
      const next = computeNextRun(
        "weekly",
        { dayOfWeek: 2, hour: 9, minute: 0 },
        after,
      );
      expect(next.getDay()).toBe(2);
      expect(next.getDate()).toBe(25); // the following Tuesday
    });

    it("rolls a full week when it's the target day but the time already passed", () => {
      const after = new Date(2026, 7, 18, 10, 0, 0); // Tuesday 10:00, target 09:00
      const next = computeNextRun(
        "weekly",
        { dayOfWeek: 2, hour: 9, minute: 0 },
        after,
      );
      expect(next.getDate()).toBe(25);
    });

    it("picks later today when it's the target day and the time hasn't passed", () => {
      const after = new Date(2026, 7, 18, 8, 0, 0); // Tuesday 08:00, target 09:00
      const next = computeNextRun(
        "weekly",
        { dayOfWeek: 2, hour: 9, minute: 0 },
        after,
      );
      expect(next.getDate()).toBe(18);
      expect(next.getHours()).toBe(9);
    });
  });
});

describe("describeSchedule", () => {
  it("describes a sub-hour interval in minutes", () => {
    expect(describeSchedule("interval", { minutes: 30 })).toBe(
      "Every 30 minutes",
    );
  });

  it("describes an hour-aligned interval in hours", () => {
    expect(describeSchedule("interval", { minutes: 120 })).toBe(
      "Every 2 hours",
    );
    expect(describeSchedule("interval", { minutes: 60 })).toBe("Every 1 hour");
  });

  it("describes a daily schedule with zero-padded time", () => {
    expect(describeSchedule("daily", { hour: 9, minute: 5 })).toBe(
      "Daily at 09:05",
    );
  });

  it("describes a weekly schedule with the day name", () => {
    expect(
      describeSchedule("weekly", { dayOfWeek: 1, hour: 9, minute: 0 }),
    ).toBe("Weekly on Monday at 09:00");
  });
});

describe("configSchemaFor", () => {
  it("rejects an interval shorter than the 5-minute floor", () => {
    expect(intervalConfigSchema.safeParse({ minutes: 1 }).success).toBe(false);
    expect(intervalConfigSchema.safeParse({ minutes: 5 }).success).toBe(true);
  });

  it("returns the matching schema for each kind", () => {
    expect(
      configSchemaFor("daily").safeParse({ hour: 24, minute: 0 }).success,
    ).toBe(false);
    expect(
      configSchemaFor("daily").safeParse({ hour: 23, minute: 59 }).success,
    ).toBe(true);
    expect(
      configSchemaFor("weekly").safeParse({ dayOfWeek: 7, hour: 0, minute: 0 })
        .success,
    ).toBe(false);
  });
});
