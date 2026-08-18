import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DEFAULT_IDLE_GAP_MINUTES } from "./idle";
import { readJsonl } from "./jsonl";
import { canonicalPath, displayPath } from "./paths";
import type { RawActivity, ToolHarvester } from "./types";

/**
 * Claude Code.
 *
 * History lives at `~/.claude/projects/<encoded>/<sessionId>.jsonl`.
 *
 * The directory name looks decodable — `C--Users-micha-OneDrive-Desktop-BUILDING-CLAUDE`
 * — but it is not. `-` stands for both the path separator *and* a literal
 * hyphen, so `IELTS-4-Weeks` is ambiguous and any decoder will eventually
 * attribute work to a folder that doesn't exist. The transcript carries the
 * real `cwd` on one of its first lines; that is the only trustworthy source.
 */

interface TranscriptLine {
  type?: string;
  cwd?: string;
  gitBranch?: string;
  timestamp?: string;
  customTitle?: string;
  sessionId?: string;
}

/** Anything longer is a paragraph, not a label. */
const LABEL_MAX = 80;

function cleanLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return undefined;
  return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
}

export function defaultClaudeProjectsRoot(): string {
  return path.join(homedir(), ".claude", "projects");
}

/**
 * `root` is injectable so tests can point at a fixture tree instead of the real
 * home directory — otherwise the test only passes on a machine that happens to
 * use Claude Code, which is no test at all.
 */
export function createClaudeCodeHarvester(
  root: string = defaultClaudeProjectsRoot(),
  idleGapMinutes: number = DEFAULT_IDLE_GAP_MINUTES,
): ToolHarvester {
  return {
    id: "claude-code",
    label: "Claude Code",

    describeSource() {
      return root;
    },

    async detect() {
      try {
        return (await stat(root)).isDirectory();
      } catch {
        return false;
      }
    },

    async *harvest(since, summary) {
      let projectDirs: string[];
      try {
        const entries = await readdir(root, { withFileTypes: true });
        projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch {
        return;
      }

      for (const dir of projectDirs) {
        const dirPath = path.join(root, dir);

        let files: string[];
        try {
          // Not recursive, and that is deliberate: Claude Code nests spawned
          // agents under `<session>/subagents/*.jsonl`, and a sub-agent runs
          // while its parent waits — inside the parent's own span. Counting
          // both double-counts the same wall clock. Measured on Codex, which
          // stores the equivalent files as siblings: 327 active minutes
          // counted naively against 163 with sub-agents removed. Adding
          // `{ recursive: true }` here would silently reintroduce that.
          files = (await readdir(dirPath)).filter((f) => f.endsWith(".jsonl"));
        } catch {
          continue;
        }

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          summary.filesSeen++;

          let info;
          try {
            info = await stat(filePath);
          } catch {
            continue;
          }

          // Incremental harvest: a transcript unchanged since the last run has
          // nothing new to say. This is what keeps repeat harvests cheap as
          // history accumulates — every file is fully read once, ever.
          if (since && info.mtime <= since) {
            summary.filesSkipped++;
            continue;
          }
          if (info.size === 0) continue;

          const activity = await readSession(filePath, file, idleGapMinutes);
          if (!activity) {
            summary.unattributed++;
            continue;
          }

          summary.activities++;
          yield activity;
        }
      }
    },
  };
}

/** The default instance, pointed at the real home directory. */
export const claudeCodeHarvester = createClaudeCodeHarvester();

/**
 * One streaming pass per transcript.
 *
 * A head-scan plus a tail-read would touch fewer bytes, but it can't produce an
 * exact message count, and mixing exact with estimated counts in one table
 * makes every number suspect. The mtime skip above is the real answer to volume.
 */
async function readSession(
  filePath: string,
  fileName: string,
  idleGapMinutes: number,
): Promise<RawActivity | null> {
  let cwd: string | undefined;
  let gitBranch: string | undefined;
  let sessionId: string | undefined;
  let label: string | undefined;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let messageCount = 0;

  const gapMs = idleGapMinutes * 60_000;
  let activeMs = 0;
  let previous: number | null = null;

  try {
    for await (const line of readJsonl<TranscriptLine>(filePath)) {
      if (!cwd && line.cwd) cwd = line.cwd;
      if (!gitBranch && line.gitBranch) gitBranch = line.gitBranch;
      if (!sessionId && line.sessionId) sessionId = line.sessionId;
      if (!label) label = cleanLabel(line.customTitle);

      if (line.timestamp) {
        if (!firstTimestamp) firstTimestamp = line.timestamp;
        lastTimestamp = line.timestamp;

        const at = Date.parse(line.timestamp);
        if (!Number.isNaN(at)) {
          // Only count the gap when it's short enough to be one continuous
          // stretch of work. Out-of-order lines contribute nothing rather than
          // subtracting time.
          if (previous !== null && at > previous && at - previous <= gapMs) {
            activeMs += at - previous;
          }
          if (previous === null || at > previous) previous = at;
        }
      }

      if (line.type === "user" || line.type === "assistant") messageCount++;
    }
  } catch {
    // An unreadable transcript costs one session, not the whole harvest.
    return null;
  }

  // Without a cwd there is no project to attribute the work to. Guessing from
  // the folder name is exactly the mistake this harvester exists to avoid.
  if (!cwd) return null;

  const startedAt = firstTimestamp ? new Date(firstTimestamp) : null;
  const endedAt = lastTimestamp ? new Date(lastTimestamp) : startedAt;
  if (!startedAt || !endedAt) return null;
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return null;
  }

  return {
    tool: "claude-code",
    // The filename is the session id; fall back to it if no line carried one.
    sessionRef: sessionId ?? path.basename(fileName, ".jsonl"),
    path: canonicalPath(cwd),
    displayPath: displayPath(cwd),
    startedAt,
    // Clock skew or out-of-order lines mustn't produce a negative duration.
    endedAt: endedAt >= startedAt ? endedAt : startedAt,
    activeMinutes: Math.round(activeMs / 60_000),
    messageCount,
    gitBranch,
    label,
  };
}
