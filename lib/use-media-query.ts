"use client";

import { useSyncExternalStore } from "react";

/**
 * Reads a media query without an effect.
 *
 * The usual `useState` + `useEffect` version calls setState during the effect,
 * which cascades an extra render on every mount and briefly reports the wrong
 * answer. `useSyncExternalStore` is what React provides for exactly this: an
 * external source of truth with a subscription and a server snapshot.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onStoreChange);
      return () => list.removeEventListener("change", onStoreChange);
    },
    () => window.matchMedia(query).matches,
    // The server has no viewport. Assume roomy so markup matches the common
    // case and narrow screens correct themselves on hydration.
    () => false,
  );
}
