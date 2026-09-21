import { describe, expect, it } from "vitest";
import { shellExecutor, type ShellConfig } from "./shell";
import type { RunEvent, ExecContext } from "../engine/types";

function createContext(
  configOverrides: Partial<ShellConfig> = {},
  options: { random?: () => number; signal?: AbortSignal } = {},
): ExecContext<ShellConfig> {
  const parsedConfig = shellExecutor.configSchema.parse({
    command: "echo test",
    ...configOverrides,
  });
  return {
    config: parsedConfig,
    inputs: {},
    signal: options.signal ?? new AbortController().signal,
    nodeId: "shell-1",
    nodeRunId: "test-run:shell-1:1",
    random: options.random ?? (() => 0.5),
    secrets: {},
  };
}

async function runShellExecutor(
  ctx: ExecContext<ShellConfig>,
): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of shellExecutor.run(ctx)) {
    events.push(event);
  }
  return events;
}

describe("shellExecutor", () => {
  describe("metadata and config schema", () => {
    it("has expected metadata", () => {
      expect(shellExecutor.kind).toBe("shell");
      expect(shellExecutor.label).toBe("Shell");
      expect(shellExecutor.ports.inputs).toEqual([
        { id: "in", label: "Input", type: "any" },
      ]);
      expect(shellExecutor.ports.outputs).toEqual([
        { id: "stdout", label: "Stdout", type: "text" },
        { id: "exitCode", label: "Exit code", type: "number" },
      ]);
    });

    it("parses valid config with defaults", () => {
      const config = shellExecutor.configSchema.parse({ command: "ls -la" });
      expect(config.command).toBe("ls -la");
      expect(config.cwd).toBe(".");
      expect(config.failureRate).toBe(0);
    });

    it("rejects empty command", () => {
      expect(() => shellExecutor.configSchema.parse({ command: "" })).toThrow();
    });
  });

  describe("run execution", () => {
    it("succeeds when failureRate is 0", async () => {
      const ctx = createContext(
        { command: "npm test", failureRate: 0 },
        { random: () => 0.5 },
      );
      const events = await runShellExecutor(ctx);

      const systemLog = events.find(
        (e) => e.type === "log" && e.stream === "system",
      );
      expect(systemLog).toEqual({
        type: "log",
        stream: "system",
        text: "cwd: .",
      });

      const stdoutLogs = events.filter(
        (e) => e.type === "log" && e.stream === "stdout",
      );
      expect(stdoutLogs.length).toBeGreaterThan(0);

      const progressEvents = events.filter((e) => e.type === "progress");
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[progressEvents.length - 1]).toEqual({
        type: "progress",
        pct: 100,
      });

      const succeededEvent = events.find((e) => e.type === "succeeded");
      expect(succeededEvent).toBeDefined();
      if (succeededEvent && succeededEvent.type === "succeeded") {
        expect(succeededEvent.outputs?.exitCode).toBe(0);
        expect(typeof succeededEvent.outputs?.stdout).toBe("string");
      }

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toBeUndefined();
    });

    it("fails when random returns a value less than failureRate", async () => {
      const random = () => 0.1;
      const ctx = createContext(
        { command: "npm build", failureRate: 0.5 },
        { random },
      );

      const events = await runShellExecutor(ctx);

      const stderrLog = events.find(
        (e) => e.type === "log" && e.stream === "stderr",
      );
      expect(stderrLog).toBeDefined();
      if (stderrLog && stderrLog.type === "log") {
        expect(stderrLog.text).toMatch(/^Command failed with exit code \d$/);
      }

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toBeDefined();
      if (failedEvent && failedEvent.type === "failed") {
        expect(failedEvent.error).toMatch(/`npm build` exited with code \d/);
      }

      const succeededEvent = events.find((e) => e.type === "succeeded");
      expect(succeededEvent).toBeUndefined();
    });

    it("handles failure with exit code 2 based on random sequence", async () => {
      const ctx = createContext(
        { command: "pnpm install", failureRate: 1.0 },
        { random: () => 0.9 },
      );

      const events = await runShellExecutor(ctx);

      const stderrLog = events.find(
        (e) => e.type === "log" && e.stream === "stderr",
      );
      expect(stderrLog).toEqual({
        type: "log",
        stream: "stderr",
        text: "Command failed with exit code 2",
      });

      const failedEvent = events.find((e) => e.type === "failed");
      expect(failedEvent).toEqual({
        type: "failed",
        error: "`pnpm install` exited with code 2",
      });
    });

    it("generates default fake output lines for generic command", async () => {
      const ctx = createContext(
        { command: "my-custom-cmd --arg", failureRate: 0 },
        { random: () => 0.5 },
      );
      const events = await runShellExecutor(ctx);

      const stdoutLogs = events
        .filter((e) => e.type === "log" && e.stream === "stdout")
        .map((e) => (e.type === "log" ? e.text : ""));

      expect(stdoutLogs).toContain("$ my-custom-cmd --arg");
      expect(stdoutLogs).toContain("my-custom-cmd: ok");
    });
  });
});
