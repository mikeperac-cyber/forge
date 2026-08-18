import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/**
 * Streaming JSONL reader.
 *
 * Transcripts are large — a single Claude Code session on this machine is 8.9 MB —
 * so the whole file must never be read into memory or handed to `JSON.parse` at
 * once. Callers typically need only the first few lines and the last timestamp,
 * and can `break` out early; the generator's `finally` closes the handle.
 */

export interface JsonlStats {
  lines: number;
  parsed: number;
  /** Lines that were not valid JSON. Expected, not exceptional — see below. */
  skipped: number;
}

export function emptyStats(): JsonlStats {
  return { lines: 0, parsed: 0, skipped: 0 };
}

export async function* readJsonl<T = unknown>(
  filePath: string,
  stats?: JsonlStats,
): AsyncGenerator<T> {
  const stream = createReadStream(filePath, { encoding: "utf8" });
  // crlfDelay collapses \r\n — these files are written on Windows, and without
  // it every parsed object would carry a trailing \r.
  const lines = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (stats) stats.lines++;
      const trimmed = line.trim();
      if (!trimmed) continue;

      let value: T;
      try {
        value = JSON.parse(trimmed) as T;
      } catch {
        // A session being written right now ends mid-object. Skipping the bad
        // line keeps the rest of the transcript usable; throwing would discard
        // an entire session because its last line was half-flushed.
        if (stats) stats.skipped++;
        continue;
      }

      if (stats) stats.parsed++;
      yield value;
    }
  } finally {
    lines.close();
    stream.destroy();
  }
}

/**
 * Reads the last line of a file without walking it.
 *
 * Finding a session's end time otherwise means streaming megabytes to reach the
 * final timestamp. Reads a tail window and walks back to the last complete line.
 */
export async function readLastJsonLine<T = unknown>(
  filePath: string,
  windowBytes = 64 * 1024,
): Promise<T | null> {
  const { open, stat } = await import("node:fs/promises");

  const info = await stat(filePath);
  if (info.size === 0) return null;

  const handle = await open(filePath, "r");
  try {
    let window = windowBytes;

    // A single line can be larger than the window — tool results routinely are.
    // Grow until something parses or the whole file has been read, so a huge
    // final entry can't silently cost us the session's end time.
    for (;;) {
      const start = Math.max(0, info.size - window);
      const length = info.size - start;

      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      const text = buffer.toString("utf8");

      // Walk backwards so a half-flushed final line falls through to the last
      // complete one instead of failing.
      const candidates = text.split("\n");
      for (let i = candidates.length - 1; i >= 0; i--) {
        const trimmed = candidates[i].trim();
        if (!trimmed) continue;
        try {
          return JSON.parse(trimmed) as T;
        } catch {
          continue;
        }
      }

      if (start === 0) return null;
      window *= 4;
    }
  } finally {
    await handle.close();
  }
}
