import path from "node:path";

/**
 * Canonical form for a project path.
 *
 * Paths arrive from several places — a transcript's `cwd`, a filesystem walk,
 * a user-declared root — and they disagree about separators, trailing slashes
 * and drive-letter case. Two spellings of the same folder must collapse to one
 * key, or the registry grows a duplicate project every time a tool words it
 * differently.
 *
 * Windows is case-insensitive, so comparison is lowercased there. The *display*
 * path keeps its original casing — see `displayPath`.
 */
const isWindows = process.platform === "win32";

export function canonicalPath(input: string): string {
  if (!input) return "";

  // Transcripts store JSON-escaped Windows paths; by the time they're parsed
  // the backslashes are real, but normalise separators defensively anyway.
  let normalised = path.normalize(input.trim().replace(/\//g, path.sep));

  // Strip a trailing separator, except on a drive root ("C:\") where it's part
  // of the path.
  if (normalised.length > 3 && normalised.endsWith(path.sep)) {
    normalised = normalised.slice(0, -1);
  }

  return isWindows ? normalised.toLowerCase() : normalised;
}

/** Human-facing path — canonicalised for shape, original casing preserved. */
export function displayPath(input: string): string {
  let normalised = path.normalize(input.trim().replace(/\//g, path.sep));
  if (normalised.length > 3 && normalised.endsWith(path.sep)) {
    normalised = normalised.slice(0, -1);
  }
  return normalised;
}

/** Last segment, for naming a project without asking the user. */
export function projectNameFromPath(input: string): string {
  const cleaned = displayPath(input);
  const base = path.basename(cleaned);
  return base || cleaned;
}

/** Is `child` inside `parent` (or the same folder)? */
export function isWithin(parent: string, child: string): boolean {
  const p = canonicalPath(parent);
  const c = canonicalPath(child);
  if (p === c) return true;
  return c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}
