import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { effortMinutes, listGoals } from "@/data/goals";
import { getDayReport, getRunningSession } from "@/data/time";
import { listFailingWorkflows } from "@/data/workflows";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
import { StartButton } from "@/components/time/RunningTimer";
import { cn } from "@/lib/cn";

function hm(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function clock(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * The front door: what you're doing now, what you planned, what it's for.
 *
 * Everything is real state. `now` is captured once and threaded through, so a
 * running session reports the same elapsed time in the headline and the rows.
 */
export default async function TodayPage() {
  const userId = await requireUserId();
  const now = new Date();

  const [report, goals, running, needsYou] = await Promise.all([
    getDayReport(userId, now, now),
    listGoals(userId, { status: "active" }),
    getRunningSession(userId),
    listFailingWorkflows(userId),
  ]);
  const upcoming = report.blocks.filter((b) => b.endsAt > now);
  const next = upcoming[0] ?? null;

  const greeting = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="CalendarDays"
        title="Today"
        meta={<span>{greeting}</span>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          {/* --- the one line that matters ------------------------------ */}
          <section>
            <h2 className="text-ink font-serif text-[22px] leading-snug italic">
              {running
                ? `Working on ${running.goal?.title ?? running.block?.title ?? "something untracked"}.`
                : next
                  ? `Next up at ${clock(next.startsAt)} — ${next.title}.`
                  : report.blocks.length > 0
                    ? "The plan is done for today."
                    : "Nothing planned yet."}
            </h2>

            <p className="text-ink-soft mt-1 text-[13px]">
              {hm(report.actualMinutes)} tracked
              {report.plannedMinutes > 0 &&
                ` of ${hm(report.plannedMinutes)} planned`}
              {goals.length > 0 &&
                ` · ${goals.length} goal${goals.length === 1 ? "" : "s"} open`}
            </p>

            {!running && next && (
              <div className="mt-3">
                <StartButton
                  blockId={next.id}
                  label={`Start "${next.title}"`}
                />
              </div>
            )}
            {!running && !next && report.blocks.length === 0 && (
              <Link
                href="/time"
                className="bg-accent text-canvas mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-bold"
              >
                Plan the day
                <Icon name="ChevronRight" className="size-3.5" />
              </Link>
            )}
          </section>

          {/* --- the plan ----------------------------------------------- */}
          {report.blocks.length > 0 && (
            <section className="mt-6">
              <h2 className="text-ink-faint text-[10.5px] font-bold tracking-[0.08em] uppercase">
                The plan
              </h2>
              <ul className="mt-2 space-y-1">
                {report.blocks.map((block) => {
                  const done = block.endsAt <= now;
                  const over = block.actualMinutes > block.plannedMinutes;
                  return (
                    <li
                      key={block.id}
                      className="border-line flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
                    >
                      <span className="text-ink-faint shrink-0 font-mono text-[11.5px] tabular-nums">
                        {clock(block.startsAt)}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          done && block.actualMinutes === 0
                            ? "text-ink-faint decoration-line line-through"
                            : "text-ink",
                        )}
                      >
                        {block.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-mono text-[11px] tabular-nums",
                          over ? "text-now" : "text-ink-faint",
                        )}
                      >
                        {hm(block.actualMinutes)} / {hm(block.plannedMinutes)}
                      </span>
                      {!done && <StartButton blockId={block.id} compact />}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* --- what it's all for -------------------------------------- */}
          {goals.length > 0 && (
            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-ink-faint text-[10.5px] font-bold tracking-[0.08em] uppercase">
                  Goals
                </h2>
                <Link
                  href="/goals"
                  className="text-accent text-[11.5px] hover:underline"
                >
                  All goals
                </Link>
              </div>
              <ul className="mt-2 space-y-1">
                {goals.slice(0, 4).map((goal) => (
                  <li
                    key={goal.id}
                    className="border-line flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {goal.title}
                    </span>
                    {goal.progress !== null && (
                      <span className="bg-line h-1 w-20 shrink-0 overflow-hidden rounded-full">
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            goal.progress >= 100 ? "bg-ok" : "bg-accent",
                          )}
                          style={{ width: `${goal.progress}%` }}
                        />
                      </span>
                    )}
                    {/* The larger of tracked and observed — see
                        `effortMinutes`. Too tight a row for both numbers, so
                        the breakdown lives in the title. */}
                    <span
                      className="text-ink-faint shrink-0 font-mono text-[11px] tabular-nums"
                      title={`${hm(goal.spentMinutes)} tracked · ${hm(goal.observedMinutes)} observed`}
                    >
                      {hm(effortMinutes(goal))}
                    </span>
                    <StartButton goalId={goal.id} compact />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* --- only shown when something actually broke ---------------- */}
          {needsYou.length > 0 && (
            <section className="mt-6">
              <h2 className="text-ink-faint text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Needs you
              </h2>
              <ul className="mt-2 space-y-1">
                {needsYou.map((workflow) => (
                  <li key={workflow.id}>
                    <Link
                      href={`/runs/${workflow.lastRunId}`}
                      className="border-line hover:border-line-strong flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
                    >
                      <span className="bg-now size-1.5 shrink-0 rounded-full" />
                      <span className="min-w-0 flex-1 truncate text-[13px]">
                        {workflow.name}
                      </span>
                      <span className="text-ink-faint shrink-0 text-[11.5px]">
                        automation failed
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
