import { EventEmitter } from "node:events";
import type { EngineEvent } from "./events";

/**
 * In-process fan-out, keyed by run id.
 *
 * The scheduler publishes here; persistence and every connected SSE client
 * subscribe. Kept on `globalThis` because Next re-evaluates modules on hot
 * reload, and a fresh emitter mid-run would orphan live subscribers.
 */
const globalForBus = globalThis as unknown as {
  forgeBus?: EventEmitter;
  forgeRuns?: Map<string, AbortController>;
};

export const bus: EventEmitter = (globalForBus.forgeBus ??= new EventEmitter());
// Every viewer of a run adds a listener; the default cap of 10 would warn.
bus.setMaxListeners(0);

/** Controllers for runs currently in flight, so they can be cancelled. */
export const activeRuns: Map<string, AbortController> =
  (globalForBus.forgeRuns ??= new Map());

export function publish(event: EngineEvent): void {
  bus.emit(event.runId, event);
}

export function subscribe(
  runId: string,
  listener: (event: EngineEvent) => void,
): () => void {
  bus.on(runId, listener);
  return () => {
    bus.off(runId, listener);
  };
}

export function cancelRun(runId: string): boolean {
  const controller = activeRuns.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export function isRunning(runId: string): boolean {
  return activeRuns.has(runId);
}
