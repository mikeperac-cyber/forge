import "server-only";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Read-only directory listing for the path picker.
 *
 * This is the only place in the app that touches the filesystem outside the
 * harvesters, and it holds the same rule they do: `readdir` and nothing else.
 * No write, no rename, no delete — a task list you hand a folder full of work
 * has to be incapable of damaging it.
 *
 * Entries are capped rather than streamed: a picker is for choosing a target,
 * not for reading a directory of forty thousand files, and an uncapped
 * `readdir` on such a folder would serialize all of it across the action
 * boundary.
 */

export interface BrowseEntry {
  name: string;
  /** Full path, for the next `browseDirectory` call or for selection. */
  path: string;
  kind: "file" | "folder";
}

export interface BrowseListing {
  /** Where this listing came from. */
  dir: string;
  /** Null at a filesystem root — there is nowhere above `C:\`. */
  parent: string | null;
  entries: BrowseEntry[];
  /** True when the folder holds more than `MAX_ENTRIES` things. */
  truncated: boolean;
  /** Quick jumps: home first, then the drives that exist on this machine. */
  roots: string[];
}

const MAX_ENTRIES = 500;

/**
 * Somewhere to go from anywhere. Home is always present; on Windows every
 * drive letter that actually resolves is too, because a picker that can reach
 * `C:\` but has no way back to `D:\` is a picker with a hidden half.
 */
async function listRoots(): Promise<string[]> {
  const roots = [os.homedir()];
  if (process.platform === "win32") {
    for (const letter of "CDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drive = `${letter}:\\`;
      try {
        await fs.access(drive);
        roots.push(drive);
      } catch {
        // Not mounted — nothing to offer.
      }
    }
  } else {
    roots.push(path.sep);
  }
  return [...new Set(roots)];
}

export async function browseDirectory(input?: string): Promise<BrowseListing> {
  // An empty value means "start at home": the picker's first frame, and the
  // one place a person can be assumed to know their way around.
  const dir = path.resolve(input?.trim() || os.homedir());
  const dirents = await fs.readdir(dir, { withFileTypes: true });

  const entries: BrowseEntry[] = dirents
    // Directories and plain files only. Symlinks are skipped deliberately —
    // following one can walk out of the tree that was chosen, and a picker has
    // no business resolving where it points.
    .filter((dirent) => dirent.isDirectory() || dirent.isFile())
    .map((dirent) => ({
      name: dirent.name,
      path: path.join(dir, dirent.name),
      kind: dirent.isDirectory() ? ("folder" as const) : ("file" as const),
    }))
    .sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name, undefined, {
            numeric: true,
            sensitivity: "base",
          })
        : // Folders first: navigating is the common move, opening a file is
          // the deliberate one.
          a.kind === "folder"
          ? -1
          : 1,
    );

  const parent = path.dirname(dir);

  return {
    dir,
    parent: parent === dir ? null : parent,
    entries: entries.slice(0, MAX_ENTRIES),
    truncated: entries.length > MAX_ENTRIES,
    roots: await listRoots(),
  };
}
