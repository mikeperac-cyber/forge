import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSeed, isAbortError, mulberry32, sleep } from "./rng";

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the specified duration when not aborted", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    let resolved = false;
    sleepPromise.then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);
    await expect(sleepPromise).resolves.toBeUndefined();
  });

  it("rejects immediately with AbortError if signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const sleepPromise = sleep(1000, controller.signal);

    await expect(sleepPromise).rejects.toThrow("Aborted");
    await expect(sleepPromise).rejects.toSatisfy((err: unknown) =>
      isAbortError(err),
    );
  });

  it("rejects promptly with AbortError when aborted during sleep", async () => {
    const controller = new AbortController();
    const sleepPromise = sleep(1000, controller.signal);

    await vi.advanceTimersByTimeAsync(500);
    controller.abort();

    await expect(sleepPromise).rejects.toThrow("Aborted");
    await expect(sleepPromise).rejects.toSatisfy((err: unknown) =>
      isAbortError(err),
    );
  });

  it("cleans up the abort listener on normal completion", async () => {
    const controller = new AbortController();
    const removeEventListenerSpy = vi.spyOn(
      controller.signal,
      "removeEventListener",
    );

    const sleepPromise = sleep(1000, controller.signal);

    await vi.advanceTimersByTimeAsync(1000);
    await sleepPromise;

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "abort",
      expect.any(Function),
    );
  });
});

describe("isAbortError", () => {
  it("identifies AbortError DOMException", () => {
    const err = new DOMException("Aborted", "AbortError");
    expect(isAbortError(err)).toBe(true);
  });

  it("identifies custom Error with name 'AbortError'", () => {
    const err = new Error("Abort request");
    err.name = "AbortError";
    expect(isAbortError(err)).toBe(true);
  });

  it("returns false for non-AbortError objects and primitive values", () => {
    expect(isAbortError(new Error("Standard error"))).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError({ name: "AbortError" })).toBe(false);
  });
});

describe("mulberry32", () => {
  it("generates deterministic random numbers for a given seed", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(12345);

    const values1 = [rng1(), rng1(), rng1()];
    const values2 = [rng2(), rng2(), rng2()];

    expect(values1).toEqual(values2);
    values1.forEach((val) => {
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    });
  });

  it("generates different sequences for different seeds", () => {
    const rng1 = mulberry32(12345);
    const rng2 = mulberry32(54321);

    expect(rng1()).not.toBe(rng2());
  });
});

describe("hashSeed", () => {
  it("produces deterministic 32-bit unsigned integer hash", () => {
    const hash1 = hashSeed("run-123:node-1:1");
    const hash2 = hashSeed("run-123:node-1:1");

    expect(hash1).toBe(hash2);
    expect(hash1).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(hash1)).toBe(true);
  });

  it("produces different hashes for different inputs", () => {
    const hash1 = hashSeed("run-123:node-1:1");
    const hash2 = hashSeed("run-123:node-1:2");

    expect(hash1).not.toBe(hash2);
  });
});
