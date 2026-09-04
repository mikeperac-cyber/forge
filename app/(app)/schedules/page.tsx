import Link from "next/link";
import { requireUserId } from "@/lib/session";
import { listSchedules } from "@/data/schedules";
import { listWorkflowOptions } from "@/data/workflows";
import { PageHeader } from "@/components/shell";
import { formatRelative, formatUntil } from "@/lib/status";
import { describeSchedule } from "@/lib/schedule";
import {
  DeleteScheduleButton,
  NewScheduleForm,
  ScheduleEnabledToggle,
} from "@/components/schedules/ScheduleControls";

/**
 * Schedules run on their own clock, external to this page — see
 * `scripts/run-schedules.ts` and the Windows Task Scheduler entry that polls
 * it. This page only ever reads and writes the `Schedule` rows; it never
 * fires anything itself.
 */
export default async function SchedulesPage() {
  const userId = await requireUserId();

  const [schedules, workflows] = await Promise.all([
    listSchedules(userId),
    listWorkflowOptions(userId),
  ]);

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon="Clock"
        title="Schedules"
        tabs={[
          { href: "/workflows", label: "All", icon: "LayoutGrid" },
          { href: "/runs", label: "Runs", icon: "History" },
          { href: "/nodes", label: "Nodes", icon: "Boxes" },
          { href: "/schedules", label: "Schedules", icon: "Clock" },
          { href: "/secrets", label: "Secrets", icon: "Settings" },
        ]}
        active="/schedules"
        meta={
          <span>
            {schedules.length} schedule{schedules.length === 1 ? "" : "s"}
          </span>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl p-5">
          <NewScheduleForm workflows={workflows} />

          {schedules.length === 0 ? (
            <div className="mt-8 text-center">
              <h2 className="text-ink font-serif text-[19px] italic">
                Nothing scheduled yet.
              </h2>
              <p className="text-ink-soft mx-auto mt-2 max-w-sm text-[13px]">
                Pick a workflow above and it&rsquo;ll run itself from now on —
                no terminal open, no browser tab needed. A minute-by-minute
                poller external to this app is what actually fires it; see the
                README for the Windows Task Scheduler setup.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-1.5">
              {schedules.map((schedule) => (
                <li
                  key={schedule.id}
                  className="border-line rounded-lg border px-3 py-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${
                        schedule.enabled ? "bg-ok" : "bg-ink-faint"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/w/${schedule.workflowSlug}`}
                        className="text-ink hover:text-accent truncate text-[13.5px] font-bold"
                      >
                        {schedule.workflowName}
                      </Link>
                      <p className="text-ink-soft truncate text-[12px]">
                        {describeSchedule(schedule.kind, schedule.config)}
                      </p>
                    </div>
                    <ScheduleEnabledToggle
                      scheduleId={schedule.id}
                      enabled={schedule.enabled}
                    />
                    <DeleteScheduleButton scheduleId={schedule.id} />
                  </div>

                  <div className="text-ink-faint mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                    {schedule.lastRunAt && (
                      <span>
                        last fired {formatRelative(schedule.lastRunAt)}
                      </span>
                    )}
                    <span className="ml-auto">
                      {schedule.enabled
                        ? `next ${formatUntil(schedule.nextRunAt)}`
                        : "paused"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
