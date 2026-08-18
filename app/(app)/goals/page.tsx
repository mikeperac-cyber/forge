import { requireUserId } from "@/lib/session";
import { effortMinutes, listGoals } from "@/data/goals";
import { PageHeader } from "@/components/shell/PageHeader";
import { Icon } from "@/components/shell/Icon";
import { StartButton } from "@/components/time/RunningTimer";
import { GoalForm, GoalStatusButton } from "@/components/goals/GoalControls";
import { cn } from "@/lib/cn";

function hours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default async function GoalsPage() {
  const userId = await requireUserId();
  const goals = await listGoals(userId);

  const active = goals.filter((g) => g.status === "active");
  const finished = goals.filter((g) => g.status !== "active");

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Target"
        title="Goals"
        meta={
          <span>
            {active.length} active
            {finished.length > 0 && ` · ${finished.length} finished`}
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          <GoalForm />

          {active.length === 0 && finished.length === 0 ? (
            <div className="mt-8 text-center">
              <h2 className="text-ink font-serif text-[19px] italic">
                Nothing to work toward yet.
              </h2>
              <p className="text-ink-soft mx-auto mt-2 max-w-sm text-[13px]">
                A goal is something you want to have done, with the reason
                written down. Time you log gets counted against it.
              </p>
            </div>
          ) : (
            <ul className="mt-5 space-y-2">
              {active.map((goal) => (
                <li
                  key={goal.id}
                  className="border-line bg-panel rounded-lg border p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-ink text-[14px] font-bold">
                        {goal.title}
                      </h3>
                      {goal.why && (
                        <p className="text-ink-soft mt-0.5 text-[12.5px]">
                          {goal.why}
                        </p>
                      )}
                    </div>
                    <StartButton goalId={goal.id} compact />
                    <GoalStatusButton
                      goalId={goal.id}
                      status="done"
                      label="Done"
                    />
                  </div>

                  {/* Two measurements, never one. They overlap, so a sum would
                      double-count; the gap between them is the interesting
                      part — it is the work you do without logging it. */}
                  <div className="text-ink-faint mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                    <span className="text-ink-soft font-mono tabular-nums">
                      {hours(goal.spentMinutes)}
                    </span>
                    <span>tracked</span>

                    {goal.observedMinutes > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-ink-soft font-mono tabular-nums">
                          {hours(goal.observedMinutes)}
                        </span>
                        <span
                          title="Witnessed by a tool in a linked project. Never added to tracked time — the two overlap."
                          className="border-line-strong border-b border-dotted"
                        >
                          observed
                        </span>
                      </>
                    )}

                    {goal.targetMinutes && (
                      <span>of {hours(goal.targetMinutes)}</span>
                    )}
                    {goal.targetDate && (
                      <span className="ml-auto">
                        by {goal.targetDate.toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {goal.progress !== null && (
                    <div className="bg-line mt-1.5 h-1 overflow-hidden rounded-full">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          goal.progress >= 100 ? "bg-ok" : "bg-accent",
                        )}
                        style={{ width: `${goal.progress}%` }}
                      />
                    </div>
                  )}
                </li>
              ))}

              {finished.length > 0 && (
                <li className="pt-4">
                  <h2 className="text-ink-faint text-[10.5px] font-bold tracking-[0.08em] uppercase">
                    Finished
                  </h2>
                  <ul className="mt-1.5 space-y-1">
                    {finished.map((goal) => (
                      <li
                        key={goal.id}
                        className="border-line flex items-center gap-2.5 rounded border px-3 py-1.5"
                      >
                        <Icon name="CircleCheck" className="text-ok size-3.5" />
                        <span className="text-ink-soft decoration-line min-w-0 flex-1 truncate text-[13px] line-through">
                          {goal.title}
                        </span>
                        <span
                          className="text-ink-faint shrink-0 font-mono text-[11px]"
                          title={`${hours(goal.spentMinutes)} tracked · ${hours(goal.observedMinutes)} observed`}
                        >
                          {hours(effortMinutes(goal))}
                        </span>
                        <GoalStatusButton
                          goalId={goal.id}
                          status="active"
                          label="Reopen"
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              )}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
