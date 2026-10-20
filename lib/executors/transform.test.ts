import { describe, expect, it } from "vitest";
import { transformExecutor, type TransformConfig } from "./transform";
import type { ExecContext, RunEvent } from "../engine/types";

function createContext(
  configOverrides: Partial<TransformConfig> = {},
  inputs: Record<string, unknown> = {},
  signal: AbortSignal = new AbortController().signal,
): ExecContext<TransformConfig> {
  const parsedConfig = transformExecutor.configSchema.parse(configOverrides);
  return {
    config: parsedConfig,
    inputs,
    signal,
    nodeId: "transform-node-1",
    nodeRunId: "test-run:transform-node-1:1",
    random: () => 0.5,
    secrets: {},
  };
}

async function runTransformExecutor(
  ctx: ExecContext<TransformConfig>,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of transformExecutor.run(ctx)) {
    events.push(event);
  }
  return events;
}

describe("transformExecutor", () => {
  describe("configSchema", () => {
    it("provides default expression 'input' when empty object is parsed", () => {
      const config = transformExecutor.configSchema.parse({});
      expect(config.expression).toBe("input");
    });

    it("accepts a custom expression string", () => {
      const customExpr = "({ ...input, ok: true })";
      const config = transformExecutor.configSchema.parse({
        expression: customExpr,
      });
      expect(config.expression).toBe(customExpr);
    });

    it("rejects an empty expression string", () => {
      expect(() =>
        transformExecutor.configSchema.parse({ expression: "" }),
      ).toThrow();
    });
  });

  describe("metadata", () => {
    it("has expected metadata attributes", () => {
      expect(transformExecutor.kind).toBe("transform");
      expect(transformExecutor.label).toBe("Transform");
      expect(transformExecutor.description).toBe(
        "Reshape data between steps with an expression.",
      );
      expect(transformExecutor.icon).toBe("Braces");
      expect(transformExecutor.accent).toBe("violet");
      expect(transformExecutor.ports.inputs).toEqual([
        { id: "in", label: "Input", type: "any" },
      ]);
      expect(transformExecutor.ports.outputs).toEqual([
        { id: "out", label: "Output", type: "any" },
      ]);
    });
  });

  describe("run logic", () => {
    it("evaluates default expression with input and yields log and succeeded events", async () => {
      const inputVal = { name: "Alice", count: 5 };
      const ctx = createContext({}, { in: inputVal });
      const events = await runTransformExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Evaluating: input",
        },
        {
          type: "log",
          stream: "stdout",
          text: JSON.stringify(inputVal, null, 2),
        },
        {
          type: "succeeded",
          outputs: { out: inputVal },
        },
      ]);
    });

    it("evaluates custom expression transforming input object", async () => {
      const ctx = createContext(
        {
          expression:
            "({ greeting: 'Hello ' + input.name, doubleCount: input.count * 2 })",
        },
        { in: { name: "Bob", count: 21 } },
      );
      const events = await runTransformExecutor(ctx);

      const expectedOutput = { greeting: "Hello Bob", doubleCount: 42 };
      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Evaluating: ({ greeting: 'Hello ' + input.name, doubleCount: input.count * 2 })",
        },
        {
          type: "log",
          stream: "stdout",
          text: JSON.stringify(expectedOutput, null, 2),
        },
        {
          type: "succeeded",
          outputs: { out: expectedOutput },
        },
      ]);
    });

    it("defaults missing input to null when evaluating expression", async () => {
      const ctx = createContext({ expression: "input === null" }, {});
      const events = await runTransformExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Evaluating: input === null",
        },
        {
          type: "log",
          stream: "stdout",
          text: JSON.stringify(true, null, 2),
        },
        {
          type: "succeeded",
          outputs: { out: true },
        },
      ]);
    });

    it("handles undefined output from expression gracefully (formats as null in stdout log)", async () => {
      const ctx = createContext({ expression: "undefined" }, { in: 123 });
      const events = await runTransformExecutor(ctx);

      expect(events).toEqual([
        {
          type: "log",
          stream: "system",
          text: "Evaluating: undefined",
        },
        {
          type: "log",
          stream: "stdout",
          text: "null",
        },
        {
          type: "succeeded",
          outputs: { out: undefined },
        },
      ]);
    });

    it("catches ExpressionError and yields stderr log and failed event", async () => {
      const ctx = createContext({ expression: "invalid.js.expression(" }, {});
      const events = await runTransformExecutor(ctx);

      expect(events.length).toBe(3);
      expect(events[0]).toEqual({
        type: "log",
        stream: "system",
        text: "Evaluating: invalid.js.expression(",
      });

      const logEvent = events[1];
      expect(logEvent.type).toBe("log");
      if (logEvent.type === "log") {
        expect(logEvent.stream).toBe("stderr");
        expect(logEvent.text).toMatch(/syntax error/i);
      }

      const failedEvent = events[2];
      expect(failedEvent.type).toBe("failed");
      if (failedEvent.type === "failed") {
        expect(failedEvent.error).toMatch(/syntax error/i);
      }
    });

    it("catches runtime throw in expression and yields stderr log and failed event", async () => {
      const ctx = createContext(
        {
          expression:
            "(() => { throw new Error('custom runtime failure'); })()",
        },
        {},
      );
      const events = await runTransformExecutor(ctx);

      expect(events.length).toBe(3);
      expect(events[0]).toEqual({
        type: "log",
        stream: "system",
        text: "Evaluating: (() => { throw new Error('custom runtime failure'); })()",
      });
      expect(events[1]).toEqual({
        type: "log",
        stream: "stderr",
        text: "custom runtime failure",
      });
      expect(events[2]).toEqual({
        type: "failed",
        error: "custom runtime failure",
      });
    });
  });
});
