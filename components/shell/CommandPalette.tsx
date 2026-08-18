"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Icon } from "./Icon";
import { FIXED_ROUTES, NAV_ROUTES } from "./routes";
import { SHORTCUTS } from "./shortcuts";
import { statusStyle } from "@/lib/status";
import { cn } from "@/lib/cn";
import { logoutAction } from "@/actions/auth";
import { setTheme } from "@/lib/theme";
import { useThemePreference } from "./ThemeToggle";
import type { ExplorerRun, ExplorerWorkflow } from "./AppShell";

export type PaletteMode = "all" | "workflows";

interface Props {
  mode: PaletteMode;
  onOpenChange: (open: boolean) => void;
  workflows: ExplorerWorkflow[];
  recentRuns: ExplorerRun[];
}

/**
 * Rendered only while open — the shell mounts and unmounts it.
 *
 * That's what keeps the query from persisting between openings: fresh mount,
 * fresh state, no effect resetting anything. Returning null while staying
 * mounted would preserve the old query and need an effect to clear it.
 */
export function CommandPalette({
  mode,
  onOpenChange,
  workflows,
  recentRuns,
}: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const theme = useThemePreference();

  // Opening is the shell's job — it owns the keymap and, crucially, the mode.
  // Handling Ctrl+K here too would reopen in whatever mode was last used, so
  // Ctrl+K after a Ctrl+P would silently stay workflows-only.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpenChange]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const workflowsOnly = mode === "workflows";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[12vh]"
      onClick={() => onOpenChange(false)}
    >
      <Command
        label="Command palette"
        className="w-[min(600px,92vw)] overflow-hidden rounded-lg border border-line-strong bg-panel shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        loop
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Icon
            name={workflowsOnly ? "Workflow" : "Search"}
            className="size-4 text-ink-faint"
          />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={
              workflowsOnly
                ? "Go to workflow…"
                : "Search workflows, runs and commands…"
            }
            className="h-11 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[10px] text-ink-faint">
            Esc
          </kbd>
        </div>

        <Command.List className="max-h-96 overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[12.5px] text-ink-faint">
            Nothing matches “{query}”.
          </Command.Empty>

          <Group heading="Workflows">
            {workflows.map((workflow) => (
              <Item
                key={workflow.id}
                icon="Workflow"
                label={workflow.name}
                hint={`${workflow.nodeCount} nodes`}
                onSelect={() => go(`/w/${workflow.slug}`)}
              />
            ))}
          </Group>

          {!workflowsOnly && (
            <>
              <Group heading="Recent runs">
                {recentRuns.map((run) => {
                  const style = statusStyle(run.status);
                  return (
                    <Item
                      key={run.id}
                      icon="Activity"
                      label={run.workflowName}
                      hint={style.label}
                      hintClass={style.text}
                      // Distinct value per run, otherwise cmdk dedupes two runs
                      // of the same workflow into one row.
                      value={`run ${run.workflowName} ${run.id}`}
                      onSelect={() => go(`/runs/${run.id}`)}
                    />
                  );
                })}
              </Group>

              {/* Driven by the route table rather than a hand-written list.
                  The palette used to offer four destinations out of eleven, and
                  called two of them by names nothing else in the app used. */}
              <Group heading="Go to">
                {NAV_ROUTES.map((href) => {
                  const route = FIXED_ROUTES[href];
                  if (!route) return null;
                  return (
                    <Item
                      key={href}
                      icon={route.icon}
                      label={route.label}
                      onSelect={() => go(href)}
                    />
                  );
                })}
              </Group>

              <Group heading="Actions">
                <Item
                  icon="Plus"
                  label="New workflow"
                  onSelect={() => go("/workflows/new")}
                />
                <Item
                  icon="Trash2"
                  label="Sign out"
                  onSelect={() => {
                    onOpenChange(false);
                    void logoutAction();
                  }}
                />
              </Group>

              <Group heading="Appearance">
                <Item
                  icon="Sun"
                  label="Day"
                  hint={theme === "light" ? "current" : undefined}
                  onSelect={() => {
                    setTheme("light");
                    onOpenChange(false);
                  }}
                />
                <Item
                  icon="Moon"
                  label="Night"
                  hint={theme === "dark" ? "current" : undefined}
                  onSelect={() => {
                    setTheme("dark");
                    onOpenChange(false);
                  }}
                />
                <Item
                  icon="Monitor"
                  label="Match system"
                  hint={theme === "system" ? "current" : undefined}
                  onSelect={() => {
                    setTheme("system");
                    onOpenChange(false);
                  }}
                />
              </Group>

              <Group heading="Keyboard">
                {SHORTCUTS.map((shortcut) => (
                  <Item
                    key={shortcut.keys}
                    icon="Command"
                    label={shortcut.label}
                    hint={shortcut.keys}
                    // Reference only — selecting does nothing but close.
                    onSelect={() => onOpenChange(false)}
                  />
                ))}
              </Group>
            </>
          )}
        </Command.List>
      </Command>
    </div>
  );
}

function Group({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-faint"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon,
  label,
  hint,
  hintClass,
  value,
  onSelect,
}: {
  icon: string;
  label: string;
  hint?: string;
  hintClass?: string;
  value?: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value ?? label}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-[12.5px] text-ink-soft data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent"
    >
      <Icon name={icon} className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      {hint && (
        <span className={cn("shrink-0 text-[11px] text-ink-faint", hintClass)}>
          {hint}
        </span>
      )}
    </Command.Item>
  );
}
