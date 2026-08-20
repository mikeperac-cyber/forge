import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { sleep } from "../engine/rng";
import { resolveSecrets } from "../secrets";

const configSchema = z.object({
  prompt: z.string().min(1).meta({
    control: "textarea",
    placeholder: "Summarise the test output in one sentence.",
    description:
      "Supports {{input}} for the upstream value and {{secret.NAME}} for a stored secret.",
  }),
  model: z
    .enum(["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5"])
    .default("claude-sonnet-5"),
  temperature: z.number().min(0).max(1).default(0.7),
});

export type AiConfig = z.infer<typeof configSchema>;

const SAMPLE = [
  "Analysed the upstream payload and found no blocking issues.",
  "All checks passed; the change looks safe to promote.",
  "Two warnings surfaced, neither affecting the critical path.",
  "Summary complete — see structured output for details.",
];

export const aiExecutor: NodeExecutor<AiConfig> = {
  kind: "ai",
  label: "AI",
  description: "Call a model with a prompt.",
  icon: "Sparkles",
  accent: "fuchsia",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Context", type: "any" }],
    outputs: [
      { id: "text", label: "Text", type: "text" },
      { id: "tokens", label: "Tokens", type: "number" },
    ],
  },

  async *run(ctx) {
    const { prompt, model, temperature } = ctx.config;
    const resolved = prompt.replace(
      /\{\{\s*input\s*\}\}/g,
      JSON.stringify(ctx.inputs.in ?? null),
    );
    // Resolved for whatever a real model call would actually send. Never
    // logged, and never used for anything but the token estimate below — a
    // {{secret.NAME}} reference in a prompt is unusual, but if one's there,
    // its value must not end up in the console any more than an HTTP
    // header's would.
    const withSecrets = resolveSecrets(resolved, ctx.secrets);

    yield {
      type: "log",
      stream: "system",
      text: `${model} · temperature ${temperature}`,
    };
    yield {
      type: "log",
      stream: "system",
      text: `Prompt: ${resolved.slice(0, 200)}`,
    };

    // Stream token by token so the console shows text arriving, not a blob.
    const reply = SAMPLE[Math.floor(ctx.random() * SAMPLE.length)];
    const words = reply.split(" ");
    let buffer = "";

    for (let i = 0; i < words.length; i++) {
      await sleep(40 + ctx.random() * 90, ctx.signal);
      buffer += (i === 0 ? "" : " ") + words[i];
      yield { type: "log", stream: "stdout", text: words[i] };
      yield {
        type: "progress",
        pct: Math.round(((i + 1) / words.length) * 100),
      };
    }

    const tokens = Math.round(withSecrets.length / 4 + buffer.length / 4);
    yield { type: "log", stream: "system", text: `${tokens} tokens` };
    yield { type: "succeeded", outputs: { text: buffer, tokens } };
  },
};
