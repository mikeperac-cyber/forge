import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDuration, formatRelative, statusStyle } from "./status";

describe("formatDuration", () => {
  it("shows a dash for null or undefined", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("shows whole milliseconds under a second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("shows one decimal of seconds under a minute", () => {
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(12345)).toBe("12.3s");
  });

  it("shows minutes and seconds at a minute or beyond", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(125_000)).toBe("2m 5s");
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says 'just now' under a minute", () => {
    expect(formatRelative(new Date("2026-08-18T11:59:30.000Z"))).toBe(
      "just now",
    );
  });

  it("shows minutes under an hour", () => {
    expect(formatRelative(new Date("2026-08-18T11:45:00.000Z"))).toBe(
      "15m ago",
    );
  });

  it("shows hours under a day", () => {
    expect(formatRelative(new Date("2026-08-18T09:00:00.000Z"))).toBe("3h ago");
  });

  it("shows days at a day or beyond", () => {
    expect(formatRelative(new Date("2026-08-16T12:00:00.000Z"))).toBe("2d ago");
  });

  it("accepts an ISO string the same as a Date", () => {
    expect(formatRelative("2026-08-18T11:45:00.000Z")).toBe("15m ago");
  });
});

describe("statusStyle", () => {
  it("returns a distinct style for each known status", () => {
    expect(statusStyle("succeeded").label).toBe("Succeeded");
    expect(statusStyle("failed").label).toBe("Failed");
    expect(statusStyle("running").label).toBe("Running");
    expect(statusStyle("cancelled").label).toBe("Cancelled");
    expect(statusStyle("skipped").label).toBe("Skipped");
    expect(statusStyle("pending").label).toBe("Pending");
  });

  it("falls back to the pending style for an unrecognised status", () => {
    expect(statusStyle("not-a-real-status")).toEqual(statusStyle("pending"));
  });
});
