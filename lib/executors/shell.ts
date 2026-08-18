import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { sleep } from "../engine/rng";

const configSchema = z.object({
  command: z
    .string()
    .min(1)
    .meta({
      control: "textarea",
      placeholder: "npm test",
      description: "Command to execute. Simulated for now.",
    }),
  cwd: z
    .string()
    .default(".")
    .meta({ label: "Working directory" }),
  failureRate: z
    .number()
    .min(0)
    .max(1)
    .default(0)
    .meta({
      label: "Simulated failure rate",
      description:
        "Chance this step fails, for exercising error paths. Ignored once real execution lands.",
    }),
});

export type ShellConfig = z.infer<typeof configSchema>;

/**
 * Plausible-looking output so the console has something to stream. The real
 * executor replaces only this function — everything around it already works.
 */
function fakeOutput(command: string, random: () => number): string[] {
  const head = command.trim().split(/\s+/)[0] ?? "sh";
  const lines = [`$ ${command}`];

  if (/test|vitest|jest/.test(command)) {
    const total = 8 + Math.floor(random() * 20);
    lines.push(`Running ${total} tests...`);
    for (let i = 0; i < Math.min(total, 5); i++) {
      lines.push(`  ✓ suite/case-${i + 1} (${(random() * 40).toFixed(0)}ms)`);
    }
    lines.push(`Tests: ${total} passed, ${total} total`);
  } else if (/build|compile|tsc/.test(command)) {
    lines.push("Compiling...");
    lines.push(`  ${(3 + random() * 40).toFixed(0)} modules transformed`);
    lines.push(`Built in ${(random() * 4 + 0.4).toFixed(2)}s`);
  } else if (/install|npm i\b|pnpm|yarn/.test(command)) {
    lines.push(`added ${Math.floor(random() * 300) + 20} packages`);
    lines.push("found 0 vulnerabilities");
  } else {
    lines.push(`${head}: ok`);
  }

  return lines;
}

export const shellExecutor: NodeExecutor<ShellConfig> = {
  kind: "shell",
  label: "Shell",
  description: "Run a shell command.",
  icon: "Terminal",
  accent: "amber",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Input", type: "any" }],
    outputs: [
      { id: "stdout", label: "Stdout", type: "text" },
      { id: "exitCode", label: "Exit code", type: "number" },
    ],
  },

  async *run(ctx) {
    const { command, cwd, failureRate } = ctx.config;
    yield { type: "log", stream: "system", text: `cwd: ${cwd}` };

    const lines = fakeOutput(command, ctx.random);
    for (let i = 0; i < lines.length; i++) {
      await sleep(90 + ctx.random() * 220, ctx.signal);
      yield { type: "log", stream: "stdout", text: lines[i] };
      yield { type: "progress", pct: Math.round(((i + 1) / lines.length) * 100) };
    }

    if (ctx.random() < failureRate) {
      const code = 1 + Math.floor(ctx.random() * 2);
      yield { type: "log", stream: "stderr", text: `Command failed with exit code ${code}` };
      yield { type: "failed", error: `\`${command}\` exited with code ${code}` };
      return;
    }

    yield {
      type: "succeeded",
      outputs: { stdout: lines.join("\n"), exitCode: 0 },
    };
  },
};
