import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { DEFAULT_IDLE_GAP_MINUTES } from "./idle";
import { readJsonl } from "./jsonl";
import { canonicalPath, displayPath } from "./paths";
import type { RawActivity, ToolHarvester } from "./types";

/**
 * Codex CLI.
 *
 * History lives at `~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-<ts>-<uuid>.jsonl`
 * — date-nested rather than flat, so the walk has to recurse. Rooting at
 * `sessions/` rather than `~/.codex` keeps that recursion bounded; the rest of
 * that directory holds caches, plugins and several SQLite databases.
 *
 * Every line is `{ timestamp, type, payload }`. The first is a `session_meta`
 * carrying the working directory, which is the only place it appears.
 */

interface RolloutLine {
  timestamp?: string;
  type?: string;
  payload?: {
    type?: string;
    id?: string;
    session_id?: string;
    cwd?: string;
    /** Present only on sub-agent threads. See `readSession`. */
    parent_thread_id?: string;
    message?: string;
  };
}

/** Anything longer is a paragraph, not a label. */
const LABEL_MAX = 80;

export function defaultCodexSessionsRoot(): string {
  return path.join(homedir(), ".codex", "sessions");
}

/**
 * The opening prompt, minus the context Codex injects ahead of it.
 *
 * A real first message on this machine starts `# Files mentioned by the user:`
 * — a preamble the harness prepends, not something anyone typed. Taking the
 * message verbatim would label every session with the same boilerplate, so
 * leading markdown headings and blank lines are dropped and the first line of
 * actual prose wins.
 */
function labelFromMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;

  for (const raw of message.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith("##")) continue;

    const flat = line.replace(/\s+/g, " ");
    return flat.length > LABEL_MAX ? `${flat.slice(0, LABEL_MAX - 1)}…` : flat;
  }

  return undefined;
}

export function createCodexHarvester(
  root: string = defaultCodexSessionsRoot(),
  idleGapMinutes: number = DEFAULT_IDLE_GAP_MINUTES,
): ToolHarvester {
  return {
    id: "codex",
    label: "Codex",

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
      let relative: string[];
      try {
        // Relative path strings rather than Dirent objects: `parentPath` vs
        // `path` on Dirent has churned across Node versions, and this needs no
        // more than the name.
        relative = (await readdir(root, { recursive: true })).filter((f) =>
          f.endsWith(".jsonl"),
        );
      } catch {
        return;
      }

      for (const name of relative) {
        const filePath = path.join(root, name);
        summary.filesSeen++;

        let info;
        try {
          info = await stat(filePath);
        } catch {
          continue;
        }
        if (!info.isFile()) continue;

        if (since && info.mtime <= since) {
          summary.filesSkipped++;
          continue;
        }
        if (info.size === 0) continue;

        const result = await readSession(filePath, idleGapMinutes);

        if (result.kind === "sub-agent") {
          // Seen, understood, deliberately not counted.
          summary.filesSkipped++;
          continue;
        }
        if (result.kind === "unusable") {
          summary.unattributed++;
          continue;
        }

        summary.activities++;
        yield result.activity;
      }
    },
  };
}

/** The default instance, pointed at the real home directory. */
export const codexHarvester = createCodexHarvester();

type SessionResult =
  | { kind: "ok"; activity: RawActivity }
  | { kind: "sub-agent" }
  | { kind: "unusable" };

/**
 * One streaming pass per rollout.
 *
 * **Sub-agent threads are skipped, and this is the whole reason it happens
 * here rather than being left implicit.** Codex writes a spawned agent to its
 * own rollout file in the same directory as its parent, so the two look alike
 * from the outside — but the child runs *while the parent waits*, inside the
 * parent's own span. Counting both double-counts the same wall clock.
 *
 * That is not a guess. On this machine the nine rollouts total 327 active
 * minutes counted naively and 163 with sub-agents removed: a 2× overstatement,
 * from five files whose parents were already claiming the same time. One
 * parent spanning 67 minutes had three children of 50, 29 and 20, all starting
 * a minute after it began.
 *
 * `parent_thread_id` is the signal, it appears on the `session_meta` line, and
 * that line is the first in the file — so a sub-agent costs one line to reject
 * rather than a full read of what can be a 26MB transcript.
 */
async function readSession(
  filePath: string,
  idleGapMinutes: number,
): Promise<SessionResult> {
  let cwd: string | undefined;
  let sessionRef: string | undefined;
  let label: string | undefined;
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  let messageCount = 0;

  const gapMs = idleGapMinutes * 60_000;
  let activeMs = 0;
  let previous: number | null = null;

  try {
    for await (const line of readJsonl<RolloutLine>(filePath)) {
      if (line.type === "session_meta" && line.payload) {
        if (line.payload.parent_thread_id) return { kind: "sub-agent" };
        cwd ??= line.payload.cwd;
        sessionRef ??= line.payload.id ?? line.payload.session_id;
      }

      if (line.timestamp) {
        if (!firstTimestamp) firstTimestamp = line.timestamp;
        lastTimestamp = line.timestamp;

        const at = Date.parse(line.timestamp);
        if (!Number.isNaN(at)) {
          if (previous !== null && at > previous && at - previous <= gapMs) {
            activeMs += at - previous;
          }
          if (previous === null || at > previous) previous = at;
        }
      }

      // The user-visible conversation. Codex also records the model-side
      // `response_item/message` stream, which disagrees with this one — it
      // carries injected `developer` turns a person never sent.
      if (line.type === "event_msg") {
        const kind = line.payload?.type;
        if (kind === "user_message" || kind === "agent_message") {
          messageCount++;
          if (!label && kind === "user_message") {
            label = labelFromMessage(line.payload?.message);
          }
        }
      }
    }
  } catch {
    // An unreadable rollout costs one session, not the whole harvest.
    return { kind: "unusable" };
  }

  // Without a cwd there is no project to attribute the work to.
  if (!cwd) return { kind: "unusable" };

  const startedAt = firstTimestamp ? new Date(firstTimestamp) : null;
  const endedAt = lastTimestamp ? new Date(lastTimestamp) : startedAt;
  if (!startedAt || !endedAt) return { kind: "unusable" };
  if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return { kind: "unusable" };
  }

  return {
    kind: "ok",
    activity: {
      tool: "codex",
      // The filename embeds the same uuid, but the meta line is authoritative.
      sessionRef: sessionRef ?? path.basename(filePath, ".jsonl"),
      path: canonicalPath(cwd),
      displayPath: displayPath(cwd),
      startedAt,
      endedAt: endedAt >= startedAt ? endedAt : startedAt,
      activeMinutes: Math.round(activeMs / 60_000),
      messageCount,
      // Codex records no branch. Left undefined rather than guessed.
      gitBranch: undefined,
      label,
    },
  };
}
