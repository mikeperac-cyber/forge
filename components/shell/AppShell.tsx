"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useMediaQuery } from "@/lib/use-media-query";
import { watchSystemTheme } from "@/lib/theme";
import type { RunningSession } from "@/components/time/RunningTimer";
import { Icon } from "./Icon";
import { FIXED_ROUTES } from "./routes";
import { Sidebar } from "./Sidebar";
import { useTabs, type Tab } from "./use-tabs";
import { CommandPalette, type PaletteMode } from "./CommandPalette";

export interface ExplorerWorkflow {
  id: string;
  name: string;
  slug: string;
  nodeCount: number;
  lastRunStatus: string | null;
}

export interface ExplorerRun {
  id: string;
  status: string;
  workflowName: string;
  startedAt: string;
}

interface AppShellProps {
  workflows: ExplorerWorkflow[];
  recentRuns: ExplorerRun[];
  userEmail: string;
  userName: string;
  activeGoals: number;
  runningSession: RunningSession | null;
  children: React.ReactNode;
}

/** Derive the tab for whatever the router is currently showing. */
function currentTab(
  pathname: string,
  workflows: ExplorerWorkflow[],
): Tab | null {
  const match = FIXED_ROUTES[pathname];
  if (match) return { href: pathname, ...match };

  if (pathname.startsWith("/w/")) {
    const [, , slug, section] = pathname.split("/");
    const name = workflows.find((w) => w.slug === slug)?.name ?? slug;
    // Sub-routes get their own tab rather than masquerading as the canvas —
    // otherwise opening Versions silently replaces the canvas tab's target.
    if (section === "versions") {
      return { href: pathname, label: `${name} · versions`, icon: "Clock" };
    }
    return { href: `/w/${slug}`, label: name, icon: "Workflow" };
  }
  if (pathname.startsWith("/runs/")) {
    const id = pathname.split("/")[2] ?? "";
    return { href: pathname, label: `Run ${id.slice(-6)}`, icon: "Activity" };
  }
  return null;
}

export function AppShell({
  workflows,
  recentRuns,
  userEmail,
  userName,
  activeGoals,
  runningSession,
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("all");
  const [collapsed, setCollapsed] = useState(false);

  // Below this the sidebar would eat half the screen, so it collapses itself
  // and the toggle stops mattering until there's room again.
  const narrow = useMediaQuery("(max-width: 1023px)");
  const sidebarCollapsed = collapsed || narrow;

  const tab = useMemo(
    () => currentTab(pathname, workflows),
    [pathname, workflows],
  );
  /**
   * A restored tab is only kept if its route still exists. Workflow tabs are
   * checked against the live list, so archiving one also retires its tab
   * instead of leaving a link to a 404.
   */
  const isKnownHref = useCallback(
    (href: string) => {
      if (href in FIXED_ROUTES) return true;
      // Run ids are stable and nothing in the app deletes them.
      if (href.startsWith("/runs/")) return true;
      const workflow = /^\/w\/([^/]+)(?:\/versions)?$/.exec(href);
      if (workflow) return workflows.some((w) => w.slug === workflow[1]);
      return false;
    },
    [workflows],
  );

  const { tabs, close, active } = useTabs(tab, isKnownHref);

  const openPalette = useCallback((mode: PaletteMode) => {
    setPaletteMode(mode);
    setPaletteOpen(true);
  }, []);

  // Keeps "Auto" tracking the OS while the app is open.
  useEffect(() => watchSystemTheme(), []);

  /**
   * Global keyboard navigation.
   *
   * Alt rather than Ctrl for tab manipulation: Chrome reserves Ctrl+1..9 and
   * Ctrl+W at the browser level and won't let a page preventDefault them, so
   * binding those would work everywhere except the browser people actually use.
   */
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();

      if (mod && key === "k") {
        // Chrome binds Ctrl+K to the address bar; without this it never
        // reaches us. Always opens in full mode, never whatever was last used.
        event.preventDefault();
        if (paletteOpen) setPaletteOpen(false);
        else openPalette("all");
        return;
      }
      if (mod && key === "b") {
        event.preventDefault();
        setCollapsed((value) => !value);
        return;
      }
      if (mod && key === "p") {
        event.preventDefault();
        openPalette("workflows");
        return;
      }

      // While the palette owns the keyboard, leave it alone.
      if (!event.altKey || paletteOpen) return;

      if (key >= "1" && key <= "9") {
        const target = tabs[Number(key) - 1];
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        return;
      }
      if (key === "w") {
        event.preventDefault();
        close(pathname);
        return;
      }
      if (event.key === "[" || event.key === "]") {
        const index = tabs.findIndex((t) => t.href === pathname);
        if (index === -1 || tabs.length < 2) return;
        event.preventDefault();
        const delta = event.key === "]" ? 1 : -1;
        // Wrap, so repeated presses cycle rather than dead-ending.
        const next = tabs[(index + delta + tabs.length) % tabs.length];
        router.push(next.href);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabs, pathname, router, close, openPalette, paletteOpen]);

  return (
    <div className="bg-canvas text-ink flex h-screen w-screen overflow-hidden">
      <Sidebar
        workspaceName={userName}
        userEmail={userEmail}
        workflows={workflows}
        activeGoals={activeGoals}
        runningSession={runningSession}
        collapsed={sidebarCollapsed}
        onToggle={() => setCollapsed((value) => !value)}
        onOpenPalette={() => openPalette("all")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* ------------------------------------------------------- tabs */}
        <div className="border-line bg-panel flex h-9 shrink-0 items-stretch border-b">
          <div className="flex flex-1 items-stretch overflow-x-auto">
            {tabs.map((item, index) => {
              const isActive = item.href === active;
              return (
                <div
                  key={item.href}
                  title={
                    index < 9 ? `${item.label}  (Alt+${index + 1})` : item.label
                  }
                  className={cn(
                    // A top border rather than an absolutely-positioned bar:
                    // it can't drift out of alignment with the tab.
                    "group border-line flex max-w-52 min-w-0 items-center gap-1.5 border-t-2 border-r px-3 text-[12.5px]",
                    isActive
                      ? "border-t-accent bg-canvas text-ink"
                      : "text-ink-soft hover:bg-line/30 border-t-transparent",
                  )}
                >
                  <Link
                    href={item.href}
                    className="focus-visible:outline-accent flex min-w-0 items-center gap-1.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <Icon
                      name={item.icon}
                      className="text-ink-faint size-3.5 shrink-0"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => close(item.href)}
                    aria-label={`Close ${item.label}`}
                    className={cn(
                      "text-ink-faint hover:bg-line hover:text-ink rounded p-0.5",
                      !isActive && "opacity-0 group-hover:opacity-100",
                    )}
                  >
                    <Icon name="X" className="size-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

        {/* -------------------------------------------------- status bar */}
        <footer className="border-line bg-panel text-ink-faint flex h-6 shrink-0 items-center gap-4 border-t px-3 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="bg-accent size-1.5 rounded-full" />
            Practice mode
          </span>
          <span>
            {workflows.length} automation{workflows.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => openPalette("all")}
            className="hover:text-ink ml-auto"
          >
            ⌘K for anything
          </button>
        </footer>
      </div>

      {paletteOpen && (
        <CommandPalette
          mode={paletteMode}
          onOpenChange={setPaletteOpen}
          workflows={workflows}
          recentRuns={recentRuns}
        />
      )}
    </div>
  );
}
