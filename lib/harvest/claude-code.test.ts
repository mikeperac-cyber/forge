import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClaudeCodeHarvester } from "./claude-code";
import { canonicalPath, displayPath } from "./paths";
import type { HarvestSummary, RawActivity } from "./types";

function summary(): HarvestSummary {
  return {
    tool: "claude-code",
    filesSeen: 0,
    filesSkipped: 0,
    activities: 0,
    unattributed: 0,
  };
}

function line(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "forge-cc-"));

  // A normal session: cwd arrives a few lines in, as it does in reality.
  const normal = path.join(root, "C--Users-mike-Desktop-IELTS-4-Weeks");
  await mkdir(normal, { recursive: true });
  await writeFile(
    path.join(normal, "sess-1.jsonl"),
    [
      line({ type: "summary", sessionId: "sess-1" }),
      line({
        type: "user",
        cwd: "C:\\Users\\mike\\Desktop\\IELTS-4-Weeks",
        gitBranch: "main",
        customTitle: "  Rebuild   the   band   descriptors  ",
        timestamp: "2026-08-09T09:00:00.000Z",
      }),
      line({ type: "assistant", timestamp: "2026-08-09T09:05:00.000Z" }),
      line({ type: "user", timestamp: "2026-08-09T09:40:00.000Z" }),
      // Trailing junk: a session still being written.
      '{"type":"assistant","timesta',
    ].join("\n"),
    "utf8",
  );

  // No cwd anywhere — unattributable, and must NOT be guessed from the folder.
  const orphan = path.join(root, "C--Users-mike-Desktop-Mystery");
  await mkdir(orphan, { recursive: true });
  await writeFile(
    path.join(orphan, "sess-2.jsonl"),
    [
      line({ type: "user", timestamp: "2026-08-09T10:00:00.000Z" }),
      line({ type: "assistant", timestamp: "2026-08-09T10:01:00.000Z" }),
    ].join("\n"),
    "utf8",
  );

  // Single message, and timestamps out of order.
  const odd = path.join(root, "C--Users-mike-Desktop-Odd");
  await mkdir(odd, { recursive: true });
  await writeFile(
    path.join(odd, "sess-3.jsonl"),
    [
      line({
        type: "user",
        cwd: "C:\\Users\\mike\\Desktop\\Odd\\",
        timestamp: "2026-08-09T12:00:00.000Z",
      }),
      line({ type: "assistant", timestamp: "2026-08-09T11:00:00.000Z" }),
    ].join("\n"),
    "utf8",
  );

  // Empty file — skipped without counting as unattributed.
  const empty = path.join(root, "C--Users-mike-Desktop-Empty");
  await mkdir(empty, { recursive: true });
  await writeFile(path.join(empty, "sess-4.jsonl"), "", "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function harvestAll(since: Date | null = null) {
  const stats = summary();
  const out: RawActivity[] = [];
  for await (const activity of createClaudeCodeHarvester(root).harvest(
    since,
    stats,
  )) {
    out.push(activity);
  }
  return { out, stats };
}

describe("claude-code harvester", () => {
  it("detects a present source and an absent one", async () => {
    expect(await createClaudeCodeHarvester(root).detect()).toBe(true);
    expect(
      await createClaudeCodeHarvester(path.join(root, "nope")).detect(),
    ).toBe(false);
  });

  it("reads the real cwd from inside the transcript", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-1")!;

    // The folder name is `...-IELTS-4-Weeks`, which no decoder could resolve
    // unambiguously. The path must come from `cwd`.
    expect(session.path).toBe(
      canonicalPath("C:\\Users\\mike\\Desktop\\IELTS-4-Weeks"),
    );
    expect(session.gitBranch).toBe("main");
  });

  it("carries the cased path alongside the canonical one", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-1")!;

    // Canonicalising folds case on Windows and that is not reversible, so the
    // display form has to travel with it. `IELTS-4-Weeks` must survive intact
    // or every project in the registry ends up named in lowercase.
    expect(session.displayPath).toBe(
      displayPath("C:\\Users\\mike\\Desktop\\IELTS-4-Weeks"),
    );
    expect(session.displayPath).toContain("IELTS-4-Weeks");
  });

  it("derives the span from first and last timestamps", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-1")!;

    expect(session.startedAt.toISOString()).toBe("2026-08-09T09:00:00.000Z");
    // The truncated final line is skipped, so the last good one wins.
    expect(session.endedAt.toISOString()).toBe("2026-08-09T09:40:00.000Z");
    expect(session.messageCount).toBe(3);
  });

  it("counts only gaps shorter than the idle threshold", async () => {
    // sess-1 timestamps: 09:00 → 09:05 → 09:40.
    // The 5m gap is work; the 35m gap is not.
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-1")!;

    expect(session.activeMinutes).toBe(5);
    // Wall clock would claim 40. On real data that overstates by 4×: one
    // session left open overnight reports 34h against 3h23m of actual work.
    expect(minutesBetween(session.startedAt, session.endedAt)).toBe(40);
  });

  it("counts a long gap when the threshold allows it", async () => {
    const stats = summary();
    const out: RawActivity[] = [];
    // 60m threshold: the 35m gap now counts, so 5 + 35 = 40.
    for await (const a of createClaudeCodeHarvester(root, 60).harvest(
      null,
      stats,
    )) {
      out.push(a);
    }

    expect(out.find((a) => a.sessionRef === "sess-1")!.activeMinutes).toBe(40);
  });

  it("collapses whitespace in the label", async () => {
    const { out } = await harvestAll();
    expect(out.find((a) => a.sessionRef === "sess-1")!.label).toBe(
      "Rebuild the band descriptors",
    );
  });

  it("refuses to attribute a session with no cwd", async () => {
    const { out, stats } = await harvestAll();

    expect(out.some((a) => a.sessionRef === "sess-2")).toBe(false);
    expect(stats.unattributed).toBe(1);
  });

  it("never reports a negative duration", async () => {
    const { out } = await harvestAll();
    const odd = out.find((a) => a.sessionRef === "sess-3")!;

    expect(odd.endedAt.getTime()).toBeGreaterThanOrEqual(
      odd.startedAt.getTime(),
    );
    // Trailing separator must not create a second, distinct project.
    expect(odd.path).toBe(canonicalPath("C:\\Users\\mike\\Desktop\\Odd"));
  });

  it("skips files untouched since the last harvest", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const old = path.join(
      root,
      "C--Users-mike-Desktop-IELTS-4-Weeks",
      "sess-1.jsonl",
    );
    await utimes(old, past, past);

    const { out, stats } = await harvestAll(
      new Date("2024-01-01T00:00:00.000Z"),
    );

    expect(out.some((a) => a.sessionRef === "sess-1")).toBe(false);
    expect(stats.filesSkipped).toBeGreaterThanOrEqual(1);
  });
});
