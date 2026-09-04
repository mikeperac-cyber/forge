import { describe, expect, it } from "vitest";
import { hashSeed, isAbortError, mulberry32, sleep } from "./rng";

describe("mulberry32", () => {
  it("produces identical sequences for the same seed", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);

    const seq1 = Array.from({ length: 10 }, () => rng1());
    const seq2 = Array.from({ length: 10 }, () => rng2());

    expect(seq1).toEqual(seq2);
  });

  it("produces expected values for known seeds", () => {
    const rng0 = mulberry32(0);
    expect(rng0()).toBeCloseTo(0.26642920868471265, 8);
    expect(rng0()).toBeCloseTo(0.0003297457005828619, 8);

    const rng42 = mulberry32(42);
    expect(rng42()).toBeCloseTo(0.6011037519201636, 8);
    expect(rng42()).toBeCloseTo(0.44829055899754167, 8);
  });

  it("produces different sequences for different seeds", () => {
    const rngA = mulberry32(1);
    const rngB = mulberry32(2);

    const seqA = Array.from({ length: 5 }, () => rngA());
    const seqB = Array.from({ length: 5 }, () => rngB());

    expect(seqA).not.toEqual(seqB);
  });

  it("generates numbers strictly within [0, 1)", () => {
    const rng = mulberry32(999);
    for (let i = 0; i < 10000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });

  it("handles negative seeds by bitwise unsigned conversion (seed >>> 0)", () => {
    const rngNeg = mulberry32(-1);
    const rngPos = mulberry32(4294967295); // -1 >>> 0 is 4294967295

    const seqNeg = Array.from({ length: 5 }, () => rngNeg());
    const seqPos = Array.from({ length: 5 }, () => rngPos());

    expect(seqNeg).toEqual(seqPos);
  });

  it("works seamlessly with hashSeed output as seed", () => {
    const seed1 = hashSeed("run:1:node:a");
    const seed2 = hashSeed("run:1:node:a");

    const rng1 = mulberry32(seed1);
    const rng2 = mulberry32(seed2);

    expect(Array.from({ length: 5 }, () => rng1())).toEqual(
      Array.from({ length: 5 }, () => rng2()),
    );
  });
});

describe("hashSeed", () => {
  it("returns a deterministic unsigned 32-bit integer for a given string", () => {
    const h1 = hashSeed("test-input-string");
    const h2 = hashSeed("test-input-string");

    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(4294967295);
    expect(Number.isInteger(h1)).toBe(true);
  });

  it("produces different hashes for different strings", () => {
    const h1 = hashSeed("run:node:1");
    const h2 = hashSeed("run:node:2");

    expect(h1).not.toBe(h2);
  });

  it("handles empty string input", () => {
    const h = hashSeed("");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(4294967295);
    expect(h).toBe(2166136261); // Initial FNV offset basis >>> 0
  });
});

describe("sleep", () => {
  it("resolves after specified milliseconds when not aborted", async () => {
    const controller = new AbortController();
    const start = Date.now();
    await sleep(20, controller.signal);
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(15);
  });

  it("rejects immediately if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(sleep(100, controller.signal)).rejects.toThrow("Aborted");
  });

  it("rejects promptly when aborted mid-sleep", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(500, controller.signal);

    setTimeout(() => controller.abort(), 20);

    const start = Date.now();
    await expect(sleepPromise).rejects.toThrow("Aborted");
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(200);
  });
});

describe("isAbortError", () => {
  it("returns true for DOMException / Error with name AbortError", () => {
    expect(isAbortError(new DOMException("Aborted", "AbortError"))).toBe(true);

    const customErr = new Error("Custom abort");
    customErr.name = "AbortError";
    expect(isAbortError(customErr)).toBe(true);
  });

  it("returns false for non-AbortError objects and values", () => {
    expect(isAbortError(new Error("Generic error"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });
});
