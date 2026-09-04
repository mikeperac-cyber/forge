"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { stopSessionAction } from "@/actions/goals";
import { Icon } from "@/components/shell";
import { cn } from "@/lib/cn";
import { useTick } from "@/lib/use-tick";

export interface RunningSession {
  id: string;
  startedAt: string;
  label: string;
}

/** hh:mm:ss, or mm:ss under an hour — a stopwatch, not a duration summary. */
function elapsed(from: number, to: number): string {
  const total = Math.max(0, Math.floor((to - from) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Always visible while a timer runs. A time-tracking product that hides the
 * running clock is how people end up logging six hours to the wrong thing.
 *
 * The tick lives in an interval rather than being read during render, so the
 * component stays pure and re-renders exactly once a second.
 */
export function RunningTimer({
  session,
  collapsed,
}: {
  session: RunningSession | null;
  collapsed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const tick = useTick();

  if (!session) return null;

  const startedAt = new Date(session.startedAt).getTime();
  // 0 only on the server, where there is no clock to read.
  const display = tick === 0 ? "—" : elapsed(startedAt, tick * 1000);

  return (
    <div
      className={cn(
        "border-accent-line bg-accent-soft mx-2 mb-2 rounded-md border",
        collapsed ? "p-1.5" : "p-2",
      )}
    >
      {collapsed ? (
        <button
          type="button"
          title={`${session.label} — ${display}. Stop timer.`}
          aria-label="Stop timer"
          onClick={() =>
            start(async () => {
              await stopSessionAction();
              router.refresh();
            })
          }
          className="text-accent flex w-full items-center justify-center"
        >
          <Icon name="Square" className="size-3.5" />
        </button>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-accent font-mono text-[15px] font-bold tabular-nums">
              {display}
            </span>
            <span className="bg-now forge-pulse size-1.5 shrink-0 rounded-full" />
          </div>
          <p
            className="text-ink-soft mt-0.5 truncate text-[11.5px]"
            title={session.label}
          >
            {session.label}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await stopSessionAction();
                router.refresh();
              })
            }
            className="border-accent-line text-accent hover:bg-canvas mt-1.5 flex w-full items-center justify-center gap-1.5 rounded border px-2 py-1 text-[12px] disabled:opacity-50"
          >
            <Icon name="Square" className="size-3" />
            {pending ? "Stopping…" : "Stop"}
          </button>
        </>
      )}
    </div>
  );
}

/** Start button, used from a goal row or a planned block. */
export function StartButton({
  goalId,
  blockId,
  label,
  compact,
}: {
  goalId?: string;
  blockId?: string;
  label?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Start timing this"
      onClick={() =>
        start(async () => {
          const { startSessionAction } = await import("@/actions/goals");
          await startSessionAction({ goalId, blockId });
          router.refresh();
        })
      }
      className={cn(
        "border-line text-ink-soft hover:border-accent-line hover:text-accent flex shrink-0 items-center gap-1.5 rounded border disabled:opacity-50",
        compact ? "px-1.5 py-0.5 text-[11.5px]" : "px-2 py-1 text-[12px]",
      )}
    >
      <Icon name="Play" className="size-3" />
      {label ?? "Start"}
    </button>
  );
}
