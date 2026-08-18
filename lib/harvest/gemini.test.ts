import Database from "better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGeminiHarvester, workspaceFromBlob } from "./gemini";
import { canonicalPath } from "./paths";
import type { HarvestSummary, RawActivity } from "./types";

function summary(): HarvestSummary {
  return {
    tool: "gemini",
    filesSeen: 0,
    filesSkipped: 0,
    activities: 0,
    unattributed: 0,
  };
}

function step(type: string, created_at: string, content?: string): string {
  return JSON.stringify({ type, created_at, ...(content ? { content } : {}) });
}

/** A protobuf-ish blob: length-prefixed string surrounded by binary noise. */
function blobWith(uri: string): Buffer {
  return Buffer.concat([
    Buffer.from([0x0a, uri.length]),
    Buffer.from(uri, "utf8"),
    Buffer.from([0x00, 0x12, 0x24]),
  ]);
}

function writeConversationDb(file: string, blob: Buffer | null) {
  const db = new Database(file);
  db.exec("CREATE TABLE trajectory_metadata_blob (id TEXT, data BLOB)");
  if (blob) {
    db.prepare("INSERT INTO trajectory_metadata_blob VALUES (?, ?)").run("t", blob);
  }
  db.close();
}

const WORKSPACE = "c:/Users/mike/Desktop/IELTS-4-Weeks";

let root: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "forge-gemini-"));
  const brain = path.join(root, "brain");
  const convos = path.join(root, "conversations");
  await mkdir(convos, { recursive: true });

  // ---- a normal session ------------------------------------------------
  const good = path.join(brain, "sess-good", ".system_generated", "logs");
  await mkdir(path.join(good, "chunks", "transcript"), { recursive: true });
  await writeFile(
    path.join(good, "transcript.jsonl"),
    [
      step("USER_INPUT", "2026-08-14T09:00:00Z", "  Rebuild   the   descriptors  "),
      step("PLANNER_RESPONSE", "2026-08-14T09:05:00Z"),
      step("RUN_COMMAND", "2026-08-14T09:06:00Z"),
      step("USER_INPUT", "2026-08-14T09:40:00Z", "thanks"),
    ].join("\n"),
    "utf8",
  );
  // Other renderings of the same conversation. Reading these too would count
  // this one session three times.
  await writeFile(
    path.join(good, "transcript_full.jsonl"),
    [step("USER_INPUT", "2026-08-14T09:00:00Z", "dupe")].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(good, "chunks", "transcript", "00000000.jsonl"),
    [step("USER_INPUT", "2026-08-14T09:00:00Z", "dupe")].join("\n"),
    "utf8",
  );
  writeConversationDb(
    path.join(convos, "sess-good.db"),
    blobWith(`file:///${WORKSPACE}`),
  );

  // ---- a session whose workspace can't be resolved ----------------------
  const orphan = path.join(brain, "sess-orphan", ".system_generated", "logs");
  await mkdir(orphan, { recursive: true });
  await writeFile(
    path.join(orphan, "transcript.jsonl"),
    [step("USER_INPUT", "2026-08-14T11:00:00Z", "hello")].join("\n"),
    "utf8",
  );
  writeConversationDb(path.join(convos, "sess-orphan.db"), null);

  // ---- a session with no conversation database at all -------------------
  const nodb = path.join(brain, "sess-nodb", ".system_generated", "logs");
  await mkdir(nodb, { recursive: true });
  await writeFile(
    path.join(nodb, "transcript.jsonl"),
    [step("USER_INPUT", "2026-08-14T12:00:00Z", "hello")].join("\n"),
    "utf8",
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function harvestAll(since: Date | null = null) {
  const stats = summary();
  const out: RawActivity[] = [];
  for await (const activity of createGeminiHarvester(root).harvest(since, stats)) {
    out.push(activity);
  }
  return { out, stats };
}

describe("workspaceFromBlob", () => {
  it("finds a plain file:// URI", () => {
    expect(workspaceFromBlob(blobWith("file:///c:/Users/mike/Proj"))).toBe(
      path.normalize("c:\\Users\\mike\\Proj").replace(/\\/g, path.sep),
    );
  });

  it("decodes percent-encoding", () => {
    const got = workspaceFromBlob(blobWith("file:///c%3A/Users/mike/My%20Work"));
    expect(got).toContain("My Work");
    expect(got).toContain("c:");
  });

  it("returns null when there is no URI", () => {
    expect(workspaceFromBlob(Buffer.from([0x08, 0x01, 0x10, 0x02]))).toBeNull();
  });

  it("ignores a URI that isn't an absolute path", () => {
    expect(workspaceFromBlob(blobWith("file:///relative-ish"))).toBeNull();
  });
});

describe("gemini harvester", () => {
  it("detects a present source and an absent one", async () => {
    expect(await createGeminiHarvester(root).detect()).toBe(true);
    expect(await createGeminiHarvester(path.join(root, "nope")).detect()).toBe(false);
  });

  it("takes the workspace from the conversation database", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-good")!;

    // The transcript itself carries no cwd at all — this can only have come
    // from the sqlite blob.
    expect(session.path).toBe(canonicalPath(WORKSPACE.replace(/\//g, path.sep)));
    expect(session.displayPath).toContain("IELTS-4-Weeks");
  });

  it("reads only transcript.jsonl, not its chunks or the full copy", async () => {
    const { out, stats } = await harvestAll();

    // Three files on disk describe `sess-good`; exactly one session comes out.
    expect(out.filter((a) => a.sessionRef === "sess-good")).toHaveLength(1);
    // One file counted per session directory, not per file on disk.
    expect(stats.filesSeen).toBe(3);
  });

  it("drops a session whose workspace cannot be resolved", async () => {
    const { out, stats } = await harvestAll();

    expect(out.some((a) => a.sessionRef === "sess-orphan")).toBe(false);
    expect(out.some((a) => a.sessionRef === "sess-nodb")).toBe(false);
    // Missing, never guessed from the paths that appear in the transcript.
    expect(stats.unattributed).toBe(2);
  });

  it("times the session from created_at", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-good")!;

    expect(session.startedAt.toISOString()).toBe("2026-08-14T09:00:00.000Z");
    expect(session.endedAt.toISOString()).toBe("2026-08-14T09:40:00.000Z");
  });

  it("counts only conversation turns", async () => {
    const { out } = await harvestAll();
    const session = out.find((a) => a.sessionRef === "sess-good")!;

    // 2 USER_INPUT + 1 PLANNER_RESPONSE. RUN_COMMAND is machinery.
    expect(session.messageCount).toBe(3);
  });

  it("labels from the first user step, whitespace collapsed", async () => {
    const { out } = await harvestAll();
    expect(out.find((a) => a.sessionRef === "sess-good")!.label).toBe(
      "Rebuild the descriptors",
    );
  });

  it("counts only gaps shorter than the idle threshold", async () => {
    const { out } = await harvestAll();
    // 09:00 → 09:05 → 09:06 counts (6m); the 34m gap to 09:40 does not.
    expect(out.find((a) => a.sessionRef === "sess-good")!.activeMinutes).toBe(6);
  });

  it("tags every activity with its own tool", async () => {
    const { out } = await harvestAll();
    expect(out.every((a) => a.tool === "gemini")).toBe(true);
  });

  it("skips sessions untouched since the last harvest", async () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    const file = path.join(
      root,
      "brain",
      "sess-good",
      ".system_generated",
      "logs",
      "transcript.jsonl",
    );
    await utimes(file, past, past);

    const { out, stats } = await harvestAll(new Date("2024-01-01T00:00:00.000Z"));

    expect(out.some((a) => a.sessionRef === "sess-good")).toBe(false);
    expect(stats.filesSkipped).toBeGreaterThanOrEqual(1);
  });
});
