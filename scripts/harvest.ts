/**
 * Run a real harvest across every registered tool and write it to the ledger.
 *
 * Unlike `harvest-preview.ts`, this one persists. It still never writes
 * anywhere outside the app's own database — histories are only ever read.
 *
 *   npm run harvest
 *   npm run harvest -- --full     # ignore the watermark, re-read everything
 *
 * `--conditions=react-server` is what lets a script import `data/`, which is
 * marked `server-only`. Without it the guard throws; with it, `server-only`
 * resolves to an empty module exactly as it does inside Next.
 */
import "dotenv/config";
import { HARVESTERS } from "../lib/harvest/registry";
import { runAllHarvests, summariseReports } from "../lib/harvest/run";
import { prisma } from "../lib/db";

function hm(mins: number): string {
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

async function main() {
  const full = process.argv.includes("--full");

  // Single-user app: the account is whichever one exists. Being explicit beats
  // silently harvesting into the wrong ledger if that ever stops being true.
  const email = process.env.SEED_EMAIL;
  const user = email
    ? await prisma.user.findUnique({ where: { email } })
    : await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    console.error(
      "No account yet — visit /setup, or run `npx tsx prisma/seed.ts`.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(`account : ${user.email}`);
  for (const harvester of HARVESTERS) {
    console.log(`  ${harvester.id.padEnd(12)} ${harvester.describeSource()}`);
  }
  console.log("");

  const reports = await runAllHarvests(user.id, { full });

  for (const report of reports) {
    if (!report.detected) {
      console.log(`${report.tool.padEnd(12)} not installed — skipped`);
      continue;
    }

    const elapsed = (
      (report.finishedAt.getTime() - report.startedAt.getTime()) /
      1000
    ).toFixed(1);

    console.log(
      `${report.tool.padEnd(12)} seen ${report.summary.filesSeen} · ` +
        `skipped ${report.summary.filesSkipped} · ` +
        `unattributed ${report.summary.unattributed} · ` +
        `+${report.recorded.activitiesCreated} new, ` +
        `${report.recorded.activitiesUpdated} updated · ${elapsed}s` +
        (report.since ? "" : "  (full scan)"),
    );
  }

  const totals = summariseReports(reports);
  console.log(
    `\ntotal: ${totals.created} new · ${totals.updated} updated · ` +
      `${totals.projects} new project(s)\n`,
  );

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    include: {
      activities: {
        select: { activeMinutes: true, endedAt: true, tool: true },
      },
    },
  });

  const rows = projects
    .map((p) => ({
      name: p.name,
      sessions: p.activities.length,
      minutes: p.activities.reduce((t, a) => t + a.activeMinutes, 0),
      tools: [...new Set(p.activities.map((a) => a.tool))].sort().join(","),
      last: p.activities.reduce<Date | null>(
        (latest, a) => (!latest || a.endedAt > latest ? a.endedAt : latest),
        null,
      ),
    }))
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));

  console.log(
    `${"project".padEnd(28)} ${"sess".padStart(4)} ${"active".padStart(8)}  ` +
      `${"tools".padEnd(18)} last active`,
  );
  for (const row of rows) {
    console.log(
      `${row.name.slice(0, 28).padEnd(28)} ${String(row.sessions).padStart(4)} ` +
        `${hm(row.minutes).padStart(8)}  ${row.tools.padEnd(18)} ` +
        `${row.last ? row.last.toISOString().slice(0, 16).replace("T", " ") : "—"}`,
    );
  }
  console.log(`\n${rows.length} projects in the ledger.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
