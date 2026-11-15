import "server-only";
import { prisma } from "@/lib/db";
import { dueSchedules, markScheduleFired } from "@/data/schedules";
import { graphOf } from "@/data/workflows";
import { loadDecryptedSecrets } from "@/data/secrets";
import { startRun, waitForSettled } from "@/lib/engine/run-manager";
import { describeSchedule, type ScheduleKind } from "@/lib/schedule";
import { runAllHarvests, summariseReports } from "@/lib/harvest/run";

/**
 * The background jobs, kept inside the server process.
 *
 * Forge is desktop-only: the app IS the long-running process (the Tauri shell
 * starts a loopback sidecar and keeps it alive for the whole session), so the
 * `setInterval` that `next dev` could never hold across reloads has a home
 * again. Started once by `register()` in `instrumentation.ts`, gated on
 * `FORGE_DESKTOP` so `next dev` does not fire workflows behind your back.
 *
 * Jobs only run while the app is open. Schedules that came due while it was
 * closed fire on the next tick — `dueSchedules` compares against `now`, so a
 * late tick fires once and `computeNextRun` re-anchors from the fire time.
 */

/** One minute is the tightest granularity `lib/schedule.ts` can guarantee. */
const SCHEDULE_TICK_MS = 60_000;
const FIRST_SCHEDULE_DELAY_MS = 5_000;

/** Transcripts change constantly; a half-hour-old ledger is close enough. */
const HARVEST_INTERVAL_MS = 30 * 60_000;
const FIRST_HARVEST_DELAY_MS = 90_000;

/** A hung run must not wedge the observer forever. */
const RUN_TIMEOUT_MS = 15 * 60_000;

export interface FiredSchedule {
  workflowName: string;
  label: string;
  /** Null when the canvas was empty — fired counts as skipped. */
  runId: string | null;
}

/**
 * One decrypt pass per account per tick, not per schedule — two schedules
 * owned by the same account share the same secrets.
 */
function secretsLoader() {
  const cache = new Map<string, Promise<Record<string, string>>>();
  return (userId: string) => {
    let secrets = cache.get(userId);
    if (!secrets) {
      secrets = loadDecryptedSecrets(userId);
      cache.set(userId, secrets);
    }
    return secrets;
  };
}

// The query-and-fire section is fast (an indexed lookup plus starting runs);
// guarding it keeps two overlapping ticks from starting the same schedule
// twice before either has moved `nextRunAt`. Observing finished runs happens
// outside the guard and never blocks the next tick.
let firing = false;

export async function fireDueSchedules(
  now = new Date(),
): Promise<FiredSchedule[]> {
  if (firing) return [];
  firing = true;

  let due: Awaited<ReturnType<typeof dueSchedules>>;
  try {
    due = await dueSchedules(now);
  } catch (err) {
    firing = false;
    throw err;
  }

  const secretsFor = secretsLoader();
  const fired: FiredSchedule[] = [];

  try {
    await Promise.all(
      due.map(async (schedule) => {
        const graph = graphOf(schedule.workflow.graph);
        const label = describeSchedule(
          schedule.kind as ScheduleKind,
          schedule.config,
        );

        // Recording the fire (without a run) still moves nextRunAt forward —
        // an empty canvas would otherwise poll as "due" forever, every minute.
        if (graph.nodes.length === 0) {
          await markScheduleFired(schedule, now);
          fired.push({
            workflowName: schedule.workflow.name,
            label,
            runId: null,
          });
          return;
        }

        const runId = await startRun({
          workflowId: schedule.workflow.id,
          version: schedule.workflow.version,
          graph,
          trigger: "schedule",
          secrets: await secretsFor(schedule.userId),
        });

        // Firing is recorded before the run finishes, not after — a run that
        // hangs must not also jam nextRunAt and make the schedule look stuck.
        await markScheduleFired(schedule, now);
        fired.push({ workflowName: schedule.workflow.name, label, runId });
      }),
    );
  } finally {
    firing = false;
  }

  return fired;
}

/** Wait for a fired run to settle, but never longer than `RUN_TIMEOUT_MS`. */
function observeRun(runId: string): Promise<"finished" | "timed-out"> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<"timed-out">((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), RUN_TIMEOUT_MS);
  });

  return Promise.race([
    waitForSettled(runId).then(() => "finished" as const),
    timeout,
  ]).then((outcome) => {
    clearTimeout(timer!);
    return outcome;
  });
}

/**
 * Harvest every registered tool into the ledger for the app's own account.
 * Returns null when nobody has run /setup yet, or when a harvest is already
 * in flight — a harvest is idempotent, but two concurrent ones would contend
 * on the same disk and the same SQLite file for nothing.
 */
let harvesting = false;

export async function harvestLedger() {
  if (harvesting) return null;

  // Single-user app: the account is whichever one exists. Being explicit
  // beats silently harvesting into the wrong ledger if that ever changes.
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!user) return null;

  harvesting = true;
  try {
    const reports = await runAllHarvests(user.id);
    return summariseReports(reports);
  } finally {
    harvesting = false;
  }
}

function log(...parts: unknown[]) {
  console.log(new Date().toISOString(), ...parts);
}

/**
 * Start the tick loops. Called once, from `instrumentation.ts register()`.
 * Every callback is fire-and-forget with its errors logged to stdout — the
 * sidecar's stdout is the `server.log` in the app data directory, which is
 * the one artifact that survives a crash for someone to read.
 */
export function startBackgroundJobs() {
  const tickSchedules = () => {
    fireDueSchedules().then(
      (fired) => {
        for (const f of fired) {
          if (!f.runId) {
            log(
              `schedule: ${f.workflowName} (${f.label}) — skipped, empty canvas`,
            );
            continue;
          }
          log(`schedule: ${f.workflowName} (${f.label}) — run ${f.runId}`);
          observeRun(f.runId).then((outcome) =>
            log(`schedule: run ${f.runId} ${outcome}`),
          );
        }
      },
      (err) => log("schedule tick failed:", err),
    );
  };

  const tickHarvest = () => {
    harvestLedger().then(
      (totals) => {
        if (!totals) return;
        log(
          `harvest: ${totals.created} new · ${totals.updated} updated · ` +
            `${totals.projects} project(s) · ${totals.unattributed} unattributed`,
        );
      },
      (err) => log("harvest failed:", err),
    );
  };

  setTimeout(tickSchedules, FIRST_SCHEDULE_DELAY_MS);
  setInterval(tickSchedules, SCHEDULE_TICK_MS);

  setTimeout(tickHarvest, FIRST_HARVEST_DELAY_MS);
  setInterval(tickHarvest, HARVEST_INTERVAL_MS);

  log("jobs: background schedule ticker (60s) and harvester (30m) started");
}
