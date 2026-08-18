/**
 * Dry run: what would a harvest find on this machine?
 *
 * Strictly read-only — it opens histories and prints a summary. Nothing is
 * written anywhere, including the database.
 *
 *   npm run harvest:preview
 */
import { HARVESTERS, HARVESTER_FACTORIES } from "../lib/harvest/registry";
import { projectNameFromPath } from "../lib/harvest/paths";
import type { HarvestSummary, RawActivity } from "../lib/harvest/types";

function minutes(a: Date, b: Date): number {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
}

function hm(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function blank(tool: string): HarvestSummary {
  return { tool, filesSeen: 0, filesSkipped: 0, activities: 0, unattributed: 0 };
}

async function main() {
  const started = Date.now();
  const all: RawActivity[] = [];

  for (const harvester of HARVESTERS) {
    const present = await harvester.detect();
    console.log(`${harvester.id.padEnd(12)} ${harvester.describeSource()}`);
    if (!present) {
      console.log(`${"".padEnd(12)} not found — nothing to harvest.\n`);
      continue;
    }

    const summary = blank(harvester.id);
    const mine: RawActivity[] = [];
    for await (const activity of harvester.harvest(null, summary)) {
      mine.push(activity);
      all.push(activity);
    }

    const active = mine.reduce((t, a) => t + a.activeMinutes, 0);
    console.log(
      `${"".padEnd(12)} files ${summary.filesSeen} · skipped ${summary.filesSkipped} · ` +
        `sessions ${summary.activities} · unattributed ${summary.unattributed} · ` +
        `${hm(active)} active\n`,
    );
  }

  if (all.length === 0) {
    console.log("Nothing found.");
    return;
  }

  // Wall-clock vs. gap-split, side by side, so the threshold stays a choice
  // made from evidence rather than taste.
  console.log("idle threshold comparison (all tools, total):");
  for (const gap of [5, 15, 30, 60]) {
    let active = 0;
    for (const harvester of HARVESTERS) {
      const make = HARVESTER_FACTORIES[harvester.id];
      if (!make) continue;
      const probe = make(gap);
      if (!(await probe.detect())) continue;
      for await (const a of probe.harvest(null, blank(harvester.id))) {
        active += a.activeMinutes;
      }
    }
    console.log(`  ${String(gap).padStart(3)}m gap → ${hm(active)} active`);
  }

  const rawTotal = all.reduce((t, a) => t + minutes(a.startedAt, a.endedAt), 0);
  console.log(`  wall clock  → ${hm(rawTotal)} (first-to-last, unusable)`);

  // Group by canonical path; display the cased one.
  const byProject = new Map<string, RawActivity[]>();
  for (const activity of all) {
    const list = byProject.get(activity.path) ?? [];
    list.push(activity);
    byProject.set(activity.path, list);
  }

  const rows = [...byProject.values()]
    .map((list) => ({
      shown: list[0].displayPath,
      sessions: list.length,
      total: list.reduce((t, a) => t + a.activeMinutes, 0),
      span: list.reduce((t, a) => t + minutes(a.startedAt, a.endedAt), 0),
      tools: [...new Set(list.map((a) => a.tool))].sort().join(","),
      last: list.reduce((l, a) => (a.endedAt > l ? a.endedAt : l), new Date(0)),
    }))
    .sort((a, b) => b.last.getTime() - a.last.getTime());

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\n${rows.length} distinct projects · ${elapsed}s\n`);

  console.log(
    `${"project".padEnd(26)} ${"sess".padStart(4)} ${"active".padStart(8)} ` +
      `${"span".padStart(8)}  ${"tools".padEnd(18)} last active`,
  );
  for (const row of rows) {
    console.log(
      `${projectNameFromPath(row.shown).slice(0, 26).padEnd(26)} ` +
        `${String(row.sessions).padStart(4)} ${hm(row.total).padStart(8)} ` +
        `${hm(row.span).padStart(8)}  ${row.tools.padEnd(18)} ` +
        `${row.last.toISOString().slice(0, 16).replace("T", " ")}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
