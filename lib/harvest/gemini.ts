import Database from "better-sqlite3";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DEFAULT_IDLE_GAP_MINUTES } from "./idle";
import { readJsonl } from "./jsonl";
import { canonicalPath, displayPath } from "./paths";
import type { RawActivity, ToolHarvester } from "./types";

/**
 * Gemini — Antigravity.
 *
 * Unlike the other two, this tool splits what we need across two files:
 *
 *   brain/<id>/.system_generated/logs/transcript.jsonl   when the work happened
 *   conversations/<id>.db                                where it happened
 *
 * The transcript carries no working directory at all, and the paths that *do*
 * appear in it are incidental — files a tool call happened to touch. Inferring
 * a project from those is the guess this module exists to refuse, so the
 * workspace comes from the conversation database or the session is dropped.
 */

interface TranscriptLine {
  type?: string;
  /** Antigravity's timestamp field. Note: not `timestamp`. */
  created_at?: string;
  content?: string;
}

/** Anything longer is a paragraph, not a label. */
const LABEL_MAX = 80;

/** Steps that represent a turn in the conversation rather than machinery. */
const MESSAGE_TYPES = new Set(["USER_INPUT", "PLANNER_RESPONSE"]);

export function defaultAntigravityRoot(): string {
  return path.join(homedir(), ".gemini", "antigravity");
}

function cleanLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

/**
 * Pull the workspace URI out of a protobuf blob.
 *
 * `trajectory_metadata_blob` holds one row of encoded protobuf whose first
 * length-delimited string is the workspace — `file:///c:/Users/.../SAT`. There
 * is no schema available to decode it properly, so this reads the printable
 * runs and takes the first `file:///` URI, which is the same trick `strings(1)`
 * plays.
 *
 * **This is the fragile part of this harvester and it is fragile on purpose.**
 * A layout change upstream makes it return null, which drops the session as
 * unattributed — missing data, never data attributed to the wrong project.
 * That asymmetry is what makes the scrape acceptable at all; keep it.
 */
export function workspaceFromBlob(buf: Buffer): string | null {
  const runs: string[] = [];
  let current = "";

  for (const byte of buf) {
    if (byte >= 0x20 && byte < 0x7f) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= 4) runs.push(current);
      current = "";
    }
  }
  if (current.length >= 4) runs.push(current);

  for (const run of runs) {
    const match = run.match(/file:\/\/\/([^\s"']+)/);
    if (!match) continue;

    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      continue;
    }

    // Only an absolute path is any use. A drive letter on Windows, a leading
    // slash elsewhere.
    if (!/^[a-zA-Z]:/.test(decoded) && !decoded.startsWith("/")) continue;

    return decoded.replace(/\//g, path.sep);
  }

  return null;
}

/**
 * Read-only, and never create. This is another application's database, and it
 * may well be open in that application right now — hence the try/catch on
 * every path out of here.
 */
function readWorkspace(dbPath: string): string | null {
  let db: Database.Database | undefined;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const row = db
      .prepare("SELECT data FROM trajectory_metadata_blob LIMIT 1")
      .get() as { data?: Buffer } | undefined;

    if (!row?.data || !Buffer.isBuffer(row.data)) return null;
    return workspaceFromBlob(row.data);
  } catch {
    // Locked, missing, or a schema we don't recognise. One session lost, not
    // the harvest.
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

export function createGeminiHarvester(
  root: string = defaultAntigravityRoot(),
  idleGapMinutes: number = DEFAULT_IDLE_GAP_MINUTES,
): ToolHarvester {
  const brainDir = path.join(root, "brain");
  const conversationsDir = path.join(root, "conversations");

  return {
    id: "gemini",
    label: "Gemini (Antigravity)",

    describeSource() {
      return brainDir;
    },

    async detect() {
      try {
        return (await stat(brainDir)).isDirectory();
      } catch {
        return false;
      }
    },

    async *harvest(since, summary) {
      let sessionIds: string[];
      try {
        sessionIds = (await readdir(brainDir, { withFileTypes: true }))
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        return;
      }

      for (const id of sessionIds) {
        // Constructed, never discovered. A recursive walk would also find
        // `logs/chunks/transcript/*.jsonl` and `transcript_full.jsonl`, which
        // are other renderings of this same conversation — every session would
        // be counted several times over.
        const transcript = path.join(
          brainDir,
          id,
          ".system_generated",
          "logs",
          "transcript.jsonl",
        );

        let info;
        try {
          info = await stat(transcript);
        } catch {
          continue;
        }
        if (!info.isFile()) continue;

        summary.filesSeen++;

        if (since && info.mtime <= since) {
          summary.filesSkipped++;
          continue;
        }
        if (info.size === 0) continue;

        const workspace = readWorkspace(path.join(conversationsDir, `${id}.db`));
        if (!workspace) {
          summary.unattributed++;
          continue;
        }

        const activity = await readSession(
          transcript,
          id,
          workspace,
          idleGapMinutes,
        );
        if (!activity) {
          summary.unattributed++;
          continue;
        }

        summary.activities++;
        yield activity;
      }
    },
  };
}

/** The default instance, pointed at the real home directory. */
export const geminiHarvester = createGeminiHarvester();

async function readSession(
  filePath: string,
  sessionId: string,
  workspace: string,
  idleGapMinutes: number,
): Promise<RawActivity | null> {
  let label: string | undefined;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let messageCount = 0;

  const gapMs = idleGapMinutes * 60_000;
  let activeMs = 0;
  let previous: number | null = null;

  try {
    for await (const line of readJsonl<TranscriptLine>(filePath)) {
      if (line.created_at) {
        if (!firstTimestamp) firstTimestamp = line.created_at;
        lastTimestamp = line.created_at;

        const at = Date.parse(line.created_at);
        if (!Number.isNaN(at)) {
          if (previous !== null && at > previous && at - previous <= gapMs) {
            activeMs += at - previous;
          }
          if (previous === null || at > previous) previous = at;
        }
      }

      if (line.type && MESSAGE_TYPES.has(line.type)) {
        messageCount++;
        if (!label && line.type === "USER_INPUT") label = cleanLabel(line.content);
      }
    }
  } catch {
    return null;
  }

  const startedAt = firstTimestamp ? new Date(firstTimestamp) : null;
  const endedAt = lastTimestamp ? new Date(lastTimestamp) : startedAt;
  if (!startedAt || !endedAt) return null;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return null;
  }

  return {
    tool: "gemini",
    sessionRef: sessionId,
    path: canonicalPath(workspace),
    displayPath: displayPath(workspace),
    startedAt,
    endedAt: endedAt >= startedAt ? endedAt : startedAt,
    activeMinutes: Math.round(activeMs / 60_000),
    messageCount,
    // Antigravity records no branch. Left undefined rather than guessed.
    gitBranch: undefined,
    label,
  };
}
