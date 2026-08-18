"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  harvestAction,
  renameProjectAction,
  setProjectGoalAction,
  setProjectStatusAction,
} from "@/actions/projects";
import { Icon } from "@/components/shell/Icon";
import { InlineRename } from "@/components/shell/InlineRename";

export interface GoalOption {
  id: string;
  title: string;
}

export function ProjectName({
  projectId,
  name,
  className,
}: {
  projectId: string;
  name: string;
  className: string;
}) {
  const router = useRouter();

  return (
    <InlineRename
      value={name}
      onSave={(next) => renameProjectAction(projectId, next)}
      onSaved={() => router.refresh()}
      textClassName={`block w-full truncate text-left ${className}`}
      inputClassName={`block w-full min-w-0 rounded border border-accent-line bg-canvas px-1 outline-none ${className}`}
    />
  );
}

/**
 * The one control that matters on this page: until a project points at a goal,
 * its harvested time is recorded but counts toward nothing.
 */
export function GoalPicker({
  projectId,
  goalId,
  goals,
}: {
  projectId: string;
  goalId: string | null;
  goals: GoalOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (goals.length === 0) {
    return (
      <span className="text-ink-faint shrink-0 text-[11.5px]">
        no goals yet
      </span>
    );
  }

  return (
    <select
      aria-label="Count this project's time toward"
      disabled={pending}
      value={goalId ?? ""}
      onChange={(event) => {
        const next = event.target.value;
        start(async () => {
          await setProjectGoalAction(projectId, next || null);
          router.refresh();
        });
      }}
      className="border-line bg-canvas text-ink-soft hover:border-line-strong focus:border-accent shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] outline-none disabled:opacity-50"
    >
      <option value="">Not counted</option>
      {goals.map((goal) => (
        <option key={goal.id} value={goal.id}>
          {goal.title}
        </option>
      ))}
    </select>
  );
}

export function ArchiveButton({
  projectId,
  status,
}: {
  projectId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = status === "archived" ? "active" : "archived";

  return (
    <button
      type="button"
      disabled={pending}
      title={
        next === "archived"
          ? "Hide this project — its history is kept"
          : "Show this project again"
      }
      onClick={() =>
        start(async () => {
          await setProjectStatusAction(projectId, next);
          router.refresh();
        })
      }
      className="border-line text-ink-soft hover:border-accent-line hover:text-accent shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] disabled:opacity-50"
    >
      {next === "archived" ? "Archive" : "Restore"}
    </button>
  );
}

/**
 * Reading is the whole operation — transcripts are opened and nothing else is
 * touched — so this needs no confirmation step. Running it twice is harmless
 * by construction.
 */
export function HarvestButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className="text-ink-faint text-[11.5px]">{message}</span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMessage(null);
            const result = await harvestAction();

            if (!result.ok) {
              setMessage(result.error);
              return;
            }

            const parts: string[] = [];
            if (result.created) parts.push(`${result.created} new`);
            if (result.updated) parts.push(`${result.updated} updated`);
            if (result.projects)
              parts.push(`${result.projects} new project(s)`);
            // "Nothing new" is a real, common and reassuring answer — every
            // transcript was unchanged since the last run.
            setMessage(parts.length ? parts.join(" · ") : "Nothing new");

            router.refresh();
          })
        }
        className="bg-accent text-canvas flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-bold disabled:opacity-50"
      >
        <Icon
          name={pending ? "Loader2" : "RefreshCw"}
          className={pending ? "size-3.5 animate-spin" : "size-3.5"}
        />
        {pending ? "Reading…" : "Harvest"}
      </button>
    </div>
  );
}
