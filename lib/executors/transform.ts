import { z } from "zod";
import type { NodeExecutor } from "../engine/types";
import { evaluateExpression, ExpressionError } from "../engine/expr";

const configSchema = z.object({
  expression: z
    .string()
    .min(1)
    .default("input")
    .meta({
      control: "code",
      description:
        "JavaScript expression over `input`. Runs for real — it's pure.",
      placeholder: "({ ...input, ok: true })",
    }),
});

export type TransformConfig = z.infer<typeof configSchema>;

export const transformExecutor: NodeExecutor<TransformConfig> = {
  kind: "transform",
  label: "Transform",
  description: "Reshape data between steps with an expression.",
  icon: "Braces",
  accent: "violet",
  configSchema,
  ports: {
    inputs: [{ id: "in", label: "Input", type: "any" }],
    outputs: [{ id: "out", label: "Output", type: "any" }],
  },

  async *run(ctx) {
    const input = ctx.inputs.in ?? null;
    yield {
      type: "log",
      stream: "system",
      text: `Evaluating: ${ctx.config.expression}`,
    };

    try {
      const output = evaluateExpression(ctx.config.expression, input);
      yield {
        type: "log",
        stream: "stdout",
        text: JSON.stringify(output ?? null, null, 2),
      };
      yield { type: "succeeded", outputs: { out: output } };
    } catch (err) {
      const message =
        err instanceof ExpressionError ? err.message : String(err);
      yield { type: "log", stream: "stderr", text: message };
      yield { type: "failed", error: message };
    }
  },
};
