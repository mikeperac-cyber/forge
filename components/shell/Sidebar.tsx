"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { RunningTimer, type RunningSession } from "@/components/time/RunningTimer";
import type { ExplorerWorkflow } from "./AppShell";

/**
 * The single left column.
 *
 * This replaces an icon rail plus a tree — two columns of chrome for a person
 * whose whole problem is too many places to look. Seven destinations, three
 * groups, one thing that tells you whether anything needs you.
 *
 * Kept deliberately short. Everything else the app can reach — Inbox, Runs,
 * Steps, Settings — lives in the command palette, which is searchable and
 * costs no permanent screen space. A destination earns a place here by being
 * somewhere you go without being sent.
 *
 * Vocabulary is the user's, not the system's: Automations rather than
 * workflows, because that is the word for what they save you.
 */

interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** Shown as a quiet count. Omitted rather than shown as zero. */
  count?: number;
}

interface NavGroup {
  label?: string;
  items: NavItem[];
}

export function Sidebar({
  workspaceName,
  userEmail,
  workflows,
  activeGoals,
  runningSession,
  collapsed,
  onToggle,
  onOpenPalette,
}: {
  workspaceName: string;
  userEmail: string;
  workflows: ExplorerWorkflow[];
  activeGoals: number;
  runningSession: RunningSession | null;
  collapsed: boolean;
  onToggle: () => void;
  onOpenPalette: () => void;
}) {
  const pathname = usePathname();

  const needsYou = workflows.filter((w) => w.lastRunStatus === "failed").length;

  const groups: NavGroup[] = [
    {
      // The daily loop: what's on, what it's for, where the hours went.
      items: [
        { href: "/today", label: "Today", icon: "CalendarDays" },
        { href: "/goals", label: "Goals", icon: "Target", count: activeGoals },
        { href: "/time", label: "Time", icon: "Clock" },
        // Where the hours actually went, as opposed to where you logged them.
        { href: "/projects", label: "Projects", icon: "Activity" },
      ],
    },
    {
      label: "Declutter",
      items: [
        { href: "/files", label: "Files", icon: "FolderOpen" },
        {
          href: "/workflows",
          label: "Automations",
          icon: "Zap",
          count: needsYou || undefined,
        },
      ],
    },
    {
      items: [{ href: "/notes", label: "Notes", icon: "NotebookPen" }],
    },
  ];

  function isActive(href: string) {
    if (href === "/workflows") {
      return pathname.startsWith("/workflows") || pathname.startsWith("/w/");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav
      aria-label="Main"
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-line bg-rail",
        "transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-[60px]" : "w-[248px]",
      )}
    >
      {/* --------------------------------------------------------- header */}
      <header className="flex h-12 items-center gap-2 px-3">
        {!collapsed && (
          <span
            className="min-w-0 flex-1 truncate font-serif text-[15px] italic text-ink"
            title={workspaceName}
          >
            {workspaceName}
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          title={collapsed ? "Expand sidebar (Ctrl+B)" : "Collapse sidebar (Ctrl+B)"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "rounded p-1 text-ink-faint hover:bg-line/70 hover:text-ink",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            collapsed && "mx-auto",
          )}
        >
          <Icon
            name={collapsed ? "ChevronsRight" : "ChevronsLeft"}
            className="size-4"
          />
        </button>
      </header>

      {/* --------------------------------------------------------- search */}
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onOpenPalette}
          title="Search (Ctrl+K)"
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-canvas text-ink-faint",
            "hover:border-line-strong hover:text-ink-soft",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            collapsed ? "justify-center px-0" : "px-2.5",
          )}
        >
          <Icon name="Search" className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left text-[13px]">Search</span>
              <kbd className="rounded border border-line px-1 text-[10px] tabular-nums">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* ------------------------------------------------------ signature */}
      <Attention workflows={workflows} collapsed={collapsed} />

      {/* ------------------------------------------------------------ nav */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {groups.map((group, index) => (
          <div key={group.label ?? index} className="mb-1">
            {group.label && !collapsed && (
              <h2 className="px-2 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-faint">
                {group.label}
              </h2>
            )}
            {group.label && collapsed && (
              <hr className="mx-2 my-2 border-line" />
            )}

            <ul>
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group relative flex h-8 items-center gap-2.5 rounded-md text-[13px]",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                        collapsed ? "justify-center px-0" : "px-2.5",
                        active
                          ? "bg-accent-soft font-bold text-accent"
                          : "text-ink-soft hover:bg-line/60 hover:text-ink",
                      )}
                    >
                      {/* A flush marker rather than a floating bar — it can't
                          drift out of alignment with the row. */}
                      {active && (
                        <span className="absolute left-0 top-1.5 h-5 w-0.5 rounded-r bg-accent" />
                      )}
                      <Icon name={item.icon} className="size-4 shrink-0" />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.count ? (
                            <span className="shrink-0 text-[11px] tabular-nums text-ink-faint">
                              {item.count}
                            </span>
                          ) : null}
                        </>
                      )}
                      {collapsed && item.count ? (
                        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-now" />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* The running clock sits above the account, never scrolls away. */}
      <RunningTimer session={runningSession} collapsed={collapsed} />

      {/* -------------------------------------------------------- account */}
      <footer className="border-t border-line p-2">
        <Link
          href="/settings"
          title={collapsed ? userEmail : undefined}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md text-[13px]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            pathname === "/settings"
              ? "bg-accent-soft text-accent"
              : "text-ink-soft hover:bg-line/60 hover:text-ink",
            collapsed ? "justify-center px-0" : "px-2",
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-line text-[10px] font-bold uppercase text-ink-soft">
            {userEmail.slice(0, 2)}
          </span>
          {!collapsed && <span className="flex-1 truncate">{userEmail}</span>}
        </Link>
      </footer>
    </nav>
  );
}

/**
 * The signature: one strip, one segment per automation, coloured by how its
 * last run ended. It answers "is anything waiting for me?" before you click
 * anything — the question a teacher opens the app with.
 *
 * This is the only saturated colour in the sidebar, and it is a fill, never
 * text.
 */
function Attention({
  workflows,
  collapsed,
}: {
  workflows: ExplorerWorkflow[];
  collapsed: boolean;
}) {
  if (collapsed || workflows.length === 0) return null;

  const needsYou = workflows.filter((w) => w.lastRunStatus === "failed");
  const clear = workflows.filter((w) => w.lastRunStatus === "succeeded");
  const waiting = workflows.length - needsYou.length - clear.length;

  return (
    <section className="px-4 pb-3 pt-1" aria-label="Attention">
      <div className="flex gap-0.5" role="presentation">
        {workflows.map((workflow) => {
          const state =
            workflow.lastRunStatus === "failed"
              ? "needs you"
              : workflow.lastRunStatus === "succeeded"
                ? "clear"
                : "not run yet";
          return (
            <span
              key={workflow.id}
              title={`${workflow.name} — ${state}`}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                workflow.lastRunStatus === "failed"
                  ? "bg-now"
                  : workflow.lastRunStatus === "succeeded"
                    ? "bg-accent/45"
                    : "bg-line-strong/60",
              )}
            />
          );
        })}
      </div>

      <p className="mt-1.5 text-[11.5px] text-ink-faint">
        {needsYou.length > 0 ? (
          <>
            <strong className="font-bold text-ink">
              {needsYou.length} need{needsYou.length === 1 ? "s" : ""} you
            </strong>
            {clear.length > 0 && ` · ${clear.length} clear`}
          </>
        ) : waiting === workflows.length ? (
          "Nothing has run yet."
        ) : (
          "All clear."
        )}
      </p>
    </section>
  );
}
