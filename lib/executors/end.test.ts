import { describe, expect, it } from "vitest";
import { endExecutor, type EndConfig } from "./end";
import type { ExecContext, RunEvent } from "../engine/types";

function createContext(
  configOverrides: Partial<EndConfig> = {},
  inputs: Record<string, unknown> = {},
  signal: AbortSignal = new AbortController().signal,
): ExecContext<EndConfig> {
  const parsedConfig = endExecutor.configSchema.parse(configOverrides);
  return {
    config: parsedConfig,
    inputs,
    signal,
    nodeId: "end-node-1",
    nodeRunId: "test-run:end-node-1:1",
    random: () => 0.5,
    secrets: {},
  };
}

async function runEndExecutor(
  ctx: ExecContext<EndConfig>,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of endExecutor.run(ctx)) {
    events.push(event);
  }
  return events;
}

describe("endExecutor", () => {
  describe("configSchema", () => {
    it("provides default label 'Done' when empty object is parsed", () => {
      const config = endExecutor.configSchema.parse({});
      expect(config.label).toBe("Done");
    });

    it("accepts a custom label", () => {
      const config = endExecutor.configSchema.parse({ label: "Finished" });
      expect(config.label).toBe("Finished");
    });
  });

  describe("metadata", () => {
    it("has expected metadata attributes", () => {
      expect(endExecutor.kind).toBe("end");
      expect(endExecutor.label).toBe("End");
      expect(endExecutor.description).toBe(
        "Terminal node. Collects whatever reached it as the run result.",
      );
      expect(endExecutor.icon).toBe("CircleCheck");
      expect(endExecutor.accent).toBe("slate");
      expect(endExecutor.ports.inputs).toEqual([
        { id: "in", label: "Result", type: "any" },
      ]);
      expect(endExecutor.ports.outputs).toEqual([]);
    });
  });

  describe("run logic", () => {
    it("emits system log with default label 'Done' and succeeded event when input is defined", async () => {
      const ctx = createContext({}, { in: { status: "ok", count: 42 } });
      const events = await runEndExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: 'Done: {"status":"ok","count":42}',
        },
        {
          type: "succeeded",
          outputs: { result: { status: "ok", count: 42 } },
        },
      ]);
    });

    it("emits system log with custom label and succeeded event", async () => {
      const ctx = createContext(
        { label: "Completed Process" },
        { in: "all tasks done" },
      );
      const events = await runEndExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: 'Completed Process: "all tasks done"',
        },
        {
          type: "succeeded",
          outputs: { result: "all tasks done" },
        },
      ]);
    });

    it("handles null input by formatting as 'null'", async () => {
      const ctx = createContext({}, { in: null });
      const events = await runEndExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Done: null",
        },
        {
          type: "succeeded",
          outputs: { result: null },
        },
      ]);
    });

    it("handles missing/undefined input by falling back to null in system log", async () => {
      const ctx = createContext({}, {});
      const events = await runEndExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Done: null",
        },
        {
          type: "succeeded",
          outputs: { result: undefined },
        },
      ]);
    });

    it("handles array inputs correctly", async () => {
      const ctx = createContext({}, { in: [1, 2, "three"] });
      const events = await runEndExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: 'Done: [1,2,"three"]',
        },
        {
          type: "succeeded",
          outputs: { result: [1, 2, "three"] },
        },
      ]);
    });
  });
});
