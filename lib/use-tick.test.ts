// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useTick", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current Unix timestamp in seconds on mount", async () => {
    const { useTick } = await import("./use-tick");
    const expectedSeconds = Math.floor(
      new Date("2026-10-20T12:00:00Z").getTime() / 1000,
    );
    const { result } = renderHook(() => useTick());

    expect(result.current).toBe(expectedSeconds);
  });

  it("updates value every second as fake timers advance", async () => {
    const { useTick } = await import("./use-tick");
    const startSeconds = Math.floor(
      new Date("2026-10-20T12:00:00Z").getTime() / 1000,
    );
    const { result } = renderHook(() => useTick());

    expect(result.current).toBe(startSeconds);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(startSeconds + 1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current).toBe(startSeconds + 3);
  });

  it("handles multiple concurrent subscribers sharing a single timer interval", async () => {
    const { useTick } = await import("./use-tick");
    const startSeconds = Math.floor(
      new Date("2026-10-20T12:00:00Z").getTime() / 1000,
    );

    const hook1 = renderHook(() => useTick());
    const hook2 = renderHook(() => useTick());

    expect(hook1.result.current).toBe(startSeconds);
    expect(hook2.result.current).toBe(startSeconds);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(hook1.result.current).toBe(startSeconds + 1);
    expect(hook2.result.current).toBe(startSeconds + 1);

    // Unmount hook1, hook2 should still tick
    hook1.unmount();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(hook2.result.current).toBe(startSeconds + 2);

    // Unmount hook2, all subscribers gone
    hook2.unmount();
  });

  it("re-starts timer correctly when re-subscribing after all subscribers unmounted", async () => {
    const { useTick } = await import("./use-tick");
    const startSeconds = Math.floor(
      new Date("2026-10-20T12:00:00Z").getTime() / 1000,
    );

    const hook1 = renderHook(() => useTick());
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook1.result.current).toBe(startSeconds + 1);
    hook1.unmount();

    // Advance system time while no subscribers exist
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    const hook2 = renderHook(() => useTick());
    expect(hook2.result.current).toBe(startSeconds + 11);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(hook2.result.current).toBe(startSeconds + 12);

    hook2.unmount();
  });
});
