import { describe, expect, it } from "vitest";
import { dayBounds, minutesBetween } from "./time";

describe("minutesBetween", () => {
  it("calculates exact minute differences correctly", () => {
    const from = new Date("2026-08-18T10:00:00.000Z");
    const to = new Date("2026-08-18T10:30:00.000Z");
    expect(minutesBetween(from, to)).toBe(30);
  });

  it("returns 0 when from and to dates are identical", () => {
    const date = new Date("2026-08-18T10:00:00.000Z");
    expect(minutesBetween(date, date)).toBe(0);
  });

  it("returns 0 when 'to' date is before 'from' date", () => {
    const from = new Date("2026-08-18T10:30:00.000Z");
    const to = new Date("2026-08-18T10:00:00.000Z");
    expect(minutesBetween(from, to)).toBe(0);
  });

  it("rounds seconds to nearest minute", () => {
    const from = new Date("2026-08-18T10:00:00.000Z");

    // 29 seconds -> rounds down to 0 minutes
    const to29s = new Date("2026-08-18T10:00:29.000Z");
    expect(minutesBetween(from, to29s)).toBe(0);

    // 30 seconds -> rounds up to 1 minute
    const to30s = new Date("2026-08-18T10:00:30.000Z");
    expect(minutesBetween(from, to30s)).toBe(1);

    // 89 seconds (1 min 29s) -> rounds down to 1 minute
    const to89s = new Date("2026-08-18T10:01:29.000Z");
    expect(minutesBetween(from, to89s)).toBe(1);

    // 90 seconds (1 min 30s) -> rounds up to 2 minutes
    const to90s = new Date("2026-08-18T10:01:30.000Z");
    expect(minutesBetween(from, to90s)).toBe(2);
  });

  it("handles differences spanning days and hours", () => {
    const from = new Date("2026-08-18T10:00:00.000Z");
    const to = new Date("2026-08-19T12:15:00.000Z");
    // 26 hours and 15 minutes = 26 * 60 + 15 = 1575 minutes
    expect(minutesBetween(from, to)).toBe(1575);
  });
});

describe("dayBounds", () => {
  it("calculates start and end of day bounds in local time", () => {
    const sample = new Date(2026, 7, 18, 14, 30, 45, 500); // Aug 18, 2026 14:30:45.500
    const { start, end } = dayBounds(sample);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(18);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(19);
    expect(end.getHours()).toBe(0);
    expect(end.getMinutes()).toBe(0);
    expect(end.getSeconds()).toBe(0);
    expect(end.getMilliseconds()).toBe(0);

    // Duration between start and end should be exactly 24 hours (86,400,000 ms or standard day duration in ms, accounting for local time object)
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
