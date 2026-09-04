"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGoalAction, setGoalStatusAction } from "@/actions/goals";
import { Icon } from "@/components/shell";

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
        className="border-line-strong text-ink-soft hover:border-accent-line hover:text-accent focus-visible:outline-accent flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2"
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
      className="border-line bg-panel rounded-lg border p-3"
    >
      <input
        name="title"
        autoFocus
        required
        maxLength={120}
        placeholder="What do you want to have done?"
        className="placeholder:text-ink-faint w-full bg-transparent text-[14px] font-bold outline-none placeholder:font-normal"
      />
      <input
        name="why"
        maxLength={500}
        placeholder="Why does it matter? (goals without a reason get abandoned)"
        className="placeholder:text-ink-faint mt-1.5 w-full bg-transparent text-[12.5px] outline-none"
      />

      <div className="border-line mt-3 flex flex-wrap items-end gap-3 border-t pt-2.5">
        <label className="text-ink-faint text-[11.5px]">
          <span className="mb-1 block">Target date</span>
          <input
            type="date"
            name="targetDate"
            className="border-line bg-canvas text-ink focus:border-accent rounded border px-2 py-1 text-[12.5px] outline-none"
          />
        </label>
        <label className="text-ink-faint text-[11.5px]">
          <span className="mb-1 block">Hours to commit</span>
          <input
            type="number"
            name="targetHours"
            min={0}
            step={0.5}
            placeholder="—"
            className="border-line bg-canvas text-ink focus:border-accent w-24 rounded border px-2 py-1 text-[12.5px] outline-none"
          />
        </label>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-bad text-[11.5px]">{error}</span>}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setError(null);
            }}
            className="text-ink-soft hover:text-ink rounded px-2 py-1 text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-accent text-canvas rounded px-3 py-1 text-[12.5px] font-bold disabled:opacity-50"
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
      className="border-line text-ink-soft hover:border-accent-line hover:text-accent shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] disabled:opacity-50"
    >
      {label}
    </button>
  );
}
