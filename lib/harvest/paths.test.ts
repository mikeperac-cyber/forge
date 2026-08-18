import { describe, expect, it } from "vitest";
import path from "node:path";
import { canonicalPath, displayPath, isWithin, projectNameFromPath } from "./paths";

/**
 * `canonicalPath` is the project identity key: it decides whether two spellings
 * of a folder are one project or two. A bug here doesn't throw — it quietly
 * grows a duplicate project every time a tool words a path differently, and the
 * ledger splits one person's work across both. Worth pinning down.
 *
 * Written to pass on either platform: case folding is Windows-only, so the
 * expectations derive from `path.sep` and the platform rather than hardcoding
 * one machine's answers.
 */
const sep = path.sep;
const isWindows = process.platform === "win32";

/** `a/b/c` in whatever separator this platform uses. */
function p(...segments: string[]): string {
  return segments.join(sep);
}

describe("canonicalPath", () => {
  it("returns empty for empty input", () => {
    expect(canonicalPath("")).toBe("");
  });

  it("strips a trailing separator", () => {
    const withSlash = p("home", "mike", "project") + sep;
    expect(canonicalPath(withSlash)).toBe(canonicalPath(p("home", "mike", "project")));
  });

  it("trims surrounding whitespace", () => {
    expect(canonicalPath(`  ${p("home", "mike")}  `)).toBe(canonicalPath(p("home", "mike")));
  });

  it("normalises forward slashes to the platform separator", () => {
    expect(canonicalPath("home/mike/project")).toBe(canonicalPath(p("home", "mike", "project")));
  });

  it("collapses two spellings of one folder to a single key", () => {
    // The whole point: these must not become two projects.
    const a = canonicalPath("home/mike/project/");
    const b = canonicalPath(p("home", "mike", "project"));
    expect(a).toBe(b);
  });

  it("resolves . and .. segments", () => {
    expect(canonicalPath(p("home", "mike", "..", "mike", "project"))).toBe(
      canonicalPath(p("home", "mike", "project")),
    );
  });

  it.runIf(isWindows)("folds case on Windows, where paths are case-insensitive", () => {
    expect(canonicalPath("C:\\Users\\Mike\\Project")).toBe(
      canonicalPath("c:\\users\\mike\\project"),
    );
  });

  it.runIf(isWindows)("keeps the separator on a drive root", () => {
    // "C:\" is three characters and the trailing slash is part of the path —
    // stripping it would produce "C:", which means "current dir on C:".
    expect(canonicalPath("C:\\")).toBe("c:\\");
  });

  it.runIf(!isWindows)("preserves case on POSIX, where paths are case-sensitive", () => {
    expect(canonicalPath("/home/Mike")).not.toBe(canonicalPath("/home/mike"));
  });
});

describe("displayPath", () => {
  it("preserves original casing", () => {
    // canonicalPath would fold this on Windows; the display form must not.
    expect(displayPath(p("Users", "Mike", "IELTS-4-Weeks"))).toBe(
      p("Users", "Mike", "IELTS-4-Weeks"),
    );
  });

  it("still normalises shape", () => {
    expect(displayPath("Users/Mike/Project/")).toBe(p("Users", "Mike", "Project"));
  });

  it.runIf(isWindows)("differs from the canonical form only by case", () => {
    const input = "C:\\Users\\Mike\\Project";
    expect(displayPath(input)).not.toBe(canonicalPath(input));
    expect(displayPath(input).toLowerCase()).toBe(canonicalPath(input));
  });
});

describe("projectNameFromPath", () => {
  it("takes the last segment", () => {
    expect(projectNameFromPath(p("Users", "Mike", "IELTS-4-Weeks"))).toBe("IELTS-4-Weeks");
  });

  it("ignores a trailing separator", () => {
    expect(projectNameFromPath(p("Users", "Mike", "Project") + sep)).toBe("Project");
  });

  it("keeps the original casing", () => {
    expect(projectNameFromPath(p("users", "mike", "MyProject"))).toBe("MyProject");
  });

  it("falls back to the whole path when there is no segment to take", () => {
    // A drive root has no basename; returning "" would leave a nameless project.
    expect(projectNameFromPath(sep)).not.toBe("");
  });
});

describe("isWithin", () => {
  const parent = p("home", "mike", "building");

  it("counts a folder as within itself", () => {
    expect(isWithin(parent, parent)).toBe(true);
  });

  it("matches a direct child", () => {
    expect(isWithin(parent, p("home", "mike", "building", "forge"))).toBe(true);
  });

  it("matches a deeper descendant", () => {
    expect(isWithin(parent, p("home", "mike", "building", "forge", "lib"))).toBe(true);
  });

  it("rejects a sibling", () => {
    expect(isWithin(parent, p("home", "mike", "other"))).toBe(false);
  });

  it("rejects a parent of the parent", () => {
    expect(isWithin(parent, p("home", "mike"))).toBe(false);
  });

  it("rejects a sibling that merely shares a name prefix", () => {
    // The classic bug: "building" is a string prefix of "building-old", but
    // "building-old" is emphatically not inside "building".
    expect(isWithin(parent, p("home", "mike", "building-old"))).toBe(false);
  });

  it("ignores separator and casing differences between the two", () => {
    expect(isWithin("home/mike/building/", p("home", "mike", "building", "forge"))).toBe(
      true,
    );
  });
});
