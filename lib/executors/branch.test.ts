import { describe, expect, it } from "vitest";
import { branchExecutor } from "./branch";
import type { RunEvent } from "../engine/types";

async function drive(
  condition: string,
  input: unknown = null,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const iterator = branchExecutor.run({
    config: { condition },
    inputs: { in: input },
    signal: new AbortController().signal,
    nodeId: "split",
    nodeRunId: "test-run:split:1",
    random: () => 0.5,
  });
  for await (const event of iterator) events.push(event);
  return events;
}

describe("branchExecutor", () => {
  it("takes the true path on a truthy condition", async () => {
    const events = await drive("input.ok", { ok: true });
    const outcome = events.find((e) => e.type === "succeeded")!;

    expect(outcome).toMatchObject({
      type: "succeeded",
      taken: ["true"],
      outputs: { true: { ok: true } },
    });
  });

  it("takes the false path on a falsy condition", async () => {
    const events = await drive("input.ok", { ok: false });
    const outcome = events.find((e) => e.type === "succeeded")!;

    expect(outcome).toMatchObject({
      type: "succeeded",
      taken: ["false"],
      outputs: { false: { ok: false } },
    });
  });

  it("treats an empty array as falsy, not merely present", async () => {
    const events = await drive("input", []);
    const outcome = events.find((e) => e.type === "succeeded")!;
    expect(outcome).toMatchObject({ taken: ["false"] });
  });

  it("treats an empty object as falsy, not merely present", async () => {
    const events = await drive("input", {});
    const outcome = events.find((e) => e.type === "succeeded")!;
    expect(outcome).toMatchObject({ taken: ["false"] });
  });

  it("treats a non-empty array or object as truthy", async () => {
    const arr = await drive("input", [1]);
    expect(arr.find((e) => e.type === "succeeded")).toMatchObject({
      taken: ["true"],
    });

    const obj = await drive("input", { a: 1 });
    expect(obj.find((e) => e.type === "succeeded")).toMatchObject({
      taken: ["true"],
    });
  });

  it("fails rather than throws on a broken expression", async () => {
    const events = await drive("this is not valid javascript(", null);
    const outcome = events.find((e) => e.type === "failed");

    expect(outcome).toBeTruthy();
    expect((outcome as Extract<RunEvent, { type: "failed" }>).error).toMatch(
      /syntax error/i,
    );
  });

  it("fails when the condition throws at evaluation time", async () => {
    const events = await drive("(() => { throw new Error('nope') })()", null);
    const outcome = events.find((e) => e.type === "failed");

    expect(outcome).toBeTruthy();
    expect((outcome as Extract<RunEvent, { type: "failed" }>).error).toBe(
      "nope",
    );
  });
});
