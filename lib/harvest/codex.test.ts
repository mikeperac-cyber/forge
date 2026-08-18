import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createCodexHarvester } from "./codex";
import { canonicalPath, displayPath } from "./paths";
import type { HarvestSummary, RawActivity } from "./types";

function summary(): HarvestSummary {
  return {
    tool: "codex",
    filesSeen: 0,
    filesSkipped: 0,
    activities: 0,
    unattributed: 0,
  };
}

function line(fields: Record<string, unknown>): string {
  return JSON.stringify(fields);
}

function meta(payload: Record<string, unknown>, timestamp: string): string {
  return line({ timestamp, type: "session_meta", payload });
}

function msg(kind: string, timestamp: string, message?: string): string {
  return line({
    timestamp,
    type: "event_msg",
    payload: { type: kind, ...(message === undefined ? {} : { message }) },
  });
}

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "forge-codex-"));

  // Date-nested, as Codex actually writes them.
  const day = path.join(root, "2026", "08", "13");
  await mkdir(day, { recursive: true });

  // A parent session: 09:00 → 09:05 → 09:40.
  await writeFile(
    path.join(day, "rollout-2026-08-13T09-00-00-parent.jsonl"),
    [
      meta(
        { id: "parent-1", cwd: "C:\\Users\\mike\\Desktop\\IELTS-4-Weeks" },
        "2026-08-13T09:00:00.000Z",
      ),
      // The harness prepends this block; it is not what anyone typed.
      msg(
        "user_message",
        "2026-08-13T09:00:05.000Z",
        "# Files mentioned by the user:\n\n## Yes\n\nRewrite the band descriptors",
      ),
      msg("agent_message", "2026-08-13T09:05:00.000Z", "On it."),
      msg("user_message", "2026-08-13T09:40:00.000Z", "Thanks"),
      // Neither of these is a conversation turn.
      line({
        timestamp: "2026-08-13T09:40:01.000Z",
        type: "event_msg",
        payload: { type: "token_count" },
      }),
      line({
        timestamp: "2026-08-13T09:40:02.000Z",
        type: "response_item",
        payload: { type: "message", role: "developer" },
      }),
      // Truncated final line: a session still being written.
      '{"timestamp":"2026-08-13T09:41',
    ].join("\n"),
    "utf8",
  );

  // A sub-agent spawned by the parent, running inside the parent's span.
  await writeFile(
    path.join(day, "rollout-2026-08-13T09-01-00-child.jsonl"),
    [
      meta(
        {
          id: "child-1",
          cwd: "C:\\Users\\mike\\Desktop\\IELTS-4-Weeks",
          parent_thread_id: "parent-1",
          forked_from_id: "parent-1",
          agent_nickname: "Hooke",
        },
        "2026-08-13T09:01:00.000Z",
      ),
      msg("agent_message", "2026-08-13T09:30:00.000Z", "Done."),
    ].join("\n"),
    "utf8",
  );

  // No cwd anywhere — unattributable.
  await writeFile(
    path.join(day, "rollout-2026-08-13T11-00-00-orphan.jsonl"),
    [
      meta({ id: "orphan-1" }, "2026-08-13T11:00:00.000Z"),
      msg("agent_message", "2026-08-13T11:01:00.000Z", "hello"),
    ].join("\n"),
    "utf8",
  );

  // Empty file — skipped without counting as unattributed.
  await writeFile(path.join(day, "rollout-empty.jsonl"), "", "utf8");
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function harvestAll(since: Date | null = null) {
  const stats = summary();
  const out: RawActivity[] = [];
  for await (const activity of createCodexHarvester(root).harvest(
    since,
    stats,
  )) {
    out.push(activity);
  }
  return { out, stats };
}

describe("codex harvester", () => {
  it("detects a present source and an absent one", async () => {
    expect(await createCodexHarvester(root).detect()).toBe(true);
    expect(await createCodexHarvester(path.join(root, "nope")).detect()).toBe(
      false,
    );
  });

  it("recurses into the date-nested directories", async () => {
    const { out, stats } = await harvestAll();

    // Flat `readdir` would find nothing at all under `<root>/2026/08/13`.
    expect(stats.filesSeen).toBeGreaterThanOrEqual(4);
    expect(out.some((a) => a.sessionRef === "parent-1")).toBe(true);
  });

  it("reads the cwd from the session_meta line", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "parent-1")!;

    expect(session.path).toBe(
      canonicalPath("C:\\Users\\mike\\Desktop\\IELTS-4-Weeks"),
    );
    expect(session.displayPath).toBe(
      displayPath("C:\\Users\\mike\\Desktop\\IELTS-4-Weeks"),
    );
  });

  it("skips sub-agent threads rather than double-counting their parent", async () => {
    const { out, stats } = await harvestAll();

    // The child ran 09:01→09:30, entirely inside the parent's 09:00→09:40.
    // Counting it would report 69 minutes of work for 40 minutes of clock.
    expect(out.some((a) => a.sessionRef === "child-1")).toBe(false);
    // Deliberately skipped, not a parse failure.
    expect(stats.unattributed).toBe(1); // the orphan only
    expect(stats.filesSkipped).toBeGreaterThanOrEqual(1);
  });

  it("counts only user and agent messages", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "parent-1")!;

    // 2 user + 1 agent. `token_count` and the developer `response_item` are
    // machinery, not conversation.
    expect(session.messageCount).toBe(3);
  });

  it("labels from the prompt, not the injected preamble", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "parent-1")!;

    // Taking the message verbatim would label this "# Files mentioned by the
    // user: ## Yes …", which is identical on every session.
    expect(session.label).toBe("Rewrite the band descriptors");
  });

  it("counts only gaps shorter than the idle threshold", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "parent-1")!;

    // 09:00 → 09:05 counts; the 35m gap to 09:40 does not.
    expect(session.activeMinutes).toBe(5);
  });

  it("counts a long gap when the threshold allows it", async () => {
    const stats = summary();
    const out: RawActivity[] = [];
    for await (const a of createCodexHarvester(root, 60).harvest(null, stats)) {
      out.push(a);
    }

    expect(out.find((a) => a.sessionRef === "parent-1")!.activeMinutes).toBe(
      40,
    );
  });

  it("refuses to attribute a session with no cwd", async () => {
    const { out, stats } = await harvestAll();

    expect(out.some((a) => a.sessionRef === "orphan-1")).toBe(false);
    expect(stats.unattributed).toBe(1);
  });

  it("tags every activity with its own tool", async () => {
    const { out } = await harvestAll();
    expect(out.every((a) => a.tool === "codex")).toBe(true);
  });

  it("skips files untouched since the last harvest", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const old = path.join(
      root,
      "2026",
      "08",
      "13",
      "rollout-2026-08-13T09-00-00-parent.jsonl",
    );
    await utimes(old, past, past);

    const { out, stats } = await harvestAll(
      new Date("2024-01-01T00:00:00.000Z"),
    );

    expect(out.some((a) => a.sessionRef === "parent-1")).toBe(false);
    expect(stats.filesSkipped).toBeGreaterThanOrEqual(1);
  });
});
