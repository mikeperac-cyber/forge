import { requireUserId } from "@/lib/session";
import { getDayReport, getRecentTotals } from "@/data/time";
import { listGoals } from "@/data/goals";
import { PageHeader } from "@/components/shell";
import { StartButton } from "@/components/time/RunningTimer";
import { BlockForm, DeleteBlockButton } from "@/components/time/BlockControls";
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

export default async function TimePage() {
  const userId = await requireUserId();
  // One timestamp for the whole render, so running sessions don't drift
  // between the summary and the rows.
  const now = new Date();

  const [report, week, goals] = await Promise.all([
    getDayReport(userId, now, now),
    getRecentTotals(userId, 7, now),
    listGoals(userId, { status: "active" }),
  ]);

  const peak = Math.max(60, ...week.map((d) => d.minutes));

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Clock"
        title="Time"
        meta={
          <span>
            {hm(report.actualMinutes)} tracked · {hm(report.plannedMinutes)}{" "}
            planned
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          {/* --- the week, at a glance ---------------------------------- */}
          <section aria-label="Last seven days">
            <div className="flex items-end gap-1.5">
              {week.map((day) => {
                const date = new Date(day.date);
                const isToday = date.toDateString() === now.toDateString();
                return (
                  <div
                    key={day.date}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-ink-faint font-mono text-[10px]">
                      {day.minutes > 0 ? hm(day.minutes) : ""}
                    </span>
                    <div
                      className="bg-sunken flex h-16 w-full items-end rounded"
                      title={`${date.toDateString()} — ${hm(day.minutes)}`}
                    >
                      <div
                        className={cn(
                          "w-full rounded",
                          isToday ? "bg-accent" : "bg-accent/40",
                        )}
                        style={{
                          height: `${Math.max(day.minutes > 0 ? 4 : 0, (day.minutes / peak) * 100)}%`,
                        }}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[10.5px]",
                        isToday ? "text-ink font-bold" : "text-ink-faint",
                      )}
                    >
                      {date.toLocaleDateString(undefined, {
                        weekday: "narrow",
                      })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* --- plan vs actual ----------------------------------------- */}
          <section className="mt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="text-ink-faint text-[10.5px] font-bold tracking-[0.08em] uppercase">
                Today&apos;s plan
              </h2>
              {report.unplannedMinutes > 0 && (
                <span className="text-ink-faint text-[11.5px]">
                  {hm(report.unplannedMinutes)} outside the plan
                </span>
              )}
            </div>

            {report.blocks.length === 0 ? (
              <p className="text-ink-soft mt-2 text-[13px]">
                Nothing planned. Blocking out the day before it starts is what
                makes the gap visible afterwards.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {report.blocks.map((block) => {
                  const over = block.actualMinutes > block.plannedMinutes;
                  const ratio = Math.min(
                    100,
                    (block.actualMinutes / Math.max(1, block.plannedMinutes)) *
                      100,
                  );
                  return (
                    <li
                      key={block.id}
                      className="border-line bg-panel rounded-lg border p-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-ink-faint shrink-0 font-mono text-[11.5px] tabular-nums">
                          {clock(block.startsAt)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
                          {block.title}
                        </span>
                        {block.goal && (
                          <span className="bg-accent-soft text-accent hidden shrink-0 rounded px-1.5 py-0.5 text-[10.5px] sm:inline">
                            {block.goal.title}
                          </span>
                        )}
                        <StartButton blockId={block.id} compact />
                        <DeleteBlockButton blockId={block.id} />
                      </div>

                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="bg-line h-1 flex-1 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              over ? "bg-now" : "bg-accent",
                            )}
                            style={{ width: `${ratio}%` }}
                          />
                        </div>
                        <span className="text-ink-faint shrink-0 font-mono text-[11px] tabular-nums">
                          {hm(block.actualMinutes)} / {hm(block.plannedMinutes)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="mt-5">
            <BlockForm
              goals={goals.map((g) => ({ id: g.id, title: g.title }))}
              defaultDate={
                // Local YYYY-MM-DD; toISOString would shift the date in any
                // timezone behind UTC and pre-fill yesterday.
                `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
              }
            />
          </section>
        </div>
      </div>
    </div>
  );
}
