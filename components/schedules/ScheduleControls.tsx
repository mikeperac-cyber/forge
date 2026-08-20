"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createScheduleAction,
  deleteScheduleAction,
  setScheduleEnabledAction,
} from "@/actions/schedules";
import { SCHEDULE_KINDS, type ScheduleKind } from "@/lib/schedule";
import { Icon } from "@/components/shell/Icon";

export interface WorkflowOption {
  id: string;
  name: string;
}

const KIND_LABEL: Record<ScheduleKind, string> = {
  interval: "Every…",
  daily: "Daily at…",
  weekly: "Weekly on…",
};

const DAY_LABEL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/**
 * One form, three shapes. `kind` picks which fields are live; the others stay
 * mounted-but-hidden rather than remounting, so a false start switching kinds
 * doesn't lose whatever the user already typed into the first one.
 */
export function NewScheduleForm({
  workflows,
}: {
  workflows: WorkflowOption[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [workflowId, setWorkflowId] = useState(workflows[0]?.id ?? "");
  const [kind, setKind] = useState<ScheduleKind>("daily");
  const [minutes, setMinutes] = useState(30);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [dayOfWeek, setDayOfWeek] = useState(1);

  if (workflows.length === 0) {
    return (
      <p className="text-ink-faint text-[12.5px]">
        Create a workflow first — there&rsquo;s nothing to schedule yet.
      </p>
    );
  }

  const config =
    kind === "interval"
      ? { minutes }
      : kind === "daily"
        ? { hour, minute }
        : { dayOfWeek, hour, minute };

  function submit() {
    setError(null);
    start(async () => {
      const result = await createScheduleAction(workflowId, kind, config);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="border-line bg-panel space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={workflowId}
          onChange={(e) => setWorkflowId(e.target.value)}
          className="border-line bg-canvas rounded border px-2 py-1 text-[12.5px]"
        >
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>

        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ScheduleKind)}
          className="border-line bg-canvas rounded border px-2 py-1 text-[12.5px]"
        >
          {SCHEDULE_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>

        {kind === "interval" && (
          <label className="flex items-center gap-1.5 text-[12.5px]">
            <input
              type="number"
              min={5}
              max={10_080}
              value={minutes}
              onChange={(e) => setMinutes(e.target.valueAsNumber)}
              className="border-line bg-canvas w-20 rounded border px-2 py-1 text-[12.5px]"
            />
            minutes
          </label>
        )}

        {(kind === "daily" || kind === "weekly") && (
          <>
            {kind === "weekly" && (
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="border-line bg-canvas rounded border px-2 py-1 text-[12.5px]"
              >
                {DAY_LABEL.map((day, i) => (
                  <option key={day} value={i}>
                    {day}
                  </option>
                ))}
              </select>
            )}
            <input
              type="time"
              value={`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                setHour(h);
                setMinute(m);
              }}
              className="border-line bg-canvas rounded border px-2 py-1 text-[12.5px]"
            />
          </>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="bg-accent text-canvas ml-auto flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-bold disabled:opacity-50"
        >
          <Icon name="Plus" className="size-3.5" />
          Add schedule
        </button>
      </div>
      {error && <p className="text-bad text-[12px]">{error}</p>}
    </div>
  );
}

export function ScheduleEnabledToggle({
  scheduleId,
  enabled,
}: {
  scheduleId: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title={enabled ? "Pause this schedule" : "Resume this schedule"}
      onClick={() =>
        start(async () => {
          await setScheduleEnabledAction(scheduleId, !enabled);
          router.refresh();
        })
      }
      className="border-line text-ink-soft hover:border-accent-line hover:text-accent shrink-0 rounded border px-1.5 py-0.5 text-[11.5px] disabled:opacity-50"
    >
      {enabled ? "Pause" : "Resume"}
    </button>
  );
}

export function DeleteScheduleButton({ scheduleId }: { scheduleId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Delete this schedule"
      onClick={() =>
        start(async () => {
          await deleteScheduleAction(scheduleId);
          router.refresh();
        })
      }
      className="text-ink-faint hover:bg-bad-soft hover:text-bad shrink-0 rounded p-1 disabled:opacity-50"
    >
      <Icon name="Trash2" className="size-3.5" />
    </button>
  );
}
