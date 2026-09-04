import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeRuns,
  bus,
  cancelRun,
  isRunning,
  publish,
  subscribe,
} from "./bus";
import type { EngineEvent } from "./events";

describe("engine/bus", () => {
  beforeEach(() => {
    activeRuns.clear();
    bus.removeAllListeners();
  });

  afterEach(() => {
    activeRuns.clear();
    bus.removeAllListeners();
  });

  describe("cancelRun", () => {
    it("returns false if the runId is not active", () => {
      expect(cancelRun("non-existent-run")).toBe(false);
    });

    it("aborts the AbortController and returns true if the runId is active", () => {
      const controller = new AbortController();
      const abortSpy = vi.spyOn(controller, "abort");

      activeRuns.set("run-123", controller);

      expect(controller.signal.aborted).toBe(false);
      const result = cancelRun("run-123");

      expect(result).toBe(true);
      expect(abortSpy).toHaveBeenCalledTimes(1);
      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("isRunning", () => {
    it("returns false if runId is not in activeRuns", () => {
      expect(isRunning("run-456")).toBe(false);
    });

    it("returns true if runId is in activeRuns", () => {
      const controller = new AbortController();
      activeRuns.set("run-456", controller);

      expect(isRunning("run-456")).toBe(true);
    });
  });

  describe("publish & subscribe", () => {
    it("publishes engine events to subscribers for a given runId", () => {
      const listener = vi.fn();
      const runId = "run-789";

      const unsubscribe = subscribe(runId, listener);

      const event: EngineEvent = {
        type: "run:started",
        runId,
        at: Date.now(),
      };

      publish(event);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(event);

      unsubscribe();
    });

    it("allows unsubscribing from bus events", () => {
      const listener = vi.fn();
      const runId = "run-789";

      const unsubscribe = subscribe(runId, listener);
      unsubscribe();

      const event: EngineEvent = {
        type: "run:started",
        runId,
        at: Date.now(),
      };

      publish(event);

      expect(listener).not.toHaveBeenCalled();
    });

    it("only triggers listeners subscribed to the specific runId", () => {
      const listenerRun1 = vi.fn();
      const listenerRun2 = vi.fn();

      const unsubscribe1 = subscribe("run-1", listenerRun1);
      const unsubscribe2 = subscribe("run-2", listenerRun2);

      const event1: EngineEvent = {
        type: "run:started",
        runId: "run-1",
        at: Date.now(),
      };

      publish(event1);

      expect(listenerRun1).toHaveBeenCalledWith(event1);
      expect(listenerRun2).not.toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });
  });
});
