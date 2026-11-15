/**
 * Fire every due schedule once, from the command line.
 *
 * The desktop app fires schedules itself while it is running — see
 * `lib/jobs.ts`, started by `instrumentation.ts` in the packaged sidecar.
 * This is the same `fireDueSchedules()` for manual use: `npm run schedules`
 * after a closed-app gap, or from a cron on a headless machine.
 */
import "dotenv/config";
import { fireDueSchedules, type FiredSchedule } from "../lib/jobs";
import { waitForSettled } from "../lib/engine/run-manager";
import { prisma } from "../lib/db";

/**
 * Generous, but finite — a hung run must not wedge the script forever.
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
  const fired: FiredSchedule[] = await fireDueSchedules(now);

  if (fired.length === 0) {
    console.log(`${now.toISOString()}  no schedules due`);
    return;
  }

  await Promise.all(
    fired.map(async ({ workflowName, label, runId }) => {
      if (!runId) {
        console.log(
          `${now.toISOString()}  ${workflowName} (${label}) — skipped, empty canvas`,
        );
        return;
      }

      console.log(
        `${now.toISOString()}  ${workflowName} (${label}) — run ${runId} started`,
      );
      const outcome = await waitWithTimeout(runId);
      console.log(`${new Date().toISOString()}  run ${runId} ${outcome}`);
    }),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
