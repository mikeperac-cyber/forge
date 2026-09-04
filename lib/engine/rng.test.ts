import { describe, expect, it, vi } from "vitest";
import { hashSeed, isAbortError, mulberry32, sleep } from "./rng";

describe("mulberry32", () => {
  it("produces deterministic sequence of pseudo-random numbers for a seed", () => {
    const prng1 = mulberry32(12345);
    const prng2 = mulberry32(12345);

    const seq1 = Array.from({ length: 5 }, () => prng1());
    const seq2 = Array.from({ length: 5 }, () => prng2());

    expect(seq1).toEqual(seq2);
  });

  it("produces different sequences for different seeds", () => {
    const prng1 = mulberry32(12345);
    const prng2 = mulberry32(54321);

    const seq1 = Array.from({ length: 5 }, () => prng1());
    const seq2 = Array.from({ length: 5 }, () => prng2());

    expect(seq1).not.toEqual(seq2);
  });

  it("produces numbers in the range [0, 1)", () => {
    const prng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const val = prng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("handles edge seed values (0, negative numbers, bitwise 32-bit cast)", () => {
    const prngZero = mulberry32(0);
    const prngNeg = mulberry32(-12345);
    const prngPosCast = mulberry32(-12345 >>> 0);

    expect(typeof prngZero()).toBe("number");
    expect(prngNeg()).toBe(prngPosCast());
  });
});

describe("hashSeed", () => {
  it("produces deterministic output for a given string", () => {
    expect(hashSeed("run-123:node-abc:1")).toBe(hashSeed("run-123:node-abc:1"));
  });

  it("produces different outputs for different strings", () => {
    expect(hashSeed("input-a")).not.toBe(hashSeed("input-b"));
    expect(hashSeed("")).not.toBe(hashSeed("a"));
  });

  it("always returns an unsigned 32-bit integer", () => {
    const hash1 = hashSeed("some string");
    const hash2 = hashSeed("another string with more characters 123456789");

    expect(hash1).toBeGreaterThanOrEqual(0);
    expect(hash1).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(hash1)).toBe(true);

    expect(hash2).toBeGreaterThanOrEqual(0);
    expect(hash2).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(hash2)).toBe(true);
  });
});

describe("sleep", () => {
  it("resolves after specified duration", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const sleepPromise = sleep(100, controller.signal);

    vi.advanceTimersByTime(100);
    await expect(sleepPromise).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("rejects immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(100, controller.signal)).rejects.toThrow("Aborted");
  });

  it("rejects promptly when signal is aborted mid-sleep", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    controller.abort();

    await expect(sleepPromise).rejects.toThrow("Aborted");
  });
});

describe("isAbortError", () => {
  it("returns true for AbortError DOMException or Error with name AbortError", () => {
    const domAbort = new DOMException("Aborted", "AbortError");
    const customAbort = new Error("Aborted");
    customAbort.name = "AbortError";

    expect(isAbortError(domAbort)).toBe(true);
    expect(isAbortError(customAbort)).toBe(true);
  });

  it("returns false for non-AbortError objects or primitives", () => {
    expect(isAbortError(new Error("Regular error"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });
});
