import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { emptyStats, readJsonl, readLastJsonLine } from "./jsonl";

const dirs: string[] = [];

async function fixture(name: string, contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "forge-jsonl-"));
  dirs.push(dir);
  const file = path.join(dir, name);
  await writeFile(file, contents, "utf8");
  return file;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const value of iter) out.push(value);
  return out;
}

afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe("readJsonl", () => {
  it("parses one object per line", async () => {
    const file = await fixture("a.jsonl", '{"n":1}\n{"n":2}\n{"n":3}\n');
    expect(await collect(readJsonl<{ n: number }>(file))).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
  });

  it("handles CRLF without leaving \\r in the values", async () => {
    // These files are written on Windows; a stray \r breaks JSON.parse and
    // would make every line look corrupt.
    const file = await fixture("crlf.jsonl", '{"s":"a"}\r\n{"s":"b"}\r\n');
    expect(await collect(readJsonl<{ s: string }>(file))).toEqual([
      { s: "a" },
      { s: "b" },
    ]);
  });

  it("skips a truncated final line instead of failing the file", async () => {
    // A session being written right now ends mid-object.
    const file = await fixture("cut.jsonl", '{"n":1}\n{"n":2}\n{"n":3,"hal');
    const stats = emptyStats();

    expect(await collect(readJsonl<{ n: number }>(file, stats))).toEqual([
      { n: 1 },
      { n: 2 },
    ]);
    expect(stats.skipped).toBe(1);
    expect(stats.parsed).toBe(2);
  });

  it("tolerates blank lines and a missing trailing newline", async () => {
    const file = await fixture("gaps.jsonl", '{"n":1}\n\n\n{"n":2}');
    expect(await collect(readJsonl<{ n: number }>(file))).toEqual([
      { n: 1 },
      { n: 2 },
    ]);
  });

  it("returns nothing for an empty file", async () => {
    const file = await fixture("empty.jsonl", "");
    expect(await collect(readJsonl(file))).toEqual([]);
  });

  it("stops reading when the caller breaks early", async () => {
    const lines = Array.from({ length: 5000 }, (_, i) => `{"n":${i}}`).join("\n");
    const file = await fixture("big.jsonl", lines);
    const stats = emptyStats();

    const seen: number[] = [];
    for await (const value of readJsonl<{ n: number }>(file, stats)) {
      seen.push(value.n);
      if (seen.length === 3) break;
    }

    expect(seen).toEqual([0, 1, 2]);
    // The whole point: breaking must not have walked all 5000 lines.
    expect(stats.lines).toBeLessThan(100);
  });
});

describe("readLastJsonLine", () => {
  it("returns the final object", async () => {
    const file = await fixture("tail.jsonl", '{"n":1}\n{"n":2}\n{"n":3}\n');
    expect(await readLastJsonLine<{ n: number }>(file)).toEqual({ n: 3 });
  });

  it("falls back past a truncated final line", async () => {
    const file = await fixture("tailcut.jsonl", '{"n":1}\n{"n":2}\n{"n":3,"ha');
    expect(await readLastJsonLine<{ n: number }>(file)).toEqual({ n: 2 });
  });

  it("grows the window when the last line is bigger than it", async () => {
    // Tool results are routinely larger than the default window. With a fixed
    // window this returns null and the session loses its end timestamp.
    const huge = "x".repeat(200_000);
    const file = await fixture(
      "huge.jsonl",
      `{"n":1}\n${JSON.stringify({ n: 2, blob: huge })}\n`,
    );

    const last = await readLastJsonLine<{ n: number; blob: string }>(file, 1024);
    expect(last?.n).toBe(2);
    expect(last?.blob).toHaveLength(200_000);
  });

  it("returns null for an empty file", async () => {
    const file = await fixture("nothing.jsonl", "");
    expect(await readLastJsonLine(file)).toBeNull();
  });
});
