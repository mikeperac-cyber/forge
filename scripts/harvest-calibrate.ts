/**
 * Where should the idle threshold sit?
 *
 * Strictly read-only — it opens histories and prints a table. Nothing is
 * written anywhere, including the database.
 *
 *   npm run harvest:calibrate
 *
 * ## How it works
 *
 * A harvester's `activeMinutes` is the sum of every inter-message gap shorter
 * than its threshold. So the total at threshold `t` is the cumulative sum of
 * all gaps up to `t`, and differencing consecutive totals recovers how much
 * time sits in each band of gap length — without changing the `ToolHarvester`
 * contract or re-implementing anyone's parser.
 *
 * The ledger cannot answer this question, incidentally: `Activity.activeMinutes`
 * is already gap-adjusted on the way in, so the gap structure is gone by the
 * time it reaches the database. Calibration has to start from the transcripts.
 *
 * ## Reading the output
 *
 * Look for a **valley** — a run of bands contributing almost nothing. That is
 * where the boundary between "thinking about it" and "went to lunch" actually
 * falls. A threshold inside a valley is stable: nudging it a few minutes either
 * way barely changes the answer. A threshold in the middle of a busy band is
 * not, and will swing with the next week's data.
 */
import { HARVESTERS, HARVESTER_FACTORIES } from "../lib/harvest/registry";
import { DEFAULT_IDLE_GAP_MINUTES } from "../lib/harvest/idle";
import type { HarvestSummary } from "../lib/harvest/types";

/** Fine near zero where the interesting structure is, coarse out in the tail. */
const PROBES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 60, 90, 120,
];

function hm(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  return `${Math.floor(mins / 60)}h ${Math.round(mins % 60)}m`;
}

function blank(tool: string): HarvestSummary {
  return {
    tool,
    filesSeen: 0,
    filesSkipped: 0,
    activities: 0,
    unattributed: 0,
  };
}

/** Total active minutes across every detected tool at one threshold. */
async function totalAt(gap: number, tools: string[]): Promise<number> {
  let total = 0;
  for (const id of tools) {
    const make = HARVESTER_FACTORIES[id];
    if (!make) continue;
    for await (const a of make(gap).harvest(null, blank(id))) {
      total += a.activeMinutes;
    }
  }
  return total;
}

async function main() {
  const started = Date.now();

  const tools: string[] = [];
  for (const harvester of HARVESTERS) {
    if (!HARVESTER_FACTORIES[harvester.id]) continue;
    if (await harvester.detect()) tools.push(harvester.id);
  }

  if (tools.length === 0) {
    console.log("No tool histories found — nothing to calibrate against.");
    return;
  }

  console.log(`tools    : ${tools.join(", ")}`);
  console.log(`current  : ${DEFAULT_IDLE_GAP_MINUTES}m\n`);

  const totals = new Map<number, number>();
  for (const gap of PROBES) totals.set(gap, await totalAt(gap, tools));

  // Time contributed by gaps falling inside each band.
  const bands = PROBES.slice(1).map((upper, i) => {
    const lower = PROBES[i];
    return {
      lower,
      upper,
      added: (totals.get(upper) ?? 0) - (totals.get(lower) ?? 0),
      cumulative: totals.get(upper) ?? 0,
    };
  });

  const widest = Math.max(...bands.map((b) => b.added), 1);

  console.log(
    `${"gap band".padEnd(12)} ${"adds".padStart(8)} ${"total".padStart(9)}  distribution`,
  );
  for (const band of bands) {
    const bar = "█".repeat(Math.round((band.added / widest) * 34));
    const label = `${band.lower}–${band.upper}m`;
    console.log(
      `${label.padEnd(12)} ${hm(band.added).padStart(8)} ${hm(band.cumulative).padStart(9)}  ${bar}`,
    );
  }

  // "Almost" nothing, because one stray gap shouldn't disqualify an otherwise
  // empty stretch.
  const noise = Math.max(1, Math.round(widest * 0.02));

  // Everything past the last contributing band is empty by definition — there
  // simply are no gaps that long. That trailing emptiness is not a boundary,
  // and treating it as one would recommend a threshold so high that every gap
  // counts, which is the behaviour the threshold exists to prevent. Only
  // valleys with data on *both* sides separate anything.
  let lastContributing = -1;
  bands.forEach((band, i) => {
    if (band.added > noise) lastContributing = i;
  });
  const separating = bands.slice(0, Math.max(lastContributing, 0));

  let best = { from: 0, to: 0, width: 0 };
  let runStart: number | null = null;

  for (const band of separating) {
    if (band.added <= noise) {
      if (runStart === null) runStart = band.lower;
      const width = band.upper - runStart;
      if (width > best.width) best = { from: runStart, to: band.upper, width };
    } else {
      runStart = null;
    }
  }

  // How far the current threshold can move without changing the answer — the
  // most decision-relevant number here, because a threshold that is stable
  // under a few minutes of nudging will not swing with next week's data.
  const currentIndex = bands.findIndex(
    (b) =>
      b.lower <= DEFAULT_IDLE_GAP_MINUTES && DEFAULT_IDLE_GAP_MINUTES < b.upper,
  );
  let stableFrom = DEFAULT_IDLE_GAP_MINUTES;
  let stableTo = DEFAULT_IDLE_GAP_MINUTES;

  // Only meaningful when the band the threshold sits in is itself empty —
  // then it can move across that whole band, plus any empty bands adjoining
  // it. If its own band carries gaps, any nudge changes the total.
  if (currentIndex >= 0 && bands[currentIndex].added <= noise) {
    stableFrom = bands[currentIndex].lower;
    stableTo = bands[currentIndex].upper;

    for (
      let i = currentIndex + 1;
      i < bands.length && bands[i].added <= noise;
      i++
    ) {
      stableTo = bands[i].upper;
    }
    for (let i = currentIndex - 1; i >= 0 && bands[i].added <= noise; i--) {
      stableFrom = bands[i].lower;
    }
  }

  const full = totals.get(PROBES[PROBES.length - 1]) ?? 0;
  const current = await totalAt(DEFAULT_IDLE_GAP_MINUTES, tools);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nat the current ${DEFAULT_IDLE_GAP_MINUTES}m : ${hm(current)}`);
  console.log(
    `everything up to ${PROBES[PROBES.length - 1]}m : ${hm(full)} ` +
      `(${Math.round((current / Math.max(full, 1)) * 100)}% captured at ${DEFAULT_IDLE_GAP_MINUTES}m)`,
  );

  if (stableTo > stableFrom) {
    console.log(
      `\nstable range     : ${stableFrom}–${stableTo}m all give ${hm(current)} — ` +
        `the current value can move within that without changing anything`,
    );
  } else {
    console.log(
      `\nstable range     : none — every nearby value changes the total, so ` +
        `${DEFAULT_IDLE_GAP_MINUTES}m sits inside a cluster of real pauses`,
    );
  }

  if (best.width > 0) {
    console.log(
      `next boundary    : ${best.from}–${best.to}m is also empty, with gaps on ` +
        `both sides — the next defensible threshold up, worth ` +
        `${hm((totals.get(best.to) ?? 0) - current)} more`,
    );
  } else {
    console.log(
      "next boundary    : none — gaps are spread across every band, so the " +
        "threshold is a judgement call rather than a natural boundary",
    );
  }

  console.log(`\n${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
