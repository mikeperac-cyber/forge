"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export interface Tab {
  href: string;
  label: string;
  icon: string;
}

const STORAGE_KEY = "forge.tabs.v1";

/**
 * Tabs are capped rather than allowed to accumulate. An unbounded strip is the
 * same clutter the sidebar exists to remove, and past about eight the labels
 * truncate to the point of being unreadable anyway. The oldest tab that isn't
 * the one you're looking at gets dropped.
 */
const MAX_TABS = 8;

function read(): Tab[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    // Trim on the way in too. Storage written before the cap existed — or by an
    // older build — would otherwise restore an unbounded strip forever.
    return (parsed as Tab[]).slice(-MAX_TABS);
  } catch {
    return [];
  }
}

/**
 * Fold the route being viewed into the strip.
 *
 * Returns `prev` untouched when there is genuinely nothing to change, so an
 * unrelated re-render doesn't produce a new array, a new state, and a pointless
 * rewrite of localStorage.
 */
function mergeTab(prev: Tab[], current: Tab): Tab[] {
  const existing = prev.find((tab) => tab.href === current.href);

  if (existing) {
    if (existing.label === current.label && existing.icon === current.icon) {
      return prev;
    }
    // The label can move under a tab — renaming a workflow, for one.
    return prev.map((tab) => (tab.href === current.href ? current : tab));
  }

  const next = [...prev, current];
  while (next.length > MAX_TABS) {
    // Never evict the tab currently being viewed, even if it's the oldest.
    const victim = next.findIndex((tab) => tab.href !== current.href);
    if (victim === -1) break;
    next.splice(victim, 1);
  }
  return next;
}

/**
 * Open tabs, persisted so a reload restores the workspace rather than dumping
 * you back to a single default — the thing that most makes a web app feel
 * unlike an editor.
 *
 * The list is derived state layered over the router: navigating anywhere opens
 * or focuses a tab, and closing the active one falls back to its neighbour.
 */
export function useTabs(
  current: Tab | null,
  /**
   * Whether an href still resolves. Tabs outlive the routes they point at —
   * remove a page and its tab sits there forever, sending you to a 404 with no
   * hint why. Restored tabs are checked against this before being shown.
   */
  isKnownHref?: (href: string) => boolean,
) {
  const router = useRouter();
  const pathname = usePathname();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [hydrated, setHydrated] = useState(false);

  /**
   * Captured once, and deliberately never updated.
   *
   * The only reader is the mount effect below, which runs a single time and so
   * can only ever observe the first render's validator anyway. Re-assigning
   * this on every render bought nothing and made rendering impure.
   */
  const validateOnMount = useRef(isKnownHref);

  // Deferred to an effect: reading localStorage during render would desync
  // server and client markup.
  useEffect(() => {
    const check = validateOnMount.current;
    setTabs(check ? read().filter((tab) => check(tab.href)) : read());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
  }, [tabs, hydrated]);

  /**
   * Merged while rendering rather than in an effect.
   *
   * React re-runs this component immediately and never commits the in-between
   * state, so the tab and the page it belongs to appear in the same frame. The
   * effect this replaces painted the page first and added its tab one render
   * later, which is both a visible flicker and a cascading render.
   *
   * `current` is memoised by the caller on `[pathname, workflows]`, so the
   * identity check settles after one pass instead of looping.
   */
  const [merged, setMerged] = useState<Tab | null>(null);
  if (hydrated && current && current !== merged) {
    setMerged(current);
    setTabs((prev) => mergeTab(prev, current));
  }

  const close = useCallback(
    (href: string) => {
      const index = tabs.findIndex((tab) => tab.href === href);
      if (index === -1) return;

      const remaining = tabs.filter((tab) => tab.href !== href);
      setTabs(remaining);

      // Navigate outside the updater. An updater has to be pure — React calls
      // it twice in development precisely to catch this — and a router push in
      // there would fire the navigation twice.
      if (href === pathname) {
        const fallback = remaining[index] ?? remaining[index - 1];
        router.push(fallback ? fallback.href : "/workflows");
      }
    },
    [pathname, router, tabs],
  );

  const closeOthers = useCallback((href: string) => {
    setTabs((prev) => prev.filter((tab) => tab.href === href));
  }, []);

  return { tabs, close, closeOthers, active: pathname };
}
