import {
  getHarvestState,
  recordActivities,
  saveHarvestState,
  type RecordResult,
} from "@/data/projects";
import { HARVESTERS } from "./registry";
import type { HarvestSummary, RawActivity, ToolHarvester } from "./types";

/**
 * Ties a harvester to the ledger: read transcripts, write rows, remember how
 * far we got.
 *
 * The harvester itself stays strictly read-only and knows nothing about the
 * database; this is the only place the two meet.
 */

export interface HarvestReport {
  tool: string;
  /** Null when the source isn't installed on this machine. */
  detected: boolean;
  summary: HarvestSummary;
  recorded: RecordResult;
  /** The watermark used for this run — null means a full scan. */
  since: Date | null;
  startedAt: Date;
  finishedAt: Date;
}

/**
 * Rows are written in batches rather than one transaction per session, and
 * rather than one transaction for everything. A harvest interrupted halfway
 * should leave the sessions it already read safely recorded — losing a partial
 * harvest would mean re-reading the whole history to recover it.
 */
const BATCH_SIZE = 200;

export async function runHarvest(
  userId: string,
  harvester: ToolHarvester,
  opts: { full?: boolean } = {},
): Promise<HarvestReport> {
  const startedAt = new Date();

  const summary: HarvestSummary = {
    tool: harvester.id,
    filesSeen: 0,
    filesSkipped: 0,
    activities: 0,
    unattributed: 0,
  };

  const recorded: RecordResult = {
    projectsCreated: 0,
    activitiesCreated: 0,
    activitiesUpdated: 0,
  };

  if (!(await harvester.detect())) {
    return {
      tool: harvester.id,
      detected: false,
      summary,
      recorded,
      since: null,
      startedAt,
      finishedAt: new Date(),
    };
  }

  const state = opts.full ? null : await getHarvestState(userId, harvester.id);
  const since = state?.lastHarvestedAt ?? null;

  let batch: RawActivity[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const result = await recordActivities(userId, batch);
    recorded.projectsCreated += result.projectsCreated;
    recorded.activitiesCreated += result.activitiesCreated;
    recorded.activitiesUpdated += result.activitiesUpdated;
    batch = [];
  };

  for await (const activity of harvester.harvest(since, summary)) {
    batch.push(activity);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  // The watermark is when this run *started*, not when it finished. A
  // transcript written while the harvest was in progress has an mtime after
  // `startedAt`, so it gets re-read next time. Saving the finish time instead
  // would skip it permanently — and the session most likely to be mid-write is
  // the one you are sitting in right now.
  await saveHarvestState(userId, harvester.id, summary, startedAt);

  return {
    tool: harvester.id,
    detected: true,
    summary,
    recorded,
    since,
    startedAt,
    finishedAt: new Date(),
  };
}

/**
 * Every registered tool, in sequence.
 *
 * Sequential rather than parallel on purpose: the harvesters are IO-bound on
 * the same disk, and `recordActivities` writes to one SQLite file. Running
 * them concurrently would contend for both to save nothing worth having — a
 * full harvest of two tools is well under a second here.
 *
 * Each tool keeps its own watermark, so a newly added harvester does a full
 * first scan while the others stay incremental.
 */
export async function runAllHarvests(
  userId: string,
  opts: { full?: boolean } = {},
): Promise<HarvestReport[]> {
  const reports: HarvestReport[] = [];
  for (const harvester of HARVESTERS) {
    reports.push(await runHarvest(userId, harvester, opts));
  }
  return reports;
}

/** Totals across a set of reports, for the one line a person actually reads. */
export function summariseReports(reports: HarvestReport[]) {
  return reports.reduce(
    (total, report) => ({
      detected: total.detected + (report.detected ? 1 : 0),
      created: total.created + report.recorded.activitiesCreated,
      updated: total.updated + report.recorded.activitiesUpdated,
      projects: total.projects + report.recorded.projectsCreated,
      unattributed: total.unattributed + report.summary.unattributed,
    }),
    { detected: 0, created: 0, updated: 0, projects: 0, unattributed: 0 },
  );
}
