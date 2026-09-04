import { describe, expect, it } from "vitest";
import { hashSeed, isAbortError, mulberry32, sleep } from "./rng";

describe("hashSeed", () => {
  it("returns predictable golden hash values for known inputs", () => {
    // FNV-1a 32-bit initial basis and deterministic hashes
    expect(hashSeed("")).toBe(2166136261);
    expect(hashSeed("a")).toBe(3826002220);
    expect(hashSeed("abc")).toBe(2492058047);
  });

  it("is deterministic for identical string inputs", () => {
    const input = "test-run-id:node-1:attempt-2";
    const hash1 = hashSeed(input);
    const hash2 = hashSeed(input);
    expect(hash1).toBe(hash2);
  });

  it("always returns an unsigned 32-bit integer in range [0, 4294967295]", () => {
    const inputs = [
      "",
      "a",
      "hello world",
      "a".repeat(1000),
      "complex-id-12345-!@#$%^&*()_+",
    ];

    for (const input of inputs) {
      const result = hashSeed(input);
      expect(Number.isInteger(result)).toBe(true);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(0xffffffff); // 4294967295
    }
  });

  it("produces distinct hashes for minor string variations", () => {
    // Single character change
    expect(hashSeed("test")).not.toBe(hashSeed("text"));

    // Case change
    expect(hashSeed("test")).not.toBe(hashSeed("Test"));

    // Character order swap
    expect(hashSeed("ab")).not.toBe(hashSeed("ba"));

    // Prefix/suffix variation
    expect(hashSeed("node:1")).not.toBe(hashSeed("node:10"));
    expect(hashSeed("node:1")).not.toBe(hashSeed("node:2"));
  });

  it("handles non-ASCII and Unicode characters", () => {
    const unicodeInput = "café-🚀-öäü";
    const result = hashSeed(unicodeInput);

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBe(hashSeed(unicodeInput));
  });

  it("handles long input strings without overflow or NaN", () => {
    const longString = "x".repeat(10_000);
    const result = hashSeed(longString);

    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("mulberry32", () => {
  it("produces a deterministic sequence of random floats in [0, 1) for a given seed", () => {
    const seed = 12345;
    const rng1 = mulberry32(seed);
    const rng2 = mulberry32(seed);

    const sequence1 = Array.from({ length: 5 }, () => rng1());
    const sequence2 = Array.from({ length: 5 }, () => rng2());

    expect(sequence1).toEqual(sequence2);

    for (const val of sequence1) {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("produces different sequences for different seeds", () => {
    const rng1 = mulberry32(100);
    const rng2 = mulberry32(200);

    const val1 = rng1();
    const val2 = rng2();

    expect(val1).not.toBe(val2);
  });

  it("handles negative and non-32bit-uint seeds by casting with >>> 0", () => {
    const rngNegative = mulberry32(-1);
    const rngUint = mulberry32(0xffffffff);

    expect(rngNegative()).toEqual(rngUint());
  });
});

describe("sleep", () => {
  it("resolves after the specified duration", async () => {
    const controller = new AbortController();
    const start = Date.now();
    await sleep(10, controller.signal);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(5);
  });

  it("rejects immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(1000, controller.signal)).rejects.toThrow("Aborted");
  });

  it("rejects when signal is aborted while sleeping", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    setTimeout(() => controller.abort(), 10);

    await expect(sleepPromise).rejects.toThrow("Aborted");
  });
});

describe("isAbortError", () => {
  it("returns true for DOMException or Error with name AbortError", () => {
    const domAbortErr = new DOMException("Aborted", "AbortError");
    const customAbortErr = new Error("Aborted");
    customAbortErr.name = "AbortError";

    expect(isAbortError(domAbortErr)).toBe(true);
    expect(isAbortError(customAbortErr)).toBe(true);
  });

  it("returns false for non-AbortError values", () => {
    expect(isAbortError(new Error("Generic Error"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });
});
