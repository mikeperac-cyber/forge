"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBlockAction, deleteBlockAction } from "@/actions/goals";
import { Icon } from "@/components/shell/Icon";

export function BlockForm({
  goals,
  defaultDate,
}: {
  goals: { id: string; title: string }[];
  defaultDate: string;
}) {
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
        Block out time
      </button>
    );
  }

  return (
    <form
      ref={form}
      action={(formData) =>
        start(async () => {
          const result = await createBlockAction(formData);
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
        placeholder="What are you going to do?"
        className="w-full bg-transparent text-[14px] font-bold outline-none placeholder:font-normal placeholder:text-ink-faint"
      />

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-line pt-2.5">
        <label className="text-[11.5px] text-ink-faint">
          <span className="mb-1 block">Date</span>
          <input
            type="date"
            name="date"
            required
            defaultValue={defaultDate}
            className="rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="text-[11.5px] text-ink-faint">
          <span className="mb-1 block">From</span>
          <input
            type="time"
            name="start"
            required
            className="rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </label>
        <label className="text-[11.5px] text-ink-faint">
          <span className="mb-1 block">To</span>
          <input
            type="time"
            name="end"
            required
            className="rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
          />
        </label>

        {goals.length > 0 && (
          <label className="text-[11.5px] text-ink-faint">
            <span className="mb-1 block">Toward</span>
            <select
              name="goalId"
              className="max-w-40 rounded border border-line bg-canvas px-2 py-1 text-[12.5px] text-ink outline-none focus:border-accent"
            >
              <option value="">Nothing in particular</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
        )}

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
            {pending ? "Adding…" : "Add block"}
          </button>
        </div>
      </div>
    </form>
  );
}

export function DeleteBlockButton({ blockId }: { blockId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Remove block"
      title="Remove block"
      onClick={() =>
        start(async () => {
          await deleteBlockAction(blockId);
          router.refresh();
        })
      }
      className="shrink-0 rounded p-1 text-ink-faint hover:bg-bad-soft hover:text-bad disabled:opacity-50"
    >
      <Icon name="X" className="size-3.5" />
    </button>
  );
}
