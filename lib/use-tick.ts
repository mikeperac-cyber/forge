"use client";

import { useSyncExternalStore } from "react";

/**
 * A once-a-second clock, as an external store.
 *
 * The obvious version — `useState` plus an effect that seeds it and starts an
 * interval — calls setState synchronously inside the effect, cascading a render
 * on mount and showing a placeholder for the first second.
 *
 * The snapshot is *cached* in a module variable and refreshed only when the
 * interval fires. Returning `Date.now()` straight from `getSnapshot` would hand
 * React a new value on every call and trip its infinite-loop guard.
 */
let seconds = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);

  if (timer === null) {
    seconds = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      seconds = Math.floor(Date.now() / 1000);
      for (const listener of listeners) listener();
    }, 1000);
  }

  return () => {
    listeners.delete(onStoreChange);
    // Last subscriber leaves — stop the interval rather than ticking forever.
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Unix seconds, updating once a second. Returns 0 on the server. */
export function useTick(): number {
  return useSyncExternalStore(
    subscribe,
    () => (seconds === 0 ? Math.floor(Date.now() / 1000) : seconds),
    () => 0,
  );
}
