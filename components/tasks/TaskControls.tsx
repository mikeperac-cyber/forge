"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  browsePathsAction,
  createTaskAction,
  deleteTaskAction,
  setTaskStatusAction,
} from "@/actions/tasks";
import { Icon } from "@/components/shell";
import { cn } from "@/lib/cn";

export interface TaskTarget {
  path: string;
  kind: "file" | "folder";
}

export interface TaskRowData {
  id: string;
  title: string;
  note: string | null;
  status: string;
  displayPath: string | null;
  pathKind: string | null;
  goalTitle: string | null;
}

/** Shorten a path from the left, keeping the end — the part that identifies it. */
function tailPath(value: string, max = 46): string {
  if (value.length <= max) return value;
  return `…${value.slice(value.length - max + 1)}`;
}

/* ------------------------------------------------------------------ picker */

interface Listing {
  dir: string;
  parent: string | null;
  entries: { name: string; path: string; kind: "file" | "folder" }[];
  truncated: boolean;
  roots: string[];
}

function PathPicker({
  target,
  onChange,
}: {
  target: TaskTarget | null;
  onChange: (next: TaskTarget | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [pending, start] = useTransition();
  const dialog = useRef<HTMLDivElement>(null);

  const load = useCallback(
    (dir: string | null) => {
      start(async () => {
        const result = await browsePathsAction(dir);
        if (result.ok) {
          setListing(result.listing);
          setError(null);
          setManual(result.listing.dir);
        } else {
          setError(result.error);
        }
      });
    },
    [start],
  );

  // Escape closes; the palette does the same, so the habit carries over.
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function show() {
    setOpen(true);
    // Resume where the chosen target lives, not always at home.
    const startDir = target
      ? target.kind === "folder"
        ? target.path
        : target.path.replace(/[\\/][^\\/]+$/, "")
      : null;
    load(startDir);
  }

  function choose(next: TaskTarget) {
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      {target ? (
        <span className="border-accent-line bg-accent-soft text-accent flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-[11.5px]">
          <Icon
            name={target.kind === "folder" ? "Folder" : "File"}
            className="size-3.5 shrink-0"
          />
          <span className="min-w-0 truncate font-mono" title={target.path}>
            {tailPath(target.path)}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove target"
            className="hover:bg-canvas rounded p-0.5"
          >
            <Icon name="X" className="size-3" />
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={show}
          className="border-line text-ink-soft hover:border-accent-line hover:text-accent flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[11.5px]"
        >
          <Icon name="FolderOpen" className="size-3.5" />
          Attach a file or folder
        </button>
      )}

      {target && (
        <button
          type="button"
          onClick={show}
          className="text-ink-faint hover:text-ink shrink-0 text-[11.5px] underline underline-offset-2"
        >
          change
        </button>
      )}

      {/* Hidden inputs carry the choice into the surrounding form. */}
      <input type="hidden" name="path" value={target?.path ?? ""} />
      <input type="hidden" name="pathKind" value={target?.kind ?? ""} />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 pt-[10vh]"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a file or folder"
            className="border-line-strong bg-panel flex max-h-[70vh] w-[min(620px,94vw)] flex-col overflow-hidden rounded-lg border shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-line flex items-center gap-2 border-b px-3 py-2">
              <Icon name="FolderOpen" className="text-ink-faint size-4" />
              <input
                value={manual}
                onChange={(event) => setManual(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    load(manual);
                  }
                }}
                spellCheck={false}
                className="text-ink placeholder:text-ink-faint min-w-0 flex-1 bg-transparent font-mono text-[12px] outline-none"
                placeholder="Type a path and press Enter"
              />
              <button
                type="button"
                onClick={() => load(manual)}
                className="border-line text-ink-soft hover:border-accent-line hover:text-accent shrink-0 rounded border px-2 py-0.5 text-[11.5px]"
              >
                Go
              </button>
            </div>

            <div className="border-line flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
              {listing?.roots.map((root) => (
                <button
                  key={root}
                  type="button"
                  onClick={() => load(root)}
                  className="border-line text-ink-faint hover:border-accent-line hover:text-accent rounded border px-1.5 py-0.5 font-mono text-[10.5px]"
                >
                  {root}
                </button>
              ))}
              {listing?.parent && (
                <button
                  type="button"
                  onClick={() => load(listing.parent)}
                  className="text-ink-soft hover:text-accent ml-auto flex items-center gap-1 text-[11.5px]"
                >
                  <Icon name="ChevronsLeft" className="size-3.5" />
                  Up
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
              {pending && !listing ? (
                <p className="text-ink-faint px-2 py-6 text-center text-[12px]">
                  Reading…
                </p>
              ) : error ? (
                <p className="text-bad px-2 py-6 text-center text-[12px]">
                  {error}
                </p>
              ) : listing && listing.entries.length === 0 ? (
                <p className="text-ink-faint px-2 py-6 text-center text-[12px]">
                  This folder is empty.
                </p>
              ) : (
                <ul>
                  {listing?.entries.map((entry) => (
                    <li key={entry.path}>
                      <button
                        type="button"
                        onClick={() =>
                          entry.kind === "folder"
                            ? load(entry.path)
                            : choose({ path: entry.path, kind: "file" })
                        }
                        className="text-ink-soft hover:bg-accent-soft hover:text-accent flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12.5px]"
                      >
                        <Icon
                          name={entry.kind === "folder" ? "Folder" : "File"}
                          className="text-ink-faint size-3.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {entry.name}
                        </span>
                        {entry.kind === "file" && (
                          <span className="text-ink-faint shrink-0 text-[10.5px]">
                            choose
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {listing?.truncated && (
                <p className="text-ink-faint px-2 py-1 text-[11px]">
                  Showing the first 500 entries.
                </p>
              )}
            </div>

            <div className="border-line bg-canvas flex items-center gap-2 border-t px-3 py-2">
              <span
                className="text-ink-faint min-w-0 flex-1 truncate font-mono text-[11px]"
                title={listing?.dir}
              >
                {listing ? tailPath(listing.dir, 70) : ""}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-ink-soft hover:text-ink rounded px-2 py-1 text-[12px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!listing}
                onClick={() =>
                  listing && choose({ path: listing.dir, kind: "folder" })
                }
                className="bg-accent text-canvas rounded px-3 py-1 text-[12px] font-bold disabled:opacity-50"
              >
                Use this folder
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- form */

export function TaskForm({
  goals,
}: {
  goals: { id: string; title: string }[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [target, setTarget] = useState<TaskTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      ref={form}
      action={(formData) =>
        start(async () => {
          const result = await createTaskAction(formData);
          if (result.ok) {
            setError(null);
            setTarget(null);
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
        maxLength={200}
        placeholder="What needs doing?"
        className="placeholder:text-ink-faint w-full bg-transparent text-[14px] font-bold outline-none placeholder:font-normal"
      />
      <input
        name="note"
        maxLength={500}
        placeholder="Optional context — the bit you'd forget (line number, what broke)"
        className="placeholder:text-ink-faint mt-1.5 w-full bg-transparent text-[12.5px] outline-none"
      />

      <div className="border-line mt-3 flex flex-wrap items-center gap-2 border-t pt-2.5">
        <PathPicker target={target} onChange={setTarget} />

        {goals.length > 0 && (
          <label className="text-ink-faint flex items-center gap-1.5 text-[11.5px]">
            Goal
            <select
              name="goalId"
              defaultValue=""
              className="border-line bg-canvas text-ink-soft hover:border-line-strong focus:border-accent rounded border px-1.5 py-0.5 text-[11.5px] outline-none"
            >
              <option value="">Not counted</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-bad text-[11.5px]">{error}</span>}
          <button
            type="submit"
            disabled={pending}
            className="bg-accent text-canvas rounded px-3 py-1 text-[12.5px] font-bold disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------- rows */

export function TaskStatusButton({
  task,
  compact,
}: {
  task: Pick<TaskRowData, "id" | "status">;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const done = task.status === "done";

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={done ? "Reopen task" : "Mark task done"}
      title={done ? "Reopen" : "Mark done"}
      onClick={() =>
        start(async () => {
          await setTaskStatusAction(task.id, done ? "open" : "done");
          router.refresh();
        })
      }
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-50",
        compact ? "size-4" : "size-[18px]",
        done
          ? "border-ok bg-ok text-canvas"
          : "border-line-strong hover:border-accent hover:text-accent text-transparent",
      )}
    >
      <Icon name="CircleCheck" className={compact ? "size-3" : "size-3.5"} />
    </button>
  );
}

export function DeleteTaskButton({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete task"
      title="Delete"
      onClick={() =>
        start(async () => {
          await deleteTaskAction(taskId);
          router.refresh();
        })
      }
      className="text-ink-faint hover:bg-bad-soft hover:text-bad shrink-0 rounded p-1 disabled:opacity-50"
    >
      <Icon name="Trash2" className="size-3.5" />
    </button>
  );
}
