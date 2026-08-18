"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoalAction, setGoalStatusAction } from "@/actions/goals";
import { Icon } from "@/components/shell/Icon";

export function GoalForm() {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2.5 text-[13px] text-ink-soft hover:border-accent-line hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Icon name="Plus" className="size-4" />
        Add a goal
      </button>
    );
  }

  return (
    <form
      ref={form}
      action={(formData) =>
        start(async () => {
          const result = await createGoalAction(formData);
          if (result.ok) {
            setError(null);
            setOpen(false);
            form.current?.reset();
            router.refresh();
          } else {
            setError(result.error);
          }
        })
      }
      className="rounded-lg border border-line bg-panel p-3"
    >
      <input
        name="title"
        autoFocus
        required
        maxLength={120}
        placeholder="What do you want to have done?"
        className="w-full bg-transparent text-[14px] font-bold outline-none placeholder:font-normal placeholder:text-ink-faint"
      />
      <input
        name="why"
        maxLength={500}
        placeholder="Why does it matter? (goals without a reason get abandoned)"
        className="mt-1.5 w-full bg-transparent text-[12.5px] outline-none placeholder:text-ink-faint"
      />

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-2.5">
        <label className="text-[11.5px] text-ink-faint">
          <span className="mb-1 block">Target date</span>
          <input
            type="date"
            name="targetDate"
            className="rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="text-[11.5px] text-ink-faint">
          <span className="mb-1 block">Hours to commit</span>
          <input
            type="number"
            name="targetHours"
            min={0}
            step={0.5}
            placeholder="—"
            className="w-24 rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-[11.5px] text-bad">{error}</span>}
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            className="rounded px-2 py-1 text-[12.5px] text-ink-soft hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-accent px-3 py-1 text-[12.5px] font-bold text-canvas disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add goal"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function GoalStatusButton({
  goalId,
  status,
  label,
}: {
  goalId: string;
  status: "active" | "done" | "archived";
  label: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await setGoalStatusAction(goalId, status);
          router.refresh();
        })
      }
      className="shrink-0 rounded border border-line px-1.5 py-0.5 text-[11.5px] text-ink-soft hover:border-accent-line hover:text-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
