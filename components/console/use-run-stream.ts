"use client";

import { useEffect, useRef, useState } from "react";
import type { RunStatus } from "@/lib/engine/types";

export interface LogEntry {
  seq: number;
  nodeId: string;
  stream: string;
  text: string;
  at: number;
}

export interface RunStreamState {
  logs: LogEntry[];
  nodeStatuses: Record<string, RunStatus>;
  progress: Record<string, number>;
  status: RunStatus | null;
  error: string | null;
  replaying: boolean;
  /** True once the buffer has dropped older lines. */
  truncated: boolean;
}

/**
 * Keep memory and render cost bounded on chatty runs.
 *
 * Paired with `REPLAY_LIMIT` in `data/runs.ts`, which caps how much backlog the
 * stream sends. Raising this without raising that just leaves headroom nothing
 * fills; raising that without raising this ships lines straight into the trim.
 */
const MAX_LOGS = 5000;
/** Trim in chunks so the amortised cost per line stays O(1). */
const TRIM_CHUNK = 500;

const EMPTY: RunStreamState = {
  logs: [],
  nodeStatuses: {},
  progress: {},
  status: null,
  error: null,
  replaying: true,
  truncated: false,
};

/** What a run looks like between being asked for and its first event. */
const STARTING: RunStreamState = { ...EMPTY, status: "running" };

/**
 * State plus the run it describes.
 *
 * Tagging it is what lets the hook tell "no events yet" from "events belonging
 * to the run you were looking at a moment ago" — without that, switching runs
 * shows the previous one's logs until the next flush lands.
 */
interface TaggedState extends RunStreamState {
  runId: string | null;
}

/**
 * Subscribes to a run's event stream.
 *
 * Two things keep this cheap under load. Log lines are *pushed* into a mutable
 * buffer rather than rebuilt with a spread per event — the naive version is
 * O(n) per line and so O(n²) across a run. And state is flushed on an interval
 * rather than per event, because a burst of a hundred lines should cost one
 * render, not a hundred.
 *
 * The buffer is copied once at flush time, so consumers still get a fresh array
 * reference and their `useMemo`s invalidate correctly.
 */
export function useRunStream(runId: string | null): RunStreamState {
  const [state, setState] = useState<TaggedState>({ ...EMPTY, runId: null });

  const logs = useRef<LogEntry[]>([]);
  const meta = useRef<Omit<RunStreamState, "logs">>(EMPTY);
  const dirty = useRef(false);

  useEffect(() => {
    // Buffers belong to one run. Resetting them here is a ref write inside an
    // effect, which is fine; the *state* reset that used to sit alongside is
    // gone, handled by the tag check at the end instead.
    logs.current = [];
    meta.current = runId ? STARTING : EMPTY;
    dirty.current = Boolean(runId);

    if (!runId) return;

    const source = new EventSource(`/api/runs/${runId}/stream`);

    source.onmessage = (message) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(message.data);
      } catch {
        return;
      }

      switch (event.type) {
        case "node:log": {
          logs.current.push({
            seq: Number(event.seq ?? 0),
            nodeId: String(event.nodeId ?? ""),
            stream: String(event.stream ?? "stdout"),
            text: String(event.text ?? ""),
            at: Number(event.at ?? Date.now()),
          });

          if (logs.current.length > MAX_LOGS + TRIM_CHUNK) {
            logs.current.splice(0, TRIM_CHUNK);
            meta.current = { ...meta.current, truncated: true };
          }
          break;
        }

        case "node:started":
          meta.current = {
            ...meta.current,
            nodeStatuses: {
              ...meta.current.nodeStatuses,
              [String(event.nodeId)]: "running",
            },
          };
          break;

        case "node:progress":
          meta.current = {
            ...meta.current,
            progress: {
              ...meta.current.progress,
              [String(event.nodeId)]: Number(event.pct ?? 0),
            },
          };
          break;

        case "node:finished":
          meta.current = {
            ...meta.current,
            nodeStatuses: {
              ...meta.current.nodeStatuses,
              [String(event.nodeId)]: event.status as RunStatus,
            },
          };
          break;

        case "replay:done":
          meta.current = { ...meta.current, replaying: false };
          break;

        case "run:finished":
          meta.current = {
            ...meta.current,
            status: event.status as RunStatus,
            error: (event.error as string) ?? null,
            replaying: false,
          };
          source.close();
          break;
      }

      dirty.current = true;
    };

    source.onerror = () => {
      // EventSource auto-reconnects, which would replay from the top. The run
      // is either finished or the tab is closing, so stop instead.
      source.close();
      meta.current = { ...meta.current, replaying: false };
      dirty.current = true;
    };

    const flush = setInterval(() => {
      if (!dirty.current) return;
      dirty.current = false;
      setState({ ...meta.current, logs: logs.current.slice(), runId });
    }, 80);

    return () => {
      clearInterval(flush);
      source.close();
    };
  }, [runId]);

  // Never hand back state belonging to a different run. Until this run's first
  // flush lands, report a fresh starting state — both branches return module
  // constants, so the reference stays stable and consumers don't re-render.
  if (state.runId === runId) return state;
  return runId ? STARTING : EMPTY;
}
