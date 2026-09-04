import { describe, expect, it } from "vitest";
import { startExecutor, type StartConfig } from "./start";
import type { RunEvent, ExecContext } from "../engine/types";

function createContext(
  configOverrides: Partial<StartConfig> = {},
  signal: AbortSignal = new AbortController().signal,
): ExecContext<StartConfig> {
  const parsedConfig = startExecutor.configSchema.parse(configOverrides);
  return {
    config: parsedConfig,
    inputs: {},
    signal,
    nodeId: "start-node-1",
    nodeRunId: "test-run:start-node-1:1",
    random: () => 0.5,
    secrets: {},
  };
}

async function runStartExecutor(
  ctx: ExecContext<StartConfig>,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of startExecutor.run(ctx)) {
    events.push(event);
  }
  return events;
}

describe("startExecutor", () => {
  describe("configSchema", () => {
    it("provides default payload when empty object is parsed", () => {
      const config = startExecutor.configSchema.parse({});
      expect(config.payload).toBe("{}");
    });

    it("accepts a custom string payload", () => {
      const customPayload = '{"foo": "bar"}';
      const config = startExecutor.configSchema.parse({
        payload: customPayload,
      });
      expect(config.payload).toBe(customPayload);
    });
  });

  describe("metadata", () => {
    it("has expected metadata attributes", () => {
      expect(startExecutor.kind).toBe("start");
      expect(startExecutor.label).toBe("Start");
      expect(startExecutor.ports.inputs).toEqual([]);
      expect(startExecutor.ports.outputs).toEqual([
        { id: "out", label: "Payload", type: "json" },
      ]);
    });
  });

  describe("run logic", () => {
    it("emits start log, stdout log, and succeeded event with parsed payload for default config", async () => {
      const ctx = createContext();
      const events = await runStartExecutor(ctx);

      expect(events).toEqual([
        { type: "log", stream: "system", text: "Run started" },
        { type: "log", stream: "stdout", text: "Payload: {}" },
        { type: "succeeded", outputs: { out: {} } },
      ]);
    });

    it("emits succeeded event with parsed complex JSON payload", async () => {
      const payloadObj = {
        user: "alice",
        role: "admin",
        tags: ["a", "b"],
        count: 42,
      };
      const ctx = createContext({ payload: JSON.stringify(payloadObj) });
      const events = await runStartExecutor(ctx);

      expect(events).toEqual([
        { type: "log", stream: "system", text: "Run started" },
        {
          type: "log",
          stream: "stdout",
          text: `Payload: ${JSON.stringify(payloadObj)}`,
        },
        { type: "succeeded", outputs: { out: payloadObj } },
      ]);
    });

    it("handles non-object valid JSON (e.g. array, string, number)", async () => {
      const arrayPayload = [1, 2, 3];
      const ctx = createContext({ payload: JSON.stringify(arrayPayload) });
      const events = await runStartExecutor(ctx);

      expect(events).toEqual([
        { type: "log", stream: "system", text: "Run started" },
        { type: "log", stream: "stdout", text: "Payload: [1,2,3]" },
        { type: "succeeded", outputs: { out: arrayPayload } },
      ]);
    });

    it("falls back to '{}' when ctx.config.payload is empty string", async () => {
      const ctx = createContext();
      // Force payload to be empty string to test the `|| "{}"` fallback
      ctx.config.payload = "";

      const events = await runStartExecutor(ctx);

      expect(events).toEqual([
        { type: "log", stream: "system", text: "Run started" },
        { type: "log", stream: "stdout", text: "Payload: {}" },
        { type: "succeeded", outputs: { out: {} } },
      ]);
    });

    it("emits system log and failed event when JSON is invalid", async () => {
      const invalidJson = "{ invalid json }";
      const ctx = createContext({ payload: invalidJson });
      const events = await runStartExecutor(ctx);

      expect(events.length).toBe(2);
      expect(events[0]).toEqual({
        type: "log",
        stream: "system",
        text: "Run started",
      });
      expect(events[1].type).toBe("failed");
      if (events[1].type === "failed") {
        expect(events[1].error).toContain("Trigger payload is not valid JSON:");
      }
    });

    it("rejects promptly when aborted during sleep", async () => {
      const controller = new AbortController();
      const ctx = createContext({}, controller.signal);

      const runPromise = (async () => {
        const events: RunEvent[] = [];
        for await (const event of startExecutor.run(ctx)) {
          events.push(event);
        }
        return events;
      })();

      controller.abort();

      await expect(runPromise).rejects.toThrow("Aborted");
    });
  });
});
