import { describe, expect, it } from "vitest";
import { aiExecutor } from "./ai";
import type { AiConfig } from "./ai";
import type { RunEvent } from "../engine/types";

async function drive(
  configOverrides: Partial<AiConfig> = {},
  options: {
    inputs?: Record<string, unknown>;
    secrets?: Record<string, string>;
    random?: () => number;
    signal?: AbortSignal;
  } = {},
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const config: AiConfig = {
    prompt: "Summarise the following: {{input}}",
    model: "claude-sonnet-5",
    temperature: 0.7,
    ...configOverrides,
  };

  const iterator = aiExecutor.run({
    config,
    inputs: options.inputs ?? {},
    secrets: options.secrets ?? {},
    signal: options.signal ?? new AbortController().signal,
    nodeId: "ai-1",
    nodeRunId: "test-run:ai-1:1",
    random: options.random ?? (() => 0),
  });

  for await (const event of iterator) {
    events.push(event);
  }
  return events;
}

describe("aiExecutor", () => {
  it("succeeds and yields expected sequence of events", async () => {
    // random => 0 picks SAMPLE[0]: "Analysed the upstream payload and found no blocking issues."
    const events = await drive(
      {
        prompt: "Analyze this: {{input}}",
        model: "claude-opus-5",
        temperature: 0.2,
      },
      {
        inputs: { in: { status: "ok" } },
        random: () => 0,
      },
    );

    const systemLogs = events.filter(
      (e) => e.type === "log" && e.stream === "system",
    );
    expect(systemLogs[0]).toEqual({
      type: "log",
      stream: "system",
      text: "claude-opus-5 · temperature 0.2",
    });
    expect(systemLogs[1]).toEqual({
      type: "log",
      stream: "system",
      text: 'Prompt: Analyze this: {"status":"ok"}',
    });

    const stdoutLogs = events.filter(
      (e) => e.type === "log" && e.stream === "stdout",
    );
    expect(stdoutLogs.map((e) => (e as { text: string }).text).join(" ")).toBe(
      "Analysed the upstream payload and found no blocking issues.",
    );

    const progressEvents = events.filter((e) => e.type === "progress");
    expect(progressEvents.length).toBe(9); // 9 words in SAMPLE[0]
    expect(progressEvents[progressEvents.length - 1]).toEqual({
      type: "progress",
      pct: 100,
    });

    const succeededEvent = events.find(
      (e): e is Extract<RunEvent, { type: "succeeded" }> =>
        e.type === "succeeded",
    );
    expect(succeededEvent).toBeDefined();
    expect(succeededEvent?.outputs).toBeDefined();
    if (succeededEvent?.outputs) {
      expect(succeededEvent.outputs.text).toBe(
        "Analysed the upstream payload and found no blocking issues.",
      );
      expect(typeof succeededEvent.outputs.tokens).toBe("number");
    }
  });

  it("replaces missing {{input}} with null", async () => {
    const events = await drive(
      { prompt: "Context: {{input}}" },
      { inputs: {}, random: () => 0 },
    );

    const promptLog = events.find(
      (e) =>
        e.type === "log" &&
        e.stream === "system" &&
        e.text.startsWith("Prompt:"),
    );
    expect(promptLog).toEqual({
      type: "log",
      stream: "system",
      text: "Prompt: Context: null",
    });
  });

  it("calculates token count using resolved secrets without logging secret values", async () => {
    const events = await drive(
      { prompt: "Key: {{secret.API_KEY}} Context: {{input}}" },
      {
        secrets: { API_KEY: "super-secret-key-12345" },
        inputs: { in: "test" },
        random: () => 0,
      },
    );

    const promptLog = events.find(
      (e) =>
        e.type === "log" &&
        e.stream === "system" &&
        e.text.startsWith("Prompt:"),
    );
    expect(promptLog).toEqual({
      type: "log",
      stream: "system",
      text: 'Prompt: Key: {{secret.API_KEY}} Context: "test"',
    });

    // Verify token count log
    const tokenLog = events.find(
      (e) =>
        e.type === "log" && e.stream === "system" && e.text.endsWith("tokens"),
    );
    expect(tokenLog).toBeDefined();

    // Resolved prompt length: 'Key: super-secret-key-12345 Context: "test"'.length = 43
    // Buffer length: "Analysed the upstream payload and found no blocking issues.".length = 59
    // Math.round(43 / 4 + 59 / 4) = Math.round(10.75 + 14.75) = Math.round(25.5) = 26
    expect(tokenLog).toEqual({
      type: "log",
      stream: "system",
      text: "26 tokens",
    });
  });

  it("selects sample responses deterministically based on ctx.random", async () => {
    const samples = [
      "Analysed the upstream payload and found no blocking issues.",
      "All checks passed; the change looks safe to promote.",
      "Two warnings surfaced, neither affecting the critical path.",
      "Summary complete — see structured output for details.",
    ];

    const randomValues = [0.0, 0.25, 0.5, 0.75];

    for (let i = 0; i < randomValues.length; i++) {
      const events = await drive(
        { prompt: "Test prompt" },
        { random: () => randomValues[i] },
      );
      const succeededEvent = events.find(
        (e): e is Extract<RunEvent, { type: "succeeded" }> =>
          e.type === "succeeded",
      );
      expect(succeededEvent).toBeDefined();
      expect(succeededEvent?.outputs).toBeDefined();
      if (succeededEvent?.outputs) {
        expect(succeededEvent.outputs.text).toBe(samples[i]);
      }
    }
  });

  it("truncates prompt system log to 200 characters", async () => {
    const longPrompt = "A".repeat(300);
    const events = await drive({ prompt: longPrompt }, { random: () => 0 });

    const promptLog = events.find(
      (e) =>
        e.type === "log" &&
        e.stream === "system" &&
        e.text.startsWith("Prompt:"),
    );
    expect(promptLog).toEqual({
      type: "log",
      stream: "system",
      text: `Prompt: ${longPrompt.slice(0, 200)}`,
    });
  });

  it("rejects when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      drive({ prompt: "Abort test" }, { signal: controller.signal }),
    ).rejects.toThrow("Aborted");
  });
});
