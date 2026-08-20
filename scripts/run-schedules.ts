/**
 * Fire every due schedule, across every account on this machine.
 *
 * There is no long-running process inside `next dev`/`next start` that could
 * hold a scheduler alive across restarts and dev-reloads, so this is a poller
 * instead — meant to run on a timer external to the app itself. See
 * `windows-tasks.ps1`, which registers it as a Windows Scheduled Task
 * alongside the harvest one, on the same "poll every N minutes" shape.
 *
 *   npm run schedules
 *
 * `--conditions=react-server` is what lets a script import `data/` and
 * `lib/engine/run-manager`, both marked `server-only` — see harvest.ts for
 * the same note.
 */
import "dotenv/config";
import { dueSchedules, markScheduleFired } from "../data/schedules";
import { graphOf } from "../data/workflows";
import { startRun, waitForSettled } from "../lib/engine/run-manager";
import { describeSchedule, type ScheduleKind } from "../lib/schedule";
import { prisma } from "../lib/db";

/**
 * Generous, but finite — a hung run must not wedge the poller forever, since
 * the Windows Task Scheduler entry fires this again every minute regardless.
 *
 * `waitForSettled` (not the `run:finished` bus event) is what's awaited here:
 * the event fires the instant the scheduler decides an outcome, before the
 * trailing log-flush write has landed. This script disconnects Prisma the
 * moment it's done — racing that flush instead of waiting for it properly
 * is exactly what produced "Transaction already closed" errors in testing.
 */
const RUN_TIMEOUT_MS = 15 * 60_000;

async function waitWithTimeout(
  runId: string,
): Promise<"finished" | "timed-out"> {
  // `Promise.race` doesn't cancel the loser — an uncleared timer keeps the
  // event loop alive for the rest of RUN_TIMEOUT_MS regardless of which side
  // wins, which is exactly why this script wasn't exiting after finishing.
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), RUN_TIMEOUT_MS);
  });

  const outcome = await Promise.race([
    waitForSettled(runId).then(() => "finished" as const),
    timeout,
  ]);
  clearTimeout(timer!);
  return outcome;
}

async function main() {
  const now = new Date();
  const due = await dueSchedules(now);

  if (due.length === 0) {
    console.log(`${now.toISOString()}  no schedules due`);
    return;
  }

  for (const schedule of due) {
    const graph = graphOf(schedule.workflow.graph);
    const label = describeSchedule(
      schedule.kind as ScheduleKind,
      schedule.config,
    );

    if (graph.nodes.length === 0) {
      // Recording the fire (without a run) still moves nextRunAt forward —
      // an empty canvas would otherwise poll as "due" forever, every minute.
      console.log(
        `${now.toISOString()}  ${schedule.workflow.name} (${label}) — skipped, empty canvas`,
      );
      await markScheduleFired(schedule.id, now);
      continue;
    }

    const runId = await startRun({
      workflowId: schedule.workflow.id,
      version: schedule.workflow.version,
      graph,
      trigger: "schedule",
    });

    // Firing is recorded before the run finishes, not after — a run that
    // hangs must not also jam nextRunAt and make the schedule look stuck.
    await markScheduleFired(schedule.id, now);
    console.log(
      `${now.toISOString()}  ${schedule.workflow.name} (${label}) — run ${runId} started`,
    );

    const outcome = await waitWithTimeout(runId);
    console.log(`${new Date().toISOString()}  run ${runId} ${outcome}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
